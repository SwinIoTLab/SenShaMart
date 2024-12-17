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

  const publicKeySpan = document.getElementById("publicKey") as HTMLInputElement;
  const coinCountSpan = document.getElementById("coinCount") as HTMLInputElement;
  const status = document.getElementById("status") as HTMLDivElement;

  let currentTab = document.getElementById("brokersTab");

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
      currentTab.style.display = "none";
      tab.style.display = style;
      currentTab = tab;
    };
  };

  initTab("brokers", "grid");
  initTab("registerBroker", "block");
  initTab("pastIntegrations", "grid");
  initTab("currentIntegrations", "grid");
  currentTab.style.display = "grid";

  const refreshInfo = {
    balance: {
      onNew: [],
      onDel: [],
      onChange: [],
      vals: {}
    } as RefreshStruct<number>,
    broker: {
      onNew: [],
      onDel: [],
      onChange: [],
      vals: {}
    } as RefreshStruct<BrokerRegistration>,
    integrationsBrokering: {
      onNew: [],
      onDel: [],
      onChange: [],
      vals: {}
    } as RefreshStruct<IntegrationExpanded>,
    integrationsWitnessing: {
      onNew: [],
      onDel: [],
      onChange: [],
      vals: {}
    } as RefreshStruct<IntegrationExpanded>
  };

  let ourPubKey : string = null;

  const chainDepth = document.getElementById("chainDepth") as HTMLSpanElement;

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
    if (loaded !== true) {
      return;
    }
    if (refreshCounter !== 0) {
      status.innerHTML = "Couldn't refresh, already currently refreshing";
      return;
    }

    const updateInfo = function <T>(type: RefreshStruct<T>, newData: { [index: string]: T }) {
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
      for (const [key, _value] of Object.entries(oldData)) {
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
        if (!refreshFailed) {
          statusOK("Refresh finished at " + new Date().toTimeString());
        }

        setTimeout(() => refresh(), 1000);
      }
    };

    const refreshFetch = function<T> (type: RefreshStruct<T>, path: string) {
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

    refreshFetch(refreshInfo.broker, "/BrokerRegistration/Ours");
    refreshFetch(refreshInfo.integrationsBrokering, "/Integration/OurBrokersBrokering");
    refreshFetch(refreshInfo.integrationsWitnessing, "/Integration/OurBrokersWitnessing");
    refreshFetch(refreshInfo.balance, "/Balance/Ours");
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

  const brokersBrokers = document.getElementById("brokersBrokers") as HTMLSelectElement;
  const brokersInfo = document.getElementById("brokersInfo") as HTMLDivElement;
  const brokersInfoName = document.getElementById("brokersInfoName") as HTMLInputElement;
  const brokersInfoEndpoint = document.getElementById("brokersInfoEndpoint") as HTMLInputElement;
  const brokersInfoRDFBody = document.getElementById("brokersInfoRDFBody") as HTMLTableSectionElement;

  const brokerSetInfo = function (broker: BrokerRegistration) {
    brokersInfo.style.display = "block";
    brokersInfoName.value = broker.metadata.name;
    brokersInfoEndpoint.value = broker.metadata.endpoint;
    clearTable(brokersInfoRDFBody);
    if ("extraNodes" in broker.metadata) {
      for (const tuple of broker.metadata.extraNodes) {
        const dataRow = brokersInfoRDFBody.insertRow();

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
        const dataRow = brokersInfoRDFBody.insertRow();

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
    brokersBrokers.append(new Option(key, key));
  });
  refreshInfo.broker.onDel.push(function (key) {
    const child = brokersBrokers.namedItem(key);
    if (child !== null) {
      brokersBrokers.removeChild(child);
    }
  });
  refreshInfo.broker.onChange.push(function (key, data) {
    const child = brokersBrokers.namedItem(key);
    if (child === null) {
      return;
    }
    if (child.selected) {
      brokerSetInfo(data);
    }
  });

  brokersBrokers.oninput = function (_) {
    if (brokersBrokers.selectedIndex === -1) {
      brokersInfo.style.display = "none";
      return;
    }

    const selectedIndex = brokersBrokers.selectedIndex;
    const selectedOption = brokersBrokers.item(selectedIndex);
    const selectedBroker = refreshInfo.broker.vals[selectedOption.value];

    brokerSetInfo(selectedBroker);
  };

  //register broker

  const registerBrokerName = document.getElementById("registerBrokerName") as HTMLInputElement;
  const registerBrokerEndpoint = document.getElementById("registerBrokerEndpoint") as HTMLInputElement;
  const registerBrokerClearMetadata = document.getElementById("registerBrokerClearMetadata") as HTMLButtonElement;
  const registerBrokerMetadata = document.getElementById("registerBrokerMetadata") as HTMLInputElement;
  const registerBrokerReward = document.getElementById("registerBrokerReward") as HTMLInputElement;
  const registerBrokerGo = document.getElementById("registerBrokerGo") as HTMLButtonElement;
  const registerBrokerResult = document.getElementById("registerBrokerResult") as HTMLLabelElement;

  let registerParsedNodeMetadata = [] as NodeMetadata[];
  let registerParsedLiteralMetadata = [] as LiteralMetadata[];

  registerBrokerReward.addEventListener("change", () => {
    const parsed = Number.parseInt(registerBrokerReward.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      registerBrokerReward.value = '0';
    }
  });

  registerBrokerClearMetadata.addEventListener("click", (_) => {
    registerParsedNodeMetadata = [];
    registerParsedLiteralMetadata = [];
    registerBrokerMetadata.value = "";
  });
  registerBrokerMetadata.addEventListener('change', (_event) => {
    if (registerBrokerMetadata.files.length !== 1) {
      statusError("No file was selected");
      return;
    }
    registerBrokerMetadata.disabled = true;
    registerBrokerClearMetadata.disabled = true;

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
        registerBrokerMetadata.disabled = false;
        registerBrokerClearMetadata.disabled = false;
      } catch (ex) {
        statusError("Couldn't read file: " + ex.message);
        console.log(ex);
        registerBrokerMetadata.value = "";
        registerBrokerMetadata.disabled = false;
        registerBrokerClearMetadata.disabled = false;
      }
    };
    reader.readAsText(registerBrokerMetadata.files[0]);
  });

  registerBrokerGo.addEventListener("click", (_) => {
    registerBrokerGo.disabled = true;

    const input = {
      brokerName: registerBrokerName.value,
      endpoint: registerBrokerEndpoint.value,
      rewardAmount: Number.parseInt(registerBrokerReward.value),
      extraLiteralMetadata: undefined as LiteralMetadata[],
      extraNodeMetadata: undefined as NodeMetadata[]
    };

    if (registerParsedLiteralMetadata.length !== 0) {
      input.extraLiteralMetadata = registerParsedLiteralMetadata;
    }
    if (registerParsedNodeMetadata.length !== 0) {
      input.extraNodeMetadata = registerParsedNodeMetadata;
    }

    fetch("/BrokerRegistration/Register", {
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }).then((res) => {
      return res.json();
    }).then((res) => {
      if (!res.result) {
        statusError("Error while creating register broker transaction: " + res.reason);
        return;
      }
      registerBrokerResult.innerHTML = JSON.stringify(res.tx, null, 2);
    }).finally(() => {
      registerBrokerGo.disabled = false;
    })
  });

  //past integrations

  /*
  const pastIntegrationIntegrations = document.getElementById("pastIntegrationIntegrations") as HTMLSelectElement;
  const pastIntegrationInfo = document.getElementById("pastIntegrationInfo") as HTMLDivElement;
  const pastIntegrationInfoStarted = document.getElementById("pastIntegrationInfoStarted") as HTMLInputElement;
  const pastIntegrationInfoFinished = document.getElementById("pastIntegrationInfoFinished") as HTMLInputElement;
  const pastIntegrationInfoResult = document.getElementById("pastIntegrationInfoResult") as HTMLInputElement;
  const pastIntegrationInfoHash = document.getElementById("pastIntegrationInfoHash") as HTMLInputElement;
  const pastIntegrationInfoWitnessCount = document.getElementById("pastIntegrationInfoWitnessCount") as HTMLInputElement;
  const pastIntegrationOutputBody = document.getElementById("pastIntegrationOutputBody") as HTMLTableSectionElement;
  const pastIntegrationWitnessBody = document.getElementById("pastIntegrationWitnessBody") as HTMLTableSectionElement;

  const pastIntegrationSetInfo = function (key: string, integration: IntegrationExpanded) {
    pastIntegrationInfo.style.display = "block";

    pastIntegrationInfoStarted.value = new Date(integration.startTime).toString();
    pastIntegrationInfoHash.value = key;
    pastIntegrationInfoWitnessCount.value = String(integration.witnessCount);
    clearTable(pastIntegrationOutputBody);
    for (let i = 0; i < integration.outputs.length; ++i) {
      const dataRow = pastIntegrationOutputBody.insertRow();

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
    clearTable(pastIntegrationWitnessBody)
    for (const witness of Object.keys(integration.witnesses)) {
      const dataRow = pastIntegrationWitnessBody.insertRow();

      const witnessCell = dataRow.insertCell();
      witnessCell.style.border = "1px solid black";
      witnessCell.innerHTML = witness;
    }
  }

  //no api and therefore no refresh info for past integrations yet

  pastIntegrationIntegrations.oninput = function (_) {
    if (pastIntegrationIntegrations.selectedIndex === -1) {
      pastIntegrationInfo.style.display = "none";
      return;
    }

    const selectedIndex = pastIntegrationIntegrations.selectedIndex;
    const selectedOption = pastIntegrationIntegrations.item(selectedIndex);
    const selectedIntegration = refreshInfo.integration.vals[selectedOption.value];

    pastIntegrationSetInfo(selectedOption.value, selectedIntegration);
  };*/

  //current integrations

  const currentIntegrationIntegrations = document.getElementById("currentIntegrationIntegrations") as HTMLSelectElement;
  const currentIntegrationInfo = document.getElementById("currentIntegrationInfo") as HTMLDivElement;
  const currentIntegrationInfoStarted = document.getElementById("currentIntegrationInfoStarted") as HTMLInputElement;
  const currentIntegrationInfoHash = document.getElementById("currentIntegrationInfoHash") as HTMLInputElement;
  const currentIntegrationInfoWitnessCount = document.getElementById("currentIntegrationInfoWitnessCount") as HTMLInputElement;
  const currentIntegrationOutputBody = document.getElementById("currentIntegrationOutputBody") as HTMLTableSectionElement;
  const currentIntegrationWitnessBody = document.getElementById("currentIntegrationWitnessBody") as HTMLTableSectionElement;

  const currentIntegrationSetInfo = function (key: string, integration: IntegrationExpanded) {
    currentIntegrationInfo.style.display = "block";

    currentIntegrationInfoStarted.value = new Date(integration.startTime).toString();
    currentIntegrationInfoHash.value = key;
    currentIntegrationInfoWitnessCount.value = String(integration.witnessCount);
    clearTable(currentIntegrationOutputBody);
    for (let i = 0; i < integration.outputs.length; ++i) {
      const dataRow = currentIntegrationOutputBody.insertRow();

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
    clearTable(currentIntegrationWitnessBody)
    for (const witness of Object.keys(integration.witnesses)) {
      const dataRow = currentIntegrationWitnessBody.insertRow();

      const witnessCell = dataRow.insertCell();
      witnessCell.style.border = "1px solid black";
      witnessCell.innerHTML = witness;
    }
  }

  refreshInfo.integrationsBrokering.onNew.push(function (key, _) {
    currentIntegrationIntegrations.append(new Option(key, key));
  });
  refreshInfo.integrationsBrokering.onDel.push(function (key) {
    const child = currentIntegrationIntegrations.namedItem(key);
    if (child !== null) {
      currentIntegrationIntegrations.removeChild(child);
    }
  });
  refreshInfo.integrationsBrokering.onChange.push(function (key, data) {
    const child = currentIntegrationIntegrations.namedItem(key);
    if (child === null) {
      return;
    }
    if (child.selected) {
      currentIntegrationSetInfo(key, data);
    }
  });

  currentIntegrationIntegrations.oninput = function (_) {
    if (currentIntegrationIntegrations.selectedIndex === -1) {
      currentIntegrationInfo.style.display = "none";
      return;
    }

    const selectedIndex = currentIntegrationIntegrations.selectedIndex;
    const selectedOption = currentIntegrationIntegrations.item(selectedIndex);
    const selectedIntegration = refreshInfo.integrationsBrokering.vals[selectedOption.value];

    currentIntegrationSetInfo(selectedOption.value, selectedIntegration);
  };
}