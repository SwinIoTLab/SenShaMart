function startUI() {
  //shared

  const clearTable = (obj) => {
    while (obj.rows.length !== 0) {
      obj.deleteRow(-1);
    }
  };

  //init

  const publicKeySpan = document.getElementById("publicKey");
  const coinCountSpan = document.getElementById("coinCount");
  const status = document.getElementById("status");

  let currentTab = document.getElementById("sensorsTab");

  const initTab = function (baseName, style) {
    const buttonName = baseName + "Button";
    const button = document.getElementById(buttonName);
    if (button === null) {
      console.log("Couldn't find: " + buttonName);
      return;
    }
    const tabName = baseName + "Tab";
    const tab = document.getElementById(tabName);
    if (tab === null) {
      console.log("Couldn't find: " + tabName);
      return;
    }
    tab.style.display = "none";

    button.onclick = function (_) {
      currentTab.style.display = "none";
      tab.style.display = style;
      currentTab = tab;
    };
  };

  initTab("brokers", "grid");
  initTab("sensors", "grid");
  initTab("registerSensor", "block");
  initTab("integrations", "grid");
  currentTab.style.display = "grid";

  const refreshInfo = {
    balance: {
      onNew: [],
      onDel: [],
      onChange: [],
      vals: {}
    },
    sensor: {
      onNew: [],
      onDel: [],
      onChange: [],
      vals: {}
    },
    broker: {
      onNew: [],
      onDel: [],
      onChange: [],
      vals: {}
    },
    integration: {
      onNew: [],
      onDel: [],
      onChange: [],
      vals: {}
    }
  };

  let ourPubKey = null;

  const refreshButton = document.getElementById("refresh");
  const chainDepth = document.getElementById("chainDepth");

  let refreshCounter = 0;
  let refreshFailed = false;
  let loaded = false;

  const statusOK = function (str) {
    status.innerHTML = str;
    status.style.backgroundColor = 'lightgreen';
  };

  const statusWorking = function (str) {
    status.innerHTML = str;
    status.style.backgroundColor = 'yellow';
  };

  const statusError = function (str) {
    status.innerHTML = str;
    status.style.backgroundColor = 'red';
  };

  const refresh = function () {
    refreshButton.disabled = true;
    if (loaded !== true) {
      return;
    }
    if (refreshCounter !== 0) {
      status.innerHTML = "Couldn't refresh, already currently refreshing";
      return;
    }

    const updateInfo = (type, newData) => {
      const oldData = type.vals;
      type.vals = newData;

      for (const [key, value] of Object.entries(newData)) {
        if (!(key in oldData)) {
          for (const handler of type.onNew) {
            handler(key, value);
          }
        } else {
          for (const handler of type.onChange) {
            handler(key, value);
          }
        }
      }
      for (const [key, _] of Object.entries(oldData)) {
        if (!(key in newData)) {
          for (const handler of type.onDel) {
            handler(key);
          }
        }
      }
    };

    const fetchFinal = () => {
      refreshCounter--;
      if (refreshCounter === 0) {
        refreshButton.disabled = false;
        if (!refreshFailed) {
          statusOK("Refresh finished");
        }
      }
    };

    const refreshFetch = function (type, path) {
      fetch(path).then((res) => {
        return res.json();
      }).then((data) => {
        updateInfo(type, data);
      }).catch((err) => {
        console.log(err);
        statusError("Error: " + err.message);
        refreshFailed = true;
      }).finally(fetchFinal);
    };

    refreshCounter = 4;
    refreshFailed = false;
    statusWorking("Refreshing");

    refreshFetch(refreshInfo.sensor, "/Sensors");
    refreshFetch(refreshInfo.broker, "/Brokers");
    refreshFetch(refreshInfo.balance, "/Balances");
    fetch('/chain-length').then((res) => {
      return res.json();
    }).then((data) => {
      chainDepth.innerHTML = data;
    }).catch((err) => {
      console.log(err);
      statusError("Error: " + err.message);
      refreshFailed = true;
    }).finally(fetchFinal);
  };

  refreshButton.onclick = function (_) {
    refresh();
  };

  fetch("/public-key").then(function (res) {
    return res.json();
  }).then(function (pubKey) {
    ourPubKey = pubKey;
    publicKeySpan.innerHTML = pubKey;
    loaded = true;
    refresh();
  }).catch(function (err) {
    console.log(err);
  });

  //our balance header
  refreshInfo.balance.onNew.push(function (key, data) {
    if (key === ourPubKey) {
      coinCountSpan.innerHTML = data.balance;
    }
  });
  refreshInfo.balance.onChange.push(function (key, data) {
    if (key === ourPubKey) {
      coinCountSpan.innerHTML = data.balance;
    }
  });

  //sensors
  const sensorSensors = document.getElementById("sensorSensors");
  const sensorInfo = document.getElementById("sensorInfo");
  const sensorInfoName = document.getElementById("sensorInfoName");
  const sensorInfoCPM = document.getElementById("sensorInfoCPM");
  const sensorInfoCPKB = document.getElementById("sensorInfoCPKB");
  const sensorInfoBroker = document.getElementById("sensorInfoBroker");
  const sensorInfoRDFBody = document.getElementById("sensorInfoRDFBody");

  const sensorSetInfo = function (sensor) {
    sensorInfo.style.display = "block";
    sensorInfoName.value = sensor.metadata.name;
    sensorInfoCPM.value = sensor.metadata.costPerMinute;
    sensorInfoCPKB.value = sensor.metadata.costPerKB;
    sensorInfoBroker.value = sensor.metadata.integrationBroker;
    clearTable(sensorInfoRDFBody);
    if ("extraNodes" in sensor.metadata) {
      for (const tuple of sensor.metadata.extraNodes) {
        const dataRow = sensorInfoRDFBody.insertRow();

        const sCell = dataRow.insertCell();
        sCell.style.border = "1px solid black";
        sCell.innerHTML = tuple.s;

        const pCell = dataRow.insertCell();
        pCell.style.border = "1px solid black";
        pCell.innerHTML = tuple.p;

        const oCell = dataRow.insertCell();
        oCell.style.border = "1px solid black";
        oCell.innerHTML = tuple.o;
      }
    }
    if ("extraLiterals" in sensor.metadata) {
      for (const tuple of sensor.metadata.extraLiterals) {
        const dataRow = sensorInfoRDFBody.insertRow();

        const sCell = dataRow.insertCell();
        sCell.style.border = "1px solid black";
        sCell.innerHTML = tuple.s;

        const pCell = dataRow.insertCell();
        pCell.style.border = "1px solid black";
        pCell.innerHTML = tuple.p;

        const oCell = dataRow.insertCell();
        oCell.style.border = "1px solid black";
        oCell.innerHTML = tuple.o;
      }
    }
  }

  refreshInfo.sensor.onNew.push(function (key, _) {
    sensorSensors.append(new Option(key, key));
  });
  refreshInfo.sensor.onDel.push(function (key, _) {
    const child = sensorSensors.namedItem(key);
    if (child !== null) {
      sensorSensors.removeChild(child);
    }
  });
  refreshInfo.sensor.onChange.push(function (key, data) {
    const child = sensorSensors.namedItem(key);
    if (child === null) {
      return;
    }
    if (child.selected) {
      sensorSetInfo(data);
    }
  });

  sensorSensors.oninput = function (_) {
    if (sensorSensors.selectedIndex === -1) {
      brokerInfo.style.display = "none";
      return;
    }

    const selectedIndex = sensorSensors.selectedIndex;
    const selectedOption = sensorSensors.item(selectedIndex);
    const selectedSensor = refreshInfo.sensor.vals[selectedOption.value];

    sensorSetInfo(selectedSensor);
  };

  //register sensor
  const registerName = document.getElementById("registerName");
  const registerCPM = document.getElementById("registerCPM");
  const registerCPKB = document.getElementById("registerCPKB");
  const registerBroker = document.getElementById("registerBroker");
  const registerClearMetadata = document.getElementById("registerClearMetadata");
  const registerMetadata = document.getElementById("registerMetadata");
  registerMetadata.value = "";
  const registerReward = document.getElementById("registerReward");
  const registerGo = document.getElementById("registerGo");
  const registerResult = document.getElementById("registerResult");
  let registerParsedNodeMetadata = [];
  let registerParsedLiteralMetadata = [];

  registerCPM.addEventListener("change", () => {
    const parsed = Number.parseInt(registerCPM.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      registerCPM.value = 1;
    }
  });
  registerCPKB.addEventListener("change", () => {
    const parsed = Number.parseInt(registerCPKB.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      registerCPKB.value = 1;
    }
  });
  registerReward.addEventListener("change", () => {
    const parsed = Number.parseInt(registerReward.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      registerReward.value = 0;
    }
  });

  refreshInfo.broker.onNew.push(function (key, _) {
    registerBroker.append(new Option(key, key));
  });
  refreshInfo.broker.onDel.push(function (key, _) {
    const child = registerBroker.namedItem(key);
    if (child !== null) {
      registerBroker.removeChild(child);
    }
  });

  registerClearMetadata.addEventListener("click", (_) => {
    registerParsedNodeMetadata = [];
    registerParsedLiteralMetadata = [];
    registerMetadata.value = "";
  });
  registerMetadata.addEventListener('change', (event) => {
    if (event.target.files.length !== 1) {
      statusError("No file was selected");
      return;
    }
    registerMetadata.disabled = true;
    registerClearMetadata.disabled = true;

    const reader = new FileReader();
    reader.onload = (_) => {
      const parser = new N3.Parser();
      try {
        const tuples = parser.parse(reader.result);

        registerParsedLiteralMetadata = [];
        registerParsedNodeMetadata = [];
        for (const tuple of tuples) {
          const adding = {
            s: tuple._subject.value,
            p: tuple._predicate.value,
            o: tuple._object.value
          };

          if (tuple._object.termType === "Literal") {
            registerParsedLiteralMetadata.push(adding);
          } else {
            registerParsedNodeMetadata.push(adding);
          }
        }
        statusOK(`File was read sucessfully for ${registerParsedLiteralMetadata.length + registerParsedNodeMetadata.length} tuples`);
        registerMetadata.disabled = false;
        registerClearMetadata.disabled = false;
      } catch (ex) {
        statusError("Couldn't read file: " + ex.message);
        console.log(ex);
        registerMetadata.value = "";
        registerMetadata.disabled = false;
        registerClearMetadata.disabled = false;
      }
    };
    reader.readAsText(event.target.files[0]);
  });

  registerGo.addEventListener("click", (_) => {
    if (registerBroker.selectedIndex === -1) {
      statusError("No broker selected");
      return;
    }

    registerGo.disabled = true;

    const input = {
      sensorName: registerName.value,
      costPerMinute: Number.parseInt(registerCPM.value),
      costPerKB: Number.parseInt(registerCPKB.value),
      integrationBroker: registerBroker.item(registerBroker.selectedIndex).value,
      rewardAmount: Number.parseInt(registerReward.value),
    };

    if (registerParsedLiteralMetadata.length !== 0) {
      input.extraLiteralMetadata = registerParsedLiteralMetadata;
    }
    if (registerParsedNodeMetadata.length !== 0) {
      input.extraNodeMetadata = registerParsedNodeMetadata;
    }

    fetch("/sensorregistration", {
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }).then((res) => {
      return res.json();
    }).then((res) => {
      if (!res.result) {
        statusError("Error while creating register sensor transaction: " + res.reason);
        return;
      }
      registerResult.innerHTML = JSON.stringify(res.tx,null,2);
    }).finally(() => {
      registerGo.disabled = false;
    })
  });
}