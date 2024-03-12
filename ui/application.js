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

  let currentTab = document.getElementById("freeformQuery");

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

  initTab("freeformQuery", "block");
  initTab("integrate", "block");
  initTab("pastIntegrations", "grid");
  initTab("currentIntegrations", "grid");
  currentTab.style.display = "block";

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
        for (const [key, _value] of Object.entries(obj)) {
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

  //integrate
  const integrateSensors = document.getElementById("integrateSensors");
  const integrateInfo = document.getElementById("integrateInfo");
  const integrateInfoName = document.getElementById("integrateInfoName");
  const integrateInfoCPM = document.getElementById("integrateInfoCPM");
  const integrateInfoCPKB = document.getElementById("integrateInfoCPKB");
  const integrateInfoBroker = document.getElementById("integrateInfoBroker");
  const integrateInfoAmountLabel = document.getElementById("integrateInfoAmountLabel");
  const integrateInfoAmount = document.getElementById("integrateInfoAmount");
  const integrateDeselect = document.getElementById("integrateDeselect");
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
    integrateInfo.style.display = "block";
  };

  refreshInfo.sensor.onDel.push((key, _data) => {
    const child = integrateSensors.namedItem(key);
    if (child !== null) {
      integrateSensors.removeChild(child);
    }
    if (integrateCreatedOutputs.has(key)) {
      const found = integrateCreatedOutputs.get(key);
      found.option.style.color = "red";
      if (!found.modified) {
        integrateModifiedCount++;
        integrateGo.disabled = true;
        found.modified = true;
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
        integrateSetInfo({ sensor: key });
      }
    }

  });

  integrateSensors.addEventListener("input", (_) => {
    if (integrateSensors.selectedIndex === -1) {
        integrateInfo.style.display = "none";
        integrateSelectedSensor = null;
        return;
      }

    integrateSetInfo({
      sensor: integrateSensors.item(integrateSensors.selectedIndex).value
    });
  });
  integrateDeselect.addEventListener("click", (_) => {
    if (integrateSensors.selectedIndex === -1) {
      statusError("No sensor selected");
      return -1;
    }

    const sensorName = integrateSensors.item(integrateSensors.selectedIndex).value;

    const found = integrateCreatedOutputs.get(sensorName);
    integrateSensors.removeChild(found.option);

    integrateCreatedOutputs.delete(sensorName);

    integrateInfo.style.display = "none";
    integrateSelectedSensor = null;
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
}