function startSenshamartDemoUI() {
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

  initTab("sensors", "grid");
  initTab("registerSensor", "block");
  initTab("integrate", "block");
  initTab("freeformQuery", "block");
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
      for (const [key, value] of Object.entries(oldData)) {
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

  refreshInfo.sensor.onNew.push(function (key, data) {
    sensorSensors.append(new Option(key, key));
  });
  refreshInfo.sensor.onDel.push(function (key, data) {
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

  refreshInfo.broker.onNew.push(function (key, data) {
    registerBroker.append(new Option(key, key));
  });
  refreshInfo.broker.onDel.push(function (key, data) {
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

  //integrate
  const integrateAdd = document.getElementById("integrateAdd");
  const integrateAddSensors = document.getElementById("integrateAddSensors");
  const integrateRemove = document.getElementById("integrateRemove");
  const integrateRemoveSensors = document.getElementById("integrateRemoveSensors");
  const integrateInfo = document.getElementById("integrateInfo");
  const integrateInfoName = document.getElementById("integrateInfoName");
  const integrateInfoCPM = document.getElementById("integrateInfoCPM");
  const integrateInfoCPKB = document.getElementById("integrateInfoCPKB");
  const integrateInfoBroker = document.getElementById("integrateInfoBroker");
  const integrateInfoAmountLabel = document.getElementById("integrateInfoAmountLabel");
  const integrateInfoAmount = document.getElementById("integrateInfoAmount");
  const integrateAcceptModifications = document.getElementById("integrateAcceptModifications");
  const integrateReward = document.getElementById("integrateReward");
  const integrateGo = document.getElementById("integrateGo");
  const integrateResult = document.getElementById("integrateResult");
  const integrateConnectInfoBody = document.getElementById("integrateConnectInfoBody");

  let integrateSelectedSensor = null;
  let integrateModifiedCount = 0;
  const integrateCreatedOutputs = new Map();

  const integrateSetInfo = (sensorInfo) => {
    const sensor = refreshInfo.sensor.vals[sensorInfo.sensor];
    integrateSelectedSensor = sensor.metadata.name;
    integrateInfoName.value = sensor.metadata.name;
    integrateInfoCPM.value = sensor.metadata.costPerMinute;
    integrateInfoCPKB.value = sensor.metadata.costPerKB;
    integrateInfoBroker.value = sensor.metadata.integrationBroker;
    if ("amount" in sensorInfo) {
      integrateInfoAmountLabel.style.display = "block";
      integrateInfoAmount.style.display = "block";
      integrateInfoAmount.value = sensorInfo.amount;
    } else {
      integrateInfoAmountLabel.style.display = "none";
      integrateInfoAmount.style.display = "none";
    }
    if ("modified" in sensorInfo && sensorInfo.modified) {
      integrateAcceptModifications.style.display = "block";
    } else {
      integrateAcceptModifications.style.display = "none";
    }
    integrateInfo.style.display = "block";
  };

  refreshInfo.sensor.onNew.push((key, data) => {
    if (!integrateCreatedOutputs.has(key)) {
      integrateAddSensors.append(new Option(key, key));
    }
  });
  refreshInfo.sensor.onDel.push((key, data) => {
    const child = integrateAddSensors.namedItem(key);
    if (child !== null) {
      integrateAddSensors.removeChild(child);
    }
    if (integrateCreatedOutputs.has(key)) {
      const found = integrateCreatedOutputs.get(key);
      found.option.style.color = "red";
      if (!found.modified) {
        integrateModifiedCount++;
        integrateGo.disabled = true;
        found.modified = true;
      }

      if (integrateSelectedSensor === key) {
        integrateAcceptModifications.style.display = "block";
      }
    }
  });
  refreshInfo.sensor.onChange.push((key, data) => {
    if (integrateCreatedOutputs.has(key)) {
      const found = integrateCreatedOutputs.get(key);
      if (found.hash !== data.hash) {
        found.hash = data.hash;
        if (!found.modified) {
          found.option.style.color = "orange";
          integrateModifiedCount++;
          integrateGo.disabled = true;
          found.modified = true;
        }
        if (integrateSelectedSensor === key) {
          integrateSetInfo(found);
        }
      }
    } else {
      if (integrateSelectedSensor === key) {
        integrateSetInfo({ name: key });
      }
    }

  });

  integrateAdd.addEventListener("click", (_) => {
    if (integrateAddSensors.selectedIndex === -1) {
      statusError("No sensor selected");
      return -1;
    }

    const sensorName = integrateAddSensors.item(integrateAddSensors.selectedIndex).value;

    if (integrateCreatedOutputs.has(sensorName)) {
      return;
    }

    const created = {
      option: new Option(sensorName, sensorName),
      amount: 1,
      sensor: sensorName,
      hash: refreshInfo.sensor.vals[sensorName].hash
    };

    integrateCreatedOutputs.set(sensorName, created);

    integrateAddSensors.remove(integrateAddSensors.selectedIndex);
    integrateRemoveSensors.append(created.option);
    integrateRemoveSensors.selectedIndex = integrateRemoveSensors.options.length - 1;
    integrateRemoveSensors.focus();
    integrateSetInfo(created);
  });
  integrateAddSensors.addEventListener("input", (_) => {
    if (integrateAddSensors.selectedIndex === -1) {
        integrateInfo.style.display = "none";
        integrateSelectedSensor = null;
        return;
      }

    integrateSetInfo({
      sensor: integrateAddSensors.item(integrateAddSensors.selectedIndex).value
    });
  });
  integrateAddSensors.addEventListener("focus", (_) => {
    if (integrateAddSensors.selectedIndex !== -1) {
      integrateSetInfo({
        sensor: integrateAddSensors.item(integrateAddSensors.selectedIndex).value
      });
    }
  });
  integrateRemove.addEventListener("click", (_) => {
    if (integrateRemoveSensors.selectedIndex === -1) {
      statusError("No sensor selected");
      return -1;
    }

    const sensorName = integrateRemoveSensors.item(integrateRemoveSensors.selectedIndex).value;

    const found = integrateCreatedOutputs.get(sensorName);
    integrateRemoveSensors.removeChild(found.option);
    integrateAddSensors.append(new Option(sensorName, sensorName));
    integrateAddSensors.selectedIndex = integrateAddSensors.options.length - 1;
    integrateAddSensors.focus();

    integrateCreatedOutputs.delete(sensorName);
    integrateSetInfo({ sensor: sensorName });
  });
  integrateRemoveSensors.addEventListener("input", (_) => {
    if (integrateRemoveSensors.selectedIndex === -1) {
      integrateInfo.style.display = "none";
      integrateSelectedSensor = null;
      return;
    }

    const found = integrateCreatedOutputs.get(integrateRemoveSensors.item(integrateRemoveSensors.selectedIndex).value);

    integrateSetInfo(found);
  });
  integrateRemoveSensors.addEventListener("focus", (_) => {
    if (integrateRemoveSensors.selectedIndex !== -1) {
      const found = integrateCreatedOutputs.get(integrateRemoveSensors.item(integrateRemoveSensors.selectedIndex).value);

      integrateSetInfo(found);
    }
  });
  integrateInfoAmount.addEventListener("change", (_) => {
    const parsed = Number.parseInt(integrateInfoAmount.value, 10);
    const found = integrateCreatedOutputs.get(integrateSelectedSensor);
    if (Number.isNaN(parsed) || parsed < 1) {
      integrateInfoAmount.value = 1;
      found.amount = 1;
    } else {
      found.amount = parsed;
    }
  });
  integrateAcceptModifications.addEventListener("click", (_) => {
    if (!integrateCreatedOutputs.has(integrateSelectedSensor)) {
      return;
    }

    const found = integrateCreatedOutputs.get(integrateSelectedSensor);
    found.modified = false;
    found.option.style.color = "black";
    integrateModifiedCount--;
    integrateAcceptModifications.style.display = "none";
    if (integrateModifiedCount === 0) {
      integrateGo.disabled = false;
    }
  });
  integrateReward.addEventListener("change", () => {
    const parsed = Number.parseInt(integrateReward.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      integrateReward.value = 0;
    }
  });

  integrateGo.addEventListener("click", (_) => {
    if (integrateModifiedCount !== 0) {
      return;
    }

    const input = {
      rewardAmount: Number.parseInt(integrateReward.value),
      witnessCount: 0,
      outputs: []
    };

    for (const [name, output] of integrateCreatedOutputs.entries()) {
      const sensor = refreshInfo.sensor.vals[name];
      input.outputs.push({
        amount: output.amount,
        sensorName: name,
        sensorHash: sensor.hash,
        brokerHash: refreshInfo.broker.vals[sensor.metadata.integrationBroker].hash
      });
    }

    const forDisplayLater = [];
    for (let i = 0; i < input.outputs.length; i++) {
      const sensor = refreshInfo.sensor.vals[input.outputs[i].sensorName];
      forDisplayLater.push({
        sensor: sensor.metadata.name,
        brokerIp: refreshInfo.broker.vals[sensor.metadata.integrationBroker].metadata.endpoint,
        index: i
      });
    }

    integrateGo.disabled = true;



    fetch("/integration", {
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }).then((res) => {
      return res.json();
    }).then((res) => {
      if (!res.result) {
        statusError("Error while creating integration transaction: " + res.reason);
        return;
      }
      clearTable(integrateConnectInfoBody);
      for (const display of forDisplayLater) {
        const dataRow = integrateConnectInfoBody.insertRow();

        const sensorNameCell = dataRow.insertCell();
        sensorNameCell.border = "1px solid black";
        sensorNameCell.innerHTML = display.sensor;

        const brokerIpCell = dataRow.insertCell();
        brokerIpCell.border = "1px solid black";
        brokerIpCell.innerHTML = display.brokerIp;

        const topicCell = dataRow.insertCell();
        topicCell.border = "1px solid black";
        topicCell.innerHTML = 'out/' + res.hash + '/' +display.index;
      }
      integrateResult.innerHTML = JSON.stringify(res.tx, null, 2);
    }).finally(() => {
      integrateGo.disabled = false;
    })
  });

  //freeform query
  const freeformSelect = document.getElementById("freeformSelect");
  const freeformQuery = document.getElementById("freeformQuery");
  const freeformGo = document.getElementById("freeformGo");
  const freeformHead = document.getElementById("freeformHead");
  const freeformBody = document.getElementById("freeformBody");
  const freeformEscaper = document.createElement('textarea');
  const freeformEscape = (html) => {
    freeformEscaper.textContent = html;
    return freeformEscaper.innerHTML;
  }

  const freeformQueries = {
    "Get all camera sensors": "SELECT ?sensor ?lat ?long ?measures WHERE { ?sensor <http://www.w3.org/ns/sosa/observes> ?observes. ?sensor <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location. ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures . ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat .  ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long . ?observes <http://www.w3.org/2000/01/rdf-schema#label> \"video\"}",
    "Get all milk pressure sensors": "SELECT ?sensor ?lat ?long ?measures WHERE { ?sensor <http://www.w3.org/ns/sosa/observes> ?observes. ?sensor <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location. ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures . ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat .  ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long . ?observes <http://www.w3.org/2000/01/rdf-schema#label> \"Milk Pressure\"}",
    "Get all air temperature sensors": "SELECT ?sensor ?lat ?long ?measures WHERE { ?sensor <http://www.w3.org/ns/sosa/observes> ?observes. ?sensor <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location. ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures . ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat .  ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long . ?observes <http://www.w3.org/2000/01/rdf-schema#label> \"Air Temperature\"}",
    "Get all air humidity sensors": "SELECT ?sensor ?lat ?long ?measures WHERE { ?sensor <http://www.w3.org/ns/sosa/observes> ?observes. ?sensor <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location. ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures . ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat .  ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long . ?observes <http://www.w3.org/2000/01/rdf-schema#label> \"Relative air Humidity\"}",
    "Get all milk temperature sensors": "SELECT ?sensor ?lat ?long ?measures WHERE { ?sensor <http://www.w3.org/ns/sosa/observes> ?observes. ?sensor <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location. ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures . ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat .  ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long . ?observes <http://www.w3.org/2000/01/rdf-schema#label> \"Milk Temperature\"}",
    "Get all sensors in Australia": "SELECT ?sensor ?lat ?long ?measures WHERE { ?sensor <http://www.w3.org/ns/sosa/observes> ?observes. ?sensor <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location. ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures . ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat .  ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long . FILTER(xsd:decimal(?long) > 113.338953078 && xsd:decimal(?long) < 153.569469029 && xsd:decimal(?lat) > -43.6345972634 && xsd:decimal(?lat) < -10.6681857235)}"
  };

  const freeformOnInput = () => {
    if (freeformSelect.selectedIndex === -1) {
      return;
    }

    const selected = freeformSelect.item(freeformSelect.selectedIndex);

    freeformQuery.innerHTML = freeformEscape(freeformQueries[selected.value]);
  };

  freeformSelect.addEventListener("input", freeformOnInput);

  for (const [key, value] of Object.entries(freeformQueries)) {
    freeformSelect.append(new Option(key, key));
  }

  freeformOnInput();

  freeformGo.onclick = (_) => {
    if (freeformSelect.selectedIndex === -1) {
      statusError("No query selected");
      return;
    }

    const input = freeformQueries[freeformSelect.item(freeformSelect.selectedIndex).value];

    freeformGo.disabled = true;

    clearTable(freeformHead);
    clearTable(freeformBody);

    fetch("/sparql", {
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: input
      })
    }).then((res) => {
      return res.json();
    }).then((res) => {
      if (!res.result) {
        statusError("Error when querying: " + res.reason);
        return;
      }
      const headersSet = new Set();

      for (const obj of res.values) {
        for (const [key, value] of Object.entries(obj)) {
          if (!headersSet.has(key)) {
            headersSet.add(key);
          }
        }
      }

      const headers = new Map();
      for (const header of [...headersSet].sort()) {
        headers.set(header, headers.size);
      }

      const headerRow = freeformHead.insertRow(-1);
      const headerCells = [];
      for (var i = 0; i < headers.size; ++i) {
        const created = document.createElement('th');
        headerRow.appendChild(created);
        headerCells.push(created);
      }

      for (const [key, value] of headers) {
        headerCells[value].innerHTML = key;
      }

      for (const obj of res.values) {
        const dataRow = freeformBody.insertRow();

        const cells = [];

        for (var i = 0; i < headers.size; ++i) {
          const newCell = dataRow.insertCell();
          newCell.style.border = "1px solid black";
          cells.push(newCell);
        }

        for (const [key, value] of Object.entries(obj)) {
          cells[headers.get(key)].innerHTML = value.value;
        }
        statusOK("Finished query");
      }
    }).finally(() => {
      freeformGo.disabled = false;
    });
  };
}