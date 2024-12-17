type SensorRegistration = import('../blockchain/sensor-registration.js').default;
type BrokerRegistration = import('../blockchain/broker-registration.js').default;
type IntegrationExpanded = import('../blockchain/blockchain.js').IntegrationExpanded;
type LiteralMetadata = import('../util/chain-util.js').LiteralMetadata;
type NodeMetadata = import('../util/chain-util.js').NodeMetadata;

type RefreshCb<T> = (key: string, data: T) => void;
type DelCb = (key: string) => void;

type RefreshStruct<T> = {
  onNew: RefreshCb<T>[];
  onDel: DelCb[];
  onChange: RefreshCb<T>[];
  vals: {
    [index: string]: T;
  };
};
function startUI() {
  //shared

  const clearTable = (obj: HTMLTableSectionElement) => {
    while (obj.rows.length !== 0) {
      obj.deleteRow(-1);
    }
  };

  //init

  const publicKeySpan = document.getElementById("publicKey") as HTMLSpanElement;
  const coinCountSpan = document.getElementById("coinCount") as HTMLSpanElement;
  const status = document.getElementById("status") as HTMLDivElement;

  let currentTab = {
    button: document.getElementById("brokersButton") as HTMLButtonElement,
    pane: document.getElementById("brokersTab") as HTMLDivElement
  };

  const initTab = function (baseName: string, style: string) {
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
      currentTab.pane.style.display = "none";
      currentTab.button.style.backgroundColor = "default";

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
    } as RefreshStruct<number>,
    sensor: {
      onNew: [],
      onDel: [],
      onChange: [],
      vals: {}
    } as RefreshStruct<SensorRegistration>,
    broker: {
      onNew: [],
      onDel: [],
      onChange: [],
      vals: {}
    } as RefreshStruct<BrokerRegistration>,
    integration: {
      onNew: [],
      onDel: [],
      onChange: [],
      vals: {}
    } as RefreshStruct<IntegrationExpanded>
  };

  let ourPubKey: string = null;

  //const refreshButton = document.getElementById("refresh");
  const chainDepth = document.getElementById("chainDepth");

  let refreshCounter = 0;
  let refreshFailed = false;
  let loaded = false;

  const statusOK = function (str: string) {
    status.innerHTML = str;
    status.style.backgroundColor = 'lightgreen';
  };

  const statusWorking = function (str: string) {
    status.innerHTML = str;
    status.style.backgroundColor = 'yellow';
  };

  const statusError = function (str: string) {
    status.innerHTML = str;
    status.style.backgroundColor = 'red';
  };

  const refresh = function () {
    //refreshButton.disabled = true;
    if (loaded !== true) {
      return;
    }
    if (refreshCounter !== 0) {
      status.innerHTML = "Couldn't refresh, already currently refreshing";
      return;
    }

    const updateInfo = function<T>(type: RefreshStruct<T>, newData: { [index: string]: T }) {
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
        //refreshButton.disabled = false;
        if (!refreshFailed) {
          statusOK("Refresh finished at " + new Date().toTimeString());
        }

        setTimeout(() => refresh(), 1000);
      }
    };

    const refreshFetch = function <T>(type: RefreshStruct<T>, path: string) {
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

    refreshCounter = 5;
    refreshFailed = false;
    statusWorking("Refreshing");

    refreshFetch(refreshInfo.sensor, "/SensorRegistration/Ours");
    refreshFetch(refreshInfo.broker, "/BrokerRegistration/All");
    refreshFetch(refreshInfo.balance, "/Balance/Ours");
    refreshFetch(refreshInfo.integration, "/Integration/UsesOurSensors");
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

  //refreshButton.onclick = function (_) {
  //  refresh();
  //};

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
      coinCountSpan.innerHTML = String(data);
    }
  });
  refreshInfo.balance.onChange.push(function (key, data) {
    if (key === ourPubKey) {
      coinCountSpan.innerHTML = String(data);
    }
  });

  //brokers
  const brokerBrokers = document.getElementById("brokerBrokers") as HTMLSelectElement;
  const brokerInfo = document.getElementById("brokerInfo") as HTMLDivElement;
  const brokerInfoName = document.getElementById("brokerInfoName") as HTMLInputElement;
  const brokerInfoEndpoint = document.getElementById("brokerInfoEndpoint") as HTMLInputElement;
  const brokerInfoOwner = document.getElementById("brokerInfoOwner") as HTMLInputElement;
  const brokerInfoRDFBody = document.getElementById("brokerInfoRDFBody") as HTMLTableSectionElement;

  const brokerSetInfo = function (broker: BrokerRegistration) {
    brokerInfo.style.display = "block";
    brokerInfoName.value = broker.metadata.name;
    brokerInfoEndpoint.value = broker.metadata.endpoint;
    brokerInfoOwner.value = broker.input;
    clearTable(brokerInfoRDFBody);
    if ("extraNodes" in broker.metadata) {
      for (const tuple of broker.metadata.extraNodes) {
        const dataRow = brokerInfoRDFBody.insertRow();

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
    if ("extraLiterals" in broker.metadata) {
      for (const tuple of broker.metadata.extraLiterals) {
        const dataRow = brokerInfoRDFBody.insertRow();

        const sCell = dataRow.insertCell();
        sCell.style.border = "1px solid black";
        sCell.innerHTML = tuple.s;

        const pCell = dataRow.insertCell();
        pCell.style.border = "1px solid black";
        pCell.innerHTML = tuple.p;

        const oCell = dataRow.insertCell();
        oCell.style.border = "1px solid black";
        oCell.innerHTML = String(tuple.o);
      }
    }
  };

  refreshInfo.broker.onNew.push(function (key, _) {
    brokerBrokers.append(new Option(key, key));
  });
  refreshInfo.broker.onDel.push(function (key) {
    const child = brokerBrokers.namedItem(key);
    if (child !== null) {
      brokerBrokers.removeChild(child);
    }
  });
  refreshInfo.broker.onChange.push(function (key, data) {
    const child = brokerBrokers.namedItem(key);
    if (child === null) {
      return;
    }
    if (child.selected) {
      brokerSetInfo(data);
    }
  });

  brokerBrokers.oninput = function (_) {
    if (brokerBrokers.selectedIndex === -1) {
      brokerInfo.style.display = "none";
      return;
    }

    const selectedIndex = brokerBrokers.selectedIndex;
    const selectedOption = brokerBrokers.item(selectedIndex);
    const selectedBroker = refreshInfo.broker.vals[selectedOption.value];

    brokerSetInfo(selectedBroker);
  };

  //register sensor
  const registerName = document.getElementById("registerName") as HTMLInputElement;
  const registerCPM = document.getElementById("registerCPM") as HTMLInputElement;
  const registerCPKB = document.getElementById("registerCPKB") as HTMLInputElement;
  const registerBroker = document.getElementById("registerBroker") as HTMLSelectElement;
  const registerClearMetadata = document.getElementById("registerClearMetadata") as HTMLButtonElement;
  const registerMetadata = document.getElementById("registerMetadata") as HTMLInputElement;
  registerMetadata.value = "";
  const registerReward = document.getElementById("registerReward") as HTMLInputElement;
  const registerGo = document.getElementById("registerGo") as HTMLButtonElement;
  const registerResult = document.getElementById("registerResult") as HTMLLabelElement;
  let registerParsedNodeMetadata = [] as NodeMetadata[];
  let registerParsedLiteralMetadata = [] as LiteralMetadata[];

  registerCPM.addEventListener("change", () => {
    const parsed = Number.parseInt(registerCPM.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      registerCPM.value = '1';
    }
  });
  registerCPKB.addEventListener("change", () => {
    const parsed = Number.parseInt(registerCPKB.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      registerCPKB.value = '1';
    }
  });
  registerReward.addEventListener("change", () => {
    const parsed = Number.parseInt(registerReward.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      registerReward.value = '0';
    }
  });

  refreshInfo.broker.onNew.push(function (key, _) {
    registerBroker.append(new Option(key, key));
  });
  refreshInfo.broker.onDel.push(function (key) {
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
  registerMetadata.addEventListener('change', (_event) => {
    if (registerMetadata.files.length !== 1) {
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
    reader.readAsText(registerMetadata.files[0]);
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
      extraLiteralMetadata: undefined as LiteralMetadata[],
      extraNodeMetadata: undefined as NodeMetadata[]
    };

    if (registerParsedLiteralMetadata.length !== 0) {
      input.extraLiteralMetadata = registerParsedLiteralMetadata;
    }
    if (registerParsedNodeMetadata.length !== 0) {
      input.extraNodeMetadata = registerParsedNodeMetadata;
    }

    fetch("/sensorregistration/register", {
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

  //sensors
  const sensorSensors = document.getElementById("sensorSensors") as HTMLSelectElement;
  const sensorInfo = document.getElementById("sensorInfo") as HTMLDivElement;
  const sensorInfoName = document.getElementById("sensorInfoName") as HTMLInputElement;
  const sensorInfoCPM = document.getElementById("sensorInfoCPM") as HTMLInputElement;
  const sensorInfoCPKB = document.getElementById("sensorInfoCPKB") as HTMLInputElement;
  const sensorInfoBroker = document.getElementById("sensorInfoBroker") as HTMLInputElement;
  const sensorInfoRDFBody = document.getElementById("sensorInfoRDFBody") as HTMLTableSectionElement;

  const sensorSetInfo = function (sensor: SensorRegistration) {
    sensorInfo.style.display = "block";
    sensorInfoName.value = sensor.metadata.name;
    sensorInfoCPM.value = String(sensor.metadata.costPerMinute);
    sensorInfoCPKB.value = String(sensor.metadata.costPerKB);
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
        oCell.innerHTML = String(tuple.o);
      }
    }
  }

  refreshInfo.sensor.onNew.push(function (key, _) {
    sensorSensors.append(new Option(key, key));
  });
  refreshInfo.sensor.onDel.push(function (key) {
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
      sensorInfo.style.display = "none";
      return;
    }

    const selectedIndex = sensorSensors.selectedIndex;
    const selectedOption = sensorSensors.item(selectedIndex);
    const selectedSensor = refreshInfo.sensor.vals[selectedOption.value];

    sensorSetInfo(selectedSensor);
  };

  //integrations
  const integrationIntegrations = document.getElementById("integrationIntegrations") as HTMLSelectElement;
  const integrationInfo = document.getElementById("integrationInfo") as HTMLDivElement;
  const integrationInfoStarted = document.getElementById("integrationInfoStarted") as HTMLInputElement;
  const integrationInfoHash = document.getElementById("integrationInfoHash") as HTMLInputElement;
  const integrationInfoWitnessCount = document.getElementById("integrationInfoWitnessCount") as HTMLInputElement;
  const integrationOutputBody = document.getElementById("integrationOutputBody") as HTMLTableSectionElement;
  const integrationWitnessesBody = document.getElementById("integrationWitnessesBody") as HTMLTableSectionElement;

  const integrationSetInfo = function (key: string, integration: IntegrationExpanded) {
    integrationInfo.style.display = "block";

    integrationInfoStarted.value = new Date(integration.startTime).toString();
    integrationInfoHash.value = key;
    integrationInfoWitnessCount.value = String(integration.witnessCount);
    clearTable(integrationOutputBody);
    for (let i = 0; i < integration.outputs.length; ++i) {
      const dataRow = integrationOutputBody.insertRow();

      const nameCell = dataRow.insertCell();
      nameCell.style.border = "1px solid black";
      nameCell.innerHTML = integration.outputs[i].sensorName;

      const amountCell = dataRow.insertCell();
      amountCell.style.border = "1px solid black";
      amountCell.innerHTML = String(integration.outputs[i].amount);

      const cpkbCell = dataRow.insertCell();
      cpkbCell.style.border = "1px solid black";
      cpkbCell.innerHTML = String(integration.outputsExtra[i].sensorCostPerKB);

      const cpmCell = dataRow.insertCell();
      cpmCell.style.border = "1px solid black";
      cpmCell.innerHTML = String(integration.outputsExtra[i].sensorCostPerMin);

      const brokerCell = dataRow.insertCell();
      brokerCell.style.border = "1px solid black";
      brokerCell.innerHTML = integration.outputsExtra[i].broker;
    }
    clearTable(integrationWitnessesBody)
    for (const witness of Object.keys(integration.witnesses)) {
      const dataRow = integrationWitnessesBody.insertRow();

      const witnessCell = dataRow.insertCell();
      witnessCell.style.border = "1px solid black";
      witnessCell.innerHTML = witness;
    }
  }

  refreshInfo.integration.onNew.push(function (key, _) {
    integrationIntegrations.append(new Option(key, key));
  });
  refreshInfo.integration.onDel.push(function (key) {
    const child = integrationIntegrations.namedItem(key);
    if (child !== null) {
      integrationIntegrations.removeChild(child);
    }
  });
  refreshInfo.integration.onChange.push(function (key, data) {
    const child = integrationIntegrations.namedItem(key);
    if (child === null) {
      return;
    }
    if (child.selected) {
      integrationSetInfo(key, data);
    }
  });

  integrationIntegrations.oninput = function (_) {
    if (integrationIntegrations.selectedIndex === -1) {
      integrationInfo.style.display = "none";
      return;
    }

    const selectedIndex = integrationIntegrations.selectedIndex;
    const selectedOption = integrationIntegrations.item(selectedIndex);
    const selectedIntegration = refreshInfo.integration.vals[selectedOption.value];

    integrationSetInfo(selectedOption.value, selectedIntegration);
  };
}