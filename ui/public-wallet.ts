import { SensorList, type Visibility as SensorVisibility } from './sensorList.js';
import { BrokerList, type Visibility as BrokerVisibility } from './brokerList.js';
import type SensorRegistration  from '../blockchain/sensor-registration.js';
import type BrokerRegistration from '../blockchain/broker-registration.js';
import type { IntegrationExpanded } from '../blockchain/blockchain.js';
import type { NodeMetadata, LiteralMetadata } from '../util/chain-util.js';
import type { Output as IntegrationOutput } from '../blockchain/integration.js';
import type { ValuedResult, ResultSuccess, ResultFailure } from '../util/chain-util.js';

function isFailure(res: ResultSuccess | ResultFailure): res is ResultFailure {
  return !res.result;
}

import N3 from './n3.js';

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

const sensorNormalVisibility: SensorVisibility = {
  name: true,
  owner: false,
  CPM: true,
  CPKB: true,
  broker: false,
  RDF: false
};

const sensorExpertVisibility: SensorVisibility = {
  name: true,
  owner: true,
  CPM: true,
  CPKB: true,
  broker: true,
  RDF: true
};

const brokerNormalVisibility: BrokerVisibility = {
  name: true,
  endpoint: false,
  owner: false,
  RDF: false
};

const brokerExpertVisibility: BrokerVisibility = {
  name: true,
  endpoint: true,
  owner: true,
  RDF: true
};

export default () => {
  //shared

  const clearTable = (obj: HTMLTableSectionElement) => {
    while (obj.rows.length !== 0) {
      obj.deleteRow(-1);
    }
  };

  //init

  let expertMode = false;
  const expertModeCbs: ((expert:boolean)=>void)[] = [];

  const expertButton = document.getElementById("expertButton");

  if (expertMode) {
    expertButton.innerHTML = "Disable Expert Mode";
  } else {
    expertButton.innerHTML = "Enable Expert Mode";
  }

  expertButton.onclick = function (_) {
    expertMode = !expertMode;

    if (expertMode) {
      expertButton.innerHTML = "Disable Expert Mode";
    } else {
      expertButton.innerHTML = "Enable Expert Mode";
    }

    for (const cb of expertModeCbs) {
      cb(expertMode);
    }
  }

  const publicKeySpan = document.getElementById("publicKey") as HTMLSpanElement;
  let ourKeyPair: string = "";
  let ourPubKey: string = "";
  const onPubKeyChange = [] as (() => void)[];
  const privateKey = document.getElementById("privateKey") as HTMLInputElement;
  const coinCountSpan = document.getElementById("coinCount") as HTMLSpanElement;
  const refreshStatus = document.getElementById("refreshStatus") as HTMLDivElement;
  const operationStatus = document.getElementById("operationStatus") as HTMLDivElement;

  const noKeyPage = document.getElementById("noKeyPage") as HTMLDivElement;
  const keyPage = document.getElementById("keyPage") as HTMLDivElement;

  const onPrivateKeyChange = () => {
    privateKey.disabled = true;
    fetch('/PubKeyFor', {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        keyPair: privateKey.value
      })
    }).then((res) => {
      return res.json();
    }).then((res) => {
      if (!res.result) {
        statusError(operationStatus, "Error while getting public key for key pair");
        return;
      }
      publicKeySpan.innerHTML = res.value;
      ourKeyPair = privateKey.value;
      ourPubKey = res.value;
      for (const cb of onPubKeyChange) {
        cb();
      }
    }).finally(() => {
      privateKey.disabled = false;
    });
  };

  privateKey.addEventListener("change", onPrivateKeyChange);

  if (privateKey.value !== '') {
    onPrivateKeyChange();
  }

  let currentTab = {
    button: document.getElementById("freeformQueryButton") as HTMLButtonElement,
    pane: document.getElementById("freeformQueryTab") as HTMLDivElement
  };

  const body = document.getElementById('body') as HTMLBodyElement;

  const initTab = function (baseName: string, style: string, expert: boolean, tab?: HTMLDivElement) {
    const buttonName = baseName + "Button";
    const button = document.getElementById(buttonName) as HTMLButtonElement;
    if (button === null) {
      console.log("Couldn't find: " + buttonName);
      return;
    }
    if (expert) {
      expertModeCbs.push((expert) => {
        button.style.display = expert ? "block" : "none";
      });
      if (expertMode) {
        button.hidden = false;
      } else {
        button.hidden = true;
      }
    }
    if (tab === undefined) {
      const tabName = baseName + "Tab";
      tab = document.getElementById(tabName) as HTMLDivElement;
    }
    if (tab === null) {
      console.log("Couldn't find tab for " + baseName);
      return;
    }
    tab.style.display = "none";

    button.onclick = function (_) {
      currentTab.pane.style.display = "none";
      currentTab.button.style.backgroundColor = "default";

      tab.style.display = style;
      currentTab = {
        button: button,
        pane: tab
      };
    };
  };

  const sensors = new SensorList(sensorNormalVisibility);
  body.appendChild(sensors.parent());
  const allBrokers = new BrokerList(brokerNormalVisibility);
  body.appendChild(allBrokers.parent());
  const yourBrokers = new BrokerList(brokerNormalVisibility);
  body.appendChild(yourBrokers.parent());

  initTab("genKey", "block", true);
  initTab("yourBrokers", "grid", true, yourBrokers.parent());
  initTab("registerBroker", "grid", true);
  initTab("allBrokers", "grid", true, allBrokers.parent());
  initTab("registerSensor", "block", false);
  initTab("sensors", "grid", false, sensors.parent());
  initTab("integrationUsesOurSensors", "grid", true);
  initTab("freeformQuery", "block", false);
  initTab("integrate", "block", false);
  initTab("integrations", "grid", false);
  currentTab.pane.style.display = "block";

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
    integrationOwnedBy: {
      onNew: [],
      onDel: [],
      onChange: [],
      vals: {}
    } as RefreshStruct<IntegrationExpanded>,
    integrationUsesOwnedBy: {
      onNew: [],
      onDel: [],
      onChange: [],
      vals: {}
    } as RefreshStruct<IntegrationExpanded>
  };

  //const refreshButton = document.getElementById("refresh");
  const chainDepth = document.getElementById("chainDepth");

  let refreshCounter = 0;
  let refreshFailed = false;

  const statusOK = function (status: HTMLDivElement, str: string) {
    status.innerHTML = str;
    status.style.backgroundColor = 'lightgreen';
  };

  const statusWorking = function (status: HTMLDivElement, str: string) {
    status.innerHTML = str;
    status.style.backgroundColor = 'yellow';
  };

  const statusError = function (status: HTMLDivElement, str: string) {
    status.innerHTML = str;
    status.style.backgroundColor = 'red';
  };

  const refresh = function () {
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
          statusOK(refreshStatus, "Refresh finished at " + new Date().toTimeString());
        }

        setTimeout(() => refresh(), 1000);
      }
    };

    const refreshFetchOurs = function <T>(type: RefreshStruct<T>, path: string) {
      if (ourPubKey === undefined || ourPubKey === null || ourPubKey.length === 0) {
        fetchFinal();
        return;
      }
      fetch(path,
        {
          method: 'POST',
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            pubKey: ourPubKey
          })
        }).then((res) => {
          return res.json();
        }).then((data: ValuedResult<{ [index: string]: T }>) => {
          if (data.result === undefined) {
            throw Error("Fetched data doesn't have a result value");
          } else if (isFailure(data)) {
            throw Error("Fetched data returned failure: '" + data.reason + "'");
          }
          updateInfo(type, data.value);
        }).catch((err) => {
          console.log(err);
          statusError(refreshStatus, "Error: " + err.message);
          refreshFailed = true;
        }).finally(fetchFinal);
    };

    const refreshFetch = function <T>(type: RefreshStruct<T>, path: string) {
      fetch(path).then((res) => {
        return res.json();
      }).then((data: ValuedResult<{ [index: string]: T }>) => {
        if (data.result === undefined) {
          throw Error("Fetched data doesn't have a result value");
        } else if (isFailure(data)) {
          throw Error("Fetched data returned failure: '" + data.reason + "'");
        }
        updateInfo(type, data.value);
      }).catch((err) => {
        console.log(err);
        statusError(refreshStatus, "Error: " + err.message);
        refreshFailed = true;
      }).finally(fetchFinal);
    };

    refreshCounter = 6;
    refreshFailed = false;
    statusWorking(refreshStatus, "Refreshing");

    refreshFetchOurs(refreshInfo.sensor, "/SensorRegistration/OwnedBy");
    refreshFetch(refreshInfo.broker, "/BrokerRegistration/All");
    refreshFetchOurs(refreshInfo.balance, "/Balance");
    refreshFetchOurs(refreshInfo.integrationOwnedBy, "/Integration/OwnedBy");
    refreshFetchOurs(refreshInfo.integrationUsesOwnedBy, "/Integration/UsesOwnedBy");
    fetch('/chain-length').then((res) => {
      return res.json();
    }).then((data: ValuedResult<number>) => {
      if (data.result === undefined) {
        throw Error("Fetched data doesn't have a result value");
      } else if (isFailure(data)) {
        throw Error("Fetched data returned failure: '" + data.reason + "'");
      }
      chainDepth.innerHTML = String(data.value);
    }).catch((err) => {
      console.log(err);
      statusError(refreshStatus, "Error: " + err.message);
      refreshFailed = true;
    }).finally(fetchFinal);
  };

  statusOK(operationStatus, "Loaded");

  //noKey

  const noKeyKeyPair = document.getElementById("noKeyKeyPair") as HTMLInputElement;
  const noKeyGenKeyGo = document.getElementById("noKeyGenKeyGo") as HTMLButtonElement;

  const onNoKeyKeyPair = (keyPair: string) => {
    return fetch('/PubKeyFor', {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        keyPair: keyPair
      })
    }).then((res) => {
      return res.json();
    }).then((res) => {
      if (!res.result) {
        statusError(operationStatus, "Error while getting public key for key pair");
        return;
      }
      noKeyPage.style.display = "none";
      keyPage.style.display = "block";
      publicKeySpan.innerHTML = res.value;
      privateKey.value = keyPair;
      ourKeyPair = keyPair;
      ourPubKey = res.value;
      refresh();
      for (const cb of onPubKeyChange) {
        cb();
      }
    });
  };

  const noKeyKeyPairChange = () => {
    noKeyKeyPair.disabled = true;
    noKeyGenKeyGo.disabled = true;
    onNoKeyKeyPair(noKeyKeyPair.value).finally(() => {
      noKeyKeyPair.disabled = false;
      noKeyGenKeyGo.disabled = false;
    });
  };

  noKeyKeyPair.addEventListener("change", noKeyKeyPairChange);

  noKeyGenKeyGo.addEventListener('click', (_) => {
    noKeyGenKeyGo.disabled = true;
    noKeyKeyPair.disabled = true;
    fetch('/gen-key').then((res) => {
      return res.json();
    }).then((data) => {
      if (!data.result) {
        statusError(operationStatus, "Error while generating key pair: " + data.reason);
        return;
      }
      return onNoKeyKeyPair(data.value);
    }).finally(() => {
      noKeyGenKeyGo.disabled = false;
      noKeyKeyPair.disabled = false;
    });
  });

  if (noKeyKeyPair.value.length > 0) {
    noKeyKeyPairChange();
  }

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

  //genKey

  const genKeyGo = document.getElementById("genKeyGo") as HTMLButtonElement;
  const genKeyKeyPair = document.getElementById("genKeyKeyPair") as HTMLInputElement;

  genKeyGo.addEventListener('click', (_) => {
    genKeyGo.disabled = true;
    fetch('/gen-key').then((res) => {
      return res.json();
    }).then((data) => {
      if (!data.result) {
        statusError(operationStatus, "Error while generating key pair: " + data.reason);
        return;
      }
      genKeyKeyPair.value = data.value;
    }).finally(() => {
      genKeyGo.disabled = false;
    });
  });

  //allBrokers
  refreshInfo.broker.onNew.push(function (key, data) {
    allBrokers.onNew(key, data);
  });
  refreshInfo.broker.onDel.push(function (key) {
    allBrokers.onDel(key);
  });
  refreshInfo.broker.onChange.push(function (key, data) {
    allBrokers.onChange(key, data);
  });

  expertModeCbs.push((expert) => {
    allBrokers.setVisibility(expert ? brokerExpertVisibility : brokerNormalVisibility);
  });

  //yourBrokers

  refreshInfo.broker.onNew.push((key, data) => {
    if (data.input !== ourPubKey) {
      return;
    }
    yourBrokers.onNew(key, data);
  });
  refreshInfo.broker.onDel.push((key) => {
    yourBrokers.onDel(key);
  });
  refreshInfo.broker.onChange.push((key, data) => {
    if (data.input !== ourPubKey) {
      return;
    }
    yourBrokers.onChange(key, data);
  });
  onPubKeyChange.push(() => {
    for (const [key, broker] of Object.entries(refreshInfo.broker.vals)) {
      if (broker.input === ourPubKey) {
        yourBrokers.onNew(key, broker);
      } else {
        yourBrokers.onDel(key);
      }
    }
  });

  expertModeCbs.push((expert) => {
    yourBrokers.setVisibility(expert ? brokerExpertVisibility : brokerNormalVisibility);
  });

  //registerBroker

  const registerBrokerName = document.getElementById("registerBrokerName") as HTMLInputElement;
  const registerBrokerEndpoint = document.getElementById("registerBrokerEndpoint") as HTMLInputElement;
  const registerBrokerClearMetadata = document.getElementById("registerBrokerClearMetadata") as HTMLButtonElement;
  const registerBrokerMetadata = document.getElementById("registerBrokerMetadata") as HTMLInputElement;
  const registerBrokerReward = document.getElementById("registerBrokerReward") as HTMLInputElement;
  const registerBrokerGo = document.getElementById("registerBrokerGo") as HTMLButtonElement;
  const registerBrokerResultDiv = document.getElementById("registerBrokerResultDiv") as HTMLDivElement;
  const registerBrokerResult = document.getElementById("registerBrokerResult") as HTMLLabelElement;

  expertModeCbs.push((expert) => {
    registerBrokerResultDiv.style.display = expert ? "block" : "none";
  });

  let registerBrokerParsedNodeMetadata = [] as NodeMetadata[];
  let registerBrokerParsedLiteralMetadata = [] as LiteralMetadata[];

  registerBrokerReward.addEventListener("change", () => {
    const parsed = Number.parseInt(registerBrokerReward.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      registerBrokerReward.value = '0';
    }
  });

  registerBrokerClearMetadata.addEventListener("click", (_) => {
    registerBrokerParsedNodeMetadata = [];
    registerBrokerParsedLiteralMetadata = [];
    registerBrokerMetadata.value = "";
  });
  registerBrokerMetadata.addEventListener('change', (_event) => {
    if (registerBrokerMetadata.files.length !== 1) {
      statusError(operationStatus, "No file was selected");
      return;
    }
    registerBrokerMetadata.disabled = true;
    registerBrokerClearMetadata.disabled = true;

    const reader = new FileReader();
    reader.onload = (_) => {
      const parser = new N3.Parser();
      try {
        const tuples = parser.parse(reader.result);

        registerBrokerParsedNodeMetadata = [];
        registerBrokerParsedLiteralMetadata = [];
        for (const tuple of tuples) {
          const adding = {
            s: tuple._subject.value,
            p: tuple._predicate.value,
            o: tuple._object.value
          };

          if (tuple._object.termType === "Literal") {
            registerBrokerParsedLiteralMetadata.push(adding);
          } else {
            registerBrokerParsedNodeMetadata.push(adding);
          }
        }
        statusOK(operationStatus, `File was read sucessfully for ${registerBrokerParsedNodeMetadata.length + registerBrokerParsedLiteralMetadata.length} tuples`);
        registerBrokerMetadata.disabled = false;
        registerBrokerClearMetadata.disabled = false;
      } catch (ex) {
        statusError(operationStatus, "Couldn't read file: " + ex.message);
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
      keyPair: ourKeyPair,
      brokerName: registerBrokerName.value,
      endpoint: registerBrokerEndpoint.value,
      rewardAmount: Number.parseInt(registerBrokerReward.value),
      extraLiteralMetadata: undefined as LiteralMetadata[],
      extraNodeMetadata: undefined as NodeMetadata[]
    };

    if (registerBrokerParsedLiteralMetadata.length !== 0) {
      input.extraLiteralMetadata = registerBrokerParsedLiteralMetadata;
    }
    if (registerBrokerParsedNodeMetadata.length !== 0) {
      input.extraNodeMetadata = registerBrokerParsedNodeMetadata;
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
        statusError(operationStatus, "Error while creating register broker transaction: " + res.reason);
        return;
      }
      registerBrokerResult.innerHTML = JSON.stringify(res.tx, null, 2);
      statusOK(operationStatus, "Submitted broker registration");
    }).finally(() => {
      registerBrokerGo.disabled = false;
    })
  });

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
  const registerResultDiv = document.getElementById("registerSensorResultDiv") as HTMLDivElement;
  const registerResult = document.getElementById("registerResult") as HTMLLabelElement;

  expertModeCbs.push((expert) => {
    registerResultDiv.style.display = expert ? "block" : "none";
  });

  let registerSensorParsedNodeMetadata = [] as NodeMetadata[];
  let registerSensorParsedLiteralMetadata = [] as LiteralMetadata[];
  const registerSensorOptions = new Map<string, HTMLOptionElement>();
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

  refreshInfo.broker.onNew.push((key, _) => {
    const adding = new Option(key, key);
    registerSensorOptions.set(key, adding);
    registerBroker.append(adding);
  });
  refreshInfo.broker.onDel.push((key) => {
    if (registerSensorOptions.has(key)) {
      const child = registerSensorOptions.get(key);
      registerBroker.removeChild(child);
      registerSensorOptions.delete(key);
    }
  });

  registerClearMetadata.addEventListener("click", (_) => {
    registerSensorParsedNodeMetadata = [];
    registerSensorParsedLiteralMetadata = [];
    registerMetadata.value = "";
  });
  registerMetadata.addEventListener('change', (_event) => {
    if (registerMetadata.files.length !== 1) {
      statusError(operationStatus, "No file was selected");
      return;
    }
    registerMetadata.disabled = true;
    registerClearMetadata.disabled = true;

    const reader = new FileReader();
    reader.onload = (_) => {
      const parser = new N3.Parser();
      try {
        const tuples = parser.parse(reader.result);

        registerSensorParsedLiteralMetadata = [];
        registerSensorParsedNodeMetadata = [];
        for (const tuple of tuples) {
          const adding = {
            s: tuple._subject.value,
            p: tuple._predicate.value,
            o: tuple._object.value
          };

          if (tuple._object.termType === "Literal") {
            registerSensorParsedLiteralMetadata.push(adding);
          } else {
            registerSensorParsedNodeMetadata.push(adding);
          }
        }
        statusOK(operationStatus, `File was read sucessfully for ${registerSensorParsedLiteralMetadata.length + registerSensorParsedNodeMetadata.length} tuples`);
        registerMetadata.disabled = false;
        registerClearMetadata.disabled = false;
      } catch (ex) {
        statusError(operationStatus, "Couldn't read file: " + ex.message);
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
      statusError(operationStatus, "No broker selected");
      return;
    }

    registerGo.disabled = true;

    const input = {
      keyPair: ourKeyPair,
      sensorName: registerName.value,
      costPerMinute: Number.parseInt(registerCPM.value),
      costPerKB: Number.parseInt(registerCPKB.value),
      integrationBroker: registerBroker.item(registerBroker.selectedIndex).value,
      rewardAmount: Number.parseInt(registerReward.value),
      extraLiteralMetadata: undefined as LiteralMetadata[],
      extraNodeMetadata: undefined as NodeMetadata[]
    };

    if (registerSensorParsedLiteralMetadata.length !== 0) {
      input.extraLiteralMetadata = registerSensorParsedLiteralMetadata;
    }
    if (registerSensorParsedNodeMetadata.length !== 0) {
      input.extraNodeMetadata = registerSensorParsedNodeMetadata;
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
        statusError(operationStatus, "Error while creating register sensor transaction: " + res.reason);
        return;
      }
      registerResult.innerHTML = JSON.stringify(res.tx, null, 2);
      statusOK(operationStatus, "Submitted sensor registration");
    }).finally(() => {
      registerGo.disabled = false;
    })
  });

  //sensors
  refreshInfo.sensor.onNew.push((key, data) => {
    sensors.onNew(key, data);
  });
  refreshInfo.sensor.onDel.push((key) => {
    sensors.onDel(key);
  });
  refreshInfo.sensor.onChange.push((key, data) => {
    sensors.onChange(key, data);
  });

  expertModeCbs.push((expert) => {
    sensors.setVisibility(expert ? sensorExpertVisibility : sensorNormalVisibility);
  });

  //integrations uses our sensors

  const integrationUsesOurSensorsIntegrations = document.getElementById("integrationUsesOurSensorsIntegrations") as HTMLSelectElement;
  const integrationUsesOurSensorsInfo = document.getElementById("integrationUsesOurSensorsInfo") as HTMLDivElement;
  const integrationUsesOurSensorsInfoStarted = document.getElementById("integrationUsesOurSensorsInfoStarted") as HTMLInputElement;
  const integrationUsesOurSensorsInfoHash = document.getElementById("integrationUsesOurSensorsInfoHash") as HTMLInputElement;
  const integrationUsesOurSensorsInfoWitnessCount = document.getElementById("integrationUsesOurSensorsInfoWitnessCount") as HTMLInputElement;
  const integrationUsesOurSensorsOutputBody = document.getElementById("integrationUsesOurSensorsOutputBody") as HTMLTableSectionElement;
  //const integrationUsesOurSensorsWitnessesBody = document.getElementById("integrationUsesOurSensorsWitnessesBody") as HTMLTableSectionElement;
  const integrationUsesOurSensorsOptions = new Map<string, HTMLOptionElement>();

  const integrationUsesOurSensorsSetInfo = function (key: string, integration: IntegrationExpanded) {
    integrationUsesOurSensorsInfo.style.display = "block";

    integrationUsesOurSensorsInfoStarted.value = new Date(integration.startTime).toString();
    integrationUsesOurSensorsInfoHash.value = key;
    integrationUsesOurSensorsInfoWitnessCount.value = String(integration.witnessCount);
    clearTable(integrationUsesOurSensorsOutputBody);
    for (let i = 0; i < integration.outputs.length; ++i) {
      const dataRow = integrationUsesOurSensorsOutputBody.insertRow();

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
    //clearTable(integrationUsesOurSensorsWitnessesBody)
    //for (const witness of Object.keys(integration.witnesses)) {
    //  const dataRow = integrationUsesOurSensorsWitnessesBody.insertRow();

    //  const witnessCell = dataRow.insertCell();
    //  witnessCell.style.border = "1px solid black";
    //  witnessCell.innerHTML = witness;
    //}
  }

  refreshInfo.integrationUsesOwnedBy.onNew.push((key, _) => {
    const adding = new Option(key, key);
    integrationUsesOurSensorsOptions.set(key, adding);
    integrationUsesOurSensorsIntegrations.append(adding);
  });
  refreshInfo.integrationUsesOwnedBy.onDel.push((key) => {
    if (integrationUsesOurSensorsOptions.has(key)) {
      const child = integrationUsesOurSensorsOptions.get(key);
      integrationUsesOurSensorsIntegrations.removeChild(child);
      integrationUsesOurSensorsOptions.delete(key);
    }
  });
  refreshInfo.integrationUsesOwnedBy.onChange.push((key, data) => {
    const child = integrationUsesOurSensorsIntegrations.namedItem(key);
    if (child === null) {
      return;
    }
    if (child.selected) {
      integrationUsesOurSensorsSetInfo(key, data);
    }
  });

  integrationUsesOurSensorsIntegrations.oninput = function (_) {
    if (integrationUsesOurSensorsIntegrations.selectedIndex === -1) {
      integrationUsesOurSensorsInfo.style.display = "none";
      return;
    }

    const selectedIndex = integrationUsesOurSensorsIntegrations.selectedIndex;
    const selectedOption = integrationUsesOurSensorsIntegrations.item(selectedIndex);
    const selectedIntegration = refreshInfo.integrationUsesOwnedBy.vals[selectedOption.value];

    integrationUsesOurSensorsSetInfo(selectedOption.value, selectedIntegration);
  };

  //integrate declare

  type IntegrateSensor = {
    sensor_name: string;
    sensor_hash: string;
    broker_name: string | null;
    broker_hash: string;
    broker_endpoint: string;
    cpm: number | null;
    cpkb: number | null;
    amount: number;
    option: HTMLOptionElement;
  };

  const integrateSensorsMap = new Map<string, IntegrateSensor>();
  const integrateSensors = document.getElementById("integrateSensors") as HTMLSelectElement;

  //freeformQuery

  const freeformSelect = document.getElementById("freeformSelect") as HTMLSelectElement;
  const freeformQuery = document.getElementById("freeformQuery") as HTMLTextAreaElement;
  const freeformGo = document.getElementById("freeformGo") as HTMLButtonElement;
  const freeformAdd = document.getElementById("freeformAdd") as HTMLButtonElement;
  const freeformHead = document.getElementById("freeformHead") as HTMLTableSectionElement;
  const freeformBody = document.getElementById("freeformBody") as HTMLTableSectionElement;
  const freeformHeaders = new Map<string, number>();

  interface QueryResultSucces extends ResultSuccess {
    result: true,
    headers: string[];
    values: (string | number)[][];
  }

  let freeformCurRes: QueryResultSucces = null

  type QueryResult = QueryResultSucces | ResultFailure;

  const freeformQueries: { [index: string]: string } = {
    "Get all camera sensors":
      "SELECT ?sensor_name ?sensor_hash ?broker_name ?broker_hash ?broker_endpoint ?lat ?long ?measures ?sensor_cpm ?sensor_cpkb WHERE {\n" +
      " ?sensor_tx <SSM://Defines> ?sensor_name.\n" +
      " ?sensor_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> \"SSM://SensorRegistration\".\n" +
      " ?sensor_tx <SSM://HasHash> ?sensor_hash.\n" +
      " ?sensor_tx <SSM://UsesBroker> ?broker_name.\n" +
      " ?sensor_tx <SSM://CostsPerMinute> ?sensor_cpm.\n" +
      " ?sensor_tx <SSM://CostsPerKB> ?sensor_cpkb.\n" +
      "\n" +
      " ?broker_tx <SSM://Defines> ?broker_name.\n" +
      " ?broker_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> \"SSM://BrokerRegistration\".\n" +
      " ?broker_tx <SSM://HasHash> ?broker_hash.\n" +
      " ?broker_tx <SSM://HasEndpoint> ?broker_endpoint.\n" +
      "\n" +
      " ?sensor_tx <http://www.w3.org/ns/sosa/observes> ?observes.\n" +
      " ?sensor_tx <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location.\n" +
      " ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures.\n" +
      " ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat.\n" +
      " ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long.\n" +
      " ?observes <http://www.w3.org/2000/01/rdf-schema#label> \"video\". }",
    "Get all milk pressure sensors":
      "SELECT ?sensor_name ?sensor_hash ?broker_name ?broker_hash ?broker_endpoint ?lat ?long ?measures ?sensor_cpm ?sensor_cpkb WHERE {\n" +
      " ?sensor_tx <SSM://Defines> ?sensor_name.\n" +
      " ?sensor_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> \"SSM://SensorRegistration\".\n" +
      " ?sensor_tx <SSM://HasHash> ?sensor_hash.\n" +
      " ?sensor_tx <SSM://UsesBroker> ?broker_name.\n" +
      " ?sensor_tx <SSM://CostsPerMinute> ?sensor_cpm.\n" +
      " ?sensor_tx <SSM://CostsPerKB> ?sensor_cpkb.\n" +
      "\n" +
      " ?broker_tx <SSM://Defines> ?broker_name.\n" +
      " ?broker_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> \"SSM://BrokerRegistration\".\n" +
      " ?broker_tx <SSM://HasHash> ?broker_hash.\n" +
      " ?broker_tx <SSM://HasEndpoint> ?broker_endpoint.\n" +
      "\n" +
      " ?sensor_tx <http://www.w3.org/ns/sosa/observes> ?observes.\n" +
      " ?sensor_tx <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location.\n" +
      " ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures.\n" +
      " ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat.\n" +
      " ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long.\n" +
      " ?observes <http://www.w3.org/2000/01/rdf-schema#label> \"Milk Pressure\"}",
    "Get all air temperature sensors":
      "SELECT ?sensor_name ?sensor_hash ?broker_name ?broker_hash ?broker_endpoint ?lat ?long ?measures ?sensor_cpm ?sensor_cpkb WHERE {\n" +
      " ?sensor_tx <SSM://Defines> ?sensor_name.\n" +
      " ?sensor_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> \"SSM://SensorRegistration\".\n" +
      " ?sensor_tx <SSM://HasHash> ?sensor_hash.\n" +
      " ?sensor_tx <SSM://UsesBroker> ?broker_name.\n" +
      " ?sensor_tx <SSM://CostsPerMinute> ?sensor_cpm.\n" +
      " ?sensor_tx <SSM://CostsPerKB> ?sensor_cpkb.\n" +
      "\n" +
      " ?broker_tx <SSM://Defines> ?broker_name.\n" +
      " ?broker_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> \"SSM://BrokerRegistration\".\n" +
      " ?broker_tx <SSM://HasHash> ?broker_hash.\n" +
      " ?broker_tx <SSM://HasEndpoint> ?broker_endpoint.\n" +
      "\n" +
      " ?sensor_tx <http://www.w3.org/ns/sosa/observes> ?observes.\n" +
      " ?sensor_tx <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location.\n" +
      " ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures.\n" +
      " ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat.\n" +
      " ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long.\n" +
      " ?observes <http://www.w3.org/2000/01/rdf-schema#label> \"Air Temperature\"}",
    "Get all air humidity sensors":
      "SELECT ?sensor_name ?sensor_hash ?broker_name ?broker_hash ?broker_endpoint ?lat ?long ?measures ?sensor_cpm ?sensor_cpkb WHERE {\n" +
      " ?sensor_tx <SSM://Defines> ?sensor_name.\n" +
      " ?sensor_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> \"SSM://SensorRegistration\".\n" +
      " ?sensor_tx <SSM://HasHash> ?sensor_hash.\n" +
      " ?sensor_tx <SSM://UsesBroker> ?broker_name.\n" +
      " ?sensor_tx <SSM://CostsPerMinute> ?sensor_cpm.\n" +
      " ?sensor_tx <SSM://CostsPerKB> ?sensor_cpkb.\n" +
      "\n" +
      " ?broker_tx <SSM://Defines> ?broker_name.\n" +
      " ?broker_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> \"SSM://BrokerRegistration\".\n" +
      " ?broker_tx <SSM://HasHash> ?broker_hash.\n" +
      " ?broker_tx <SSM://HasEndpoint> ?broker_endpoint.\n" +
      "\n" +
      " ?sensor_tx <http://www.w3.org/ns/sosa/observes> ?observes.\n" +
      " ?sensor_tx <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location.\n" +
      " ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures.\n" +
      " ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat.\n" +
      " ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long.\n" +
      " ?observes <http://www.w3.org/2000/01/rdf-schema#label> \"Relative air Humidity\"}",
    "Get all milk temperature sensors":
      "SELECT ?sensor_name ?sensor_hash ?broker_name ?broker_hash ?broker_endpoint ?lat ?long ?measures ?sensor_cpm ?sensor_cpkb WHERE {\n" +
      " ?sensor_tx <SSM://Defines> ?sensor_name.\n" +
      " ?sensor_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> \"SSM://SensorRegistration\".\n" +
      " ?sensor_tx <SSM://HasHash> ?sensor_hash.\n" +
      " ?sensor_tx <SSM://UsesBroker> ?broker_name.\n" +
      " ?sensor_tx <SSM://CostsPerMinute> ?sensor_cpm.\n" +
      " ?sensor_tx <SSM://CostsPerKB> ?sensor_cpkb.\n" +
      "\n" +
      " ?broker_tx <SSM://Defines> ?broker_name.\n" +
      " ?broker_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> \"SSM://BrokerRegistration\".\n" +
      " ?broker_tx <SSM://HasHash> ?broker_hash.\n" +
      " ?broker_tx <SSM://HasEndpoint> ?broker_endpoint.\n" +
      "\n" +
      " ?sensor_tx <http://www.w3.org/ns/sosa/observes> ?observes.\n" +
      " ?sensor_tx <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location.\n" +
      " ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures.\n" +
      " ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat.\n" +
      " ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long.\n" +
      " ?observes <http://www.w3.org/2000/01/rdf-schema#label> \"Milk Temperature\"}",
    "Get all sensors in Australia":
      "PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\n" +
      "SELECT ?sensor_name ?sensor_hash ?broker_name ?broker_hash ?broker_endpoint ?lat ?long ?measures ?sensor_cpm ?sensor_cpkb WHERE { \n" +
      " ?sensor_tx <SSM://Defines> ?sensor_name.\n" +
      " ?sensor_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> \"SSM://SensorRegistration\".\n" +
      " ?sensor_tx <SSM://HasHash> ?sensor_hash.\n" +
      " ?sensor_tx <SSM://UsesBroker> ?broker_name.\n" +
      " ?sensor_tx <SSM://CostsPerMinute> ?sensor_cpm.\n" +
      " ?sensor_tx <SSM://CostsPerKB> ?sensor_cpkb.\n" +
      "\n" +
      " ?broker_tx <SSM://Defines> ?broker_name.\n" +
      " ?broker_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> \"SSM://BrokerRegistration\".\n" +
      " ?broker_tx <SSM://HasHash> ?broker_hash.\n" +
      " ?broker_tx <SSM://HasEndpoint> ?broker_endpoint.\n" +
      "\n" +
      " ?sensor_tx <http://www.w3.org/ns/sosa/observes> ?observes.\n" +
      " ?sensor_tx <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location.\n" +
      " ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures.\n" +
      " ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat.\n" +
      " ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long.\n" +
      " FILTER(" +
      "xsd:decimal(?long) > 113.338953078" +
      " && xsd:decimal(?long) < 153.569469029" +
      " && xsd:decimal(?lat) > -43.6345972634" +
      " && xsd:decimal(?lat) < -10.6681857235)}"
  };

  const freeformOnInput = () => {
    if (freeformSelect.selectedIndex === -1) {
      return;
    }

    const selected = freeformSelect.item(freeformSelect.selectedIndex);

    freeformQuery.value = freeformQueries[selected.value];
  };

  freeformSelect.addEventListener("input", freeformOnInput);

  for (const key of Object.keys(freeformQueries)) {
    freeformSelect.append(new Option(key, key));
  }

  freeformOnInput();

  freeformGo.onclick = (_) => {
    const input = freeformQuery.value;

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
    }).then((res: QueryResult) => {
      if (!res.result) {
        statusError(operationStatus, "Error when querying: " + (res as ResultFailure).reason);
        return;
      }

      freeformCurRes = res;

      freeformHeaders.clear();
      for (const header of res.headers) {
        freeformHeaders.set(header, freeformHeaders.size);
      }

      freeformAdd.disabled = !(freeformHeaders.has("sensor_name") && freeformHeaders.has("sensor_hash") && freeformHeaders.has("broker_hash") && freeformHeaders.has("broker_endpoint"));

      const headerRow = freeformHead.insertRow(-1);
      const headerCells = [] as HTMLTableCellElement[];
      for (let i = 0; i < freeformHeaders.size; ++i) {
        const created = document.createElement('th');
        created.innerHTML = res.headers[i];
        headerRow.appendChild(created);
        headerCells.push(created);
      }

      for (const obj of res.values) {
        const dataRow = freeformBody.insertRow();

        for (let i = 0; i < freeformHeaders.size; ++i) {
          const newCell = dataRow.insertCell();
          newCell.style.border = "1px solid black";
          newCell.innerHTML = String(obj[i]);
        }
      }
      statusOK(operationStatus, "Finished query");
    }).finally(() => {
      freeformGo.disabled = false;
    });
  };

  freeformAdd.onclick = (_) => {
    const nameIndex = freeformHeaders.get("sensor_name");
    const sensorHashIndex = freeformHeaders.get("sensor_hash");
    const brokerHashIndex = freeformHeaders.get("broker_hash");
    const brokerEndpointIndex = freeformHeaders.get("broker_endpoint");
    const brokerNameIndex = freeformHeaders.has("broker_name") ? freeformHeaders.get("broker_name") : null;
    const cpmIndex = freeformHeaders.has("sensor_cpm") ? freeformHeaders.get("sensor_cpm") : null;
    const cpkbIndex = freeformHeaders.has("sensor_cpkb") ? freeformHeaders.get("sensor_cpkb") : null;

    for (const obj of freeformCurRes.values) {
      const name = obj[nameIndex] as string;
      let sensorInfo: IntegrateSensor = null;
      if (!integrateSensorsMap.has(name)) {
        const adding = new Option(name);
        integrateSensors.append(adding);
        sensorInfo = {
          sensor_name: name,
          sensor_hash: obj[sensorHashIndex] as string,
          broker_name: null,
          broker_hash: obj[brokerHashIndex] as string,
          broker_endpoint: obj[brokerEndpointIndex] as string,
          cpm: null,
          cpkb: null,
          amount: 0,
          option: adding
        };
        integrateSensorsMap.set(name, sensorInfo);
      } else {
        sensorInfo = integrateSensorsMap.get(name);
        sensorInfo.sensor_hash = obj[sensorHashIndex] as string;
        sensorInfo.broker_hash = obj[brokerHashIndex] as string;
        sensorInfo.broker_endpoint = obj[brokerEndpointIndex] as string;
      }

      if (brokerNameIndex !== null) {
        sensorInfo.broker_name = obj[brokerNameIndex] as string;
      }
      if (cpmIndex !== null) {
        sensorInfo.cpm = obj[cpmIndex] as number;
      }
      if (cpkbIndex !== null) {
        sensorInfo.cpkb = obj[cpkbIndex] as number;
      }
    }

    document.getElementById("integrateButton").click();
  };

  //integrate

  const integrateInfo = document.getElementById("integrateInfo") as HTMLDivElement;
  const integrateInfoName = document.getElementById("integrateInfoName") as HTMLInputElement;
  const integrateInfoCPM = document.getElementById("integrateInfoCPM") as HTMLInputElement;
  const integrateInfoCPKB = document.getElementById("integrateInfoCPKB") as HTMLInputElement;
  const integrateInfoBroker = document.getElementById("integrateInfoBroker") as HTMLInputElement;
  const integrateInfoAmountLabel = document.getElementById("integrateInfoAmountLabel") as HTMLSpanElement;
  const integrateInfoAmount = document.getElementById("integrateInfoAmount") as HTMLInputElement;
  const integrateDeselect = document.getElementById("integrateDeselect");
  const integrateReward = document.getElementById("integrateReward") as HTMLInputElement;
  const integrateGo = document.getElementById("integrateGo") as HTMLButtonElement;
  const integrateResult = document.getElementById("integrateResult") as HTMLDivElement;
  const integrateResultDiv = document.getElementById("integrateResultDiv") as HTMLDivElement;
  const integrateConnectInfoBody = document.getElementById("integrateConnectInfoBody") as HTMLTableSectionElement;

  expertModeCbs.push((expert) => {
    integrateResultDiv.style.display = expert ? "block" : "none";
  });

  let integrateSelectedSensor: string = null;

  const integrateSetInfo = (sensorName: string) => {
    const sensor = integrateSensorsMap.get(sensorName);
    integrateSelectedSensor = sensorName;
    integrateInfoName.value = sensorName
    if (sensor.cpm !== null) {
      integrateInfoCPM.value = String(sensor.cpm);
    } else {
      integrateInfoCPM.value = "Unknown";
    }
    if (sensor.cpkb !== null) {
      integrateInfoCPKB.value = String(sensor.cpkb);
    } else {
      integrateInfoCPKB.value = "Unknown";
    }
    if (sensor.broker_name !== null) {
      integrateInfoBroker.value = sensor.broker_name;
    } else {
      integrateInfoBroker.value = "Unknown";
    }
    integrateInfoAmountLabel.style.display = "block";
    integrateInfoAmount.style.display = "block";
    integrateInfoAmount.value = String(sensor.amount);
    integrateInfo.style.display = "block";
  };

  integrateSensors.addEventListener("input", (_) => {
    if (integrateSensors.selectedIndex === -1) {
      integrateInfo.style.display = "none";
      integrateSelectedSensor = null;
      return;
    }

    integrateSetInfo(integrateSensors.item(integrateSensors.selectedIndex).value);
  });
  integrateDeselect.addEventListener("click", (_) => {
    if (integrateSensors.selectedIndex === -1) {
      statusError(operationStatus, "No sensor selected");
      return -1;
    }

    const sensorName = integrateSensors.item(integrateSensors.selectedIndex).value;

    const found = integrateSensorsMap.get(sensorName);
    integrateSensors.removeChild(found.option);
    integrateSensorsMap.delete(sensorName);


    integrateInfo.style.display = "none";
    integrateSelectedSensor = null;
  });
  integrateInfoAmount.addEventListener("change", (_) => {
    const parsed = Number.parseInt(integrateInfoAmount.value, 10);
    const found = integrateSensorsMap.get(integrateSelectedSensor);
    if (Number.isNaN(parsed) || parsed < 1) {
      integrateInfoAmount.value = '0';
      found.amount = 0;
    } else {
      found.amount = parsed;
    }
  });
  integrateReward.addEventListener("change", () => {
    const parsed = Number.parseInt(integrateReward.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      integrateReward.value = '0';
    }
  });

  integrateGo.addEventListener("click", (_) => {

    const input = {
      keyPair: ourKeyPair,
      rewardAmount: Number.parseInt(integrateReward.value),
      witnessCount: 0,
      outputs: [] as IntegrationOutput[]
    };

    const forDisplayLater = [] as { sensor: string; brokerIp: string; index: number }[];

    for (const [name, sensor] of integrateSensorsMap.entries()) {
      if (sensor.amount === 0) {
        continue;
      }
      input.outputs.push({
        amount: sensor.amount,
        sensorName: name,
        sensorHash: sensor.sensor_hash,
        brokerHash: sensor.broker_hash
      });
      forDisplayLater.push({
        sensor: sensor.sensor_name,
        brokerIp: sensor.broker_endpoint,
        index: forDisplayLater.length
      });
    }

    integrateGo.disabled = true;

    fetch("/Integration/Register", {
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }).then((res) => {
      return res.json();
    }).then((res) => {
      if (!res.result) {
        statusError(operationStatus, "Error while creating integration transaction: " + res.reason);
        return;
      }
      clearTable(integrateConnectInfoBody);
      for (const display of forDisplayLater) {
        const dataRow = integrateConnectInfoBody.insertRow();

        const sensorNameCell = dataRow.insertCell();
        sensorNameCell.style.border = "1px solid black";
        sensorNameCell.innerHTML = display.sensor;

        const brokerIpCell = dataRow.insertCell();
        brokerIpCell.style.border = "1px solid black";
        brokerIpCell.innerHTML = display.brokerIp;

        const topicCell = dataRow.insertCell();
        topicCell.style.border = "1px solid black";
        topicCell.innerHTML = 'out/' + res.hash + '/' + display.index;
      }
      integrateResult.innerHTML = JSON.stringify(res.tx, null, 2);
      statusOK(operationStatus, "Submitted Integration");
    }).finally(() => {
      integrateGo.disabled = false;
    })
  });

  //integrations
  const integrationIntegrations = document.getElementById("integrationIntegrations") as HTMLSelectElement;
  const integrationInfo = document.getElementById("integrationInfo") as HTMLDivElement;
  const integrationInfoStarted = document.getElementById("integrationInfoStarted") as HTMLInputElement;
  const integrationInfoHash = document.getElementById("integrationInfoHash") as HTMLInputElement;
  const integrationInfoWitnessCount = document.getElementById("integrationInfoWitnessCount") as HTMLInputElement;
  const integrationOutputBody = document.getElementById("integrationOutputBody") as HTMLTableSectionElement;
  //const integrationWitnessesBody = document.getElementById("integrationWitnessesBody") as HTMLTableSectionElement;
  const integrationOptions = new Map<string, HTMLOptionElement>();

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
    //clearTable(integrationWitnessesBody)
    //for (const witness of Object.keys(integration.witnesses)) {
    //  const dataRow = integrationWitnessesBody.insertRow();

    //  const witnessCell = dataRow.insertCell();
    //  witnessCell.style.border = "1px solid black";
    //  witnessCell.innerHTML = witness;
    //}
  }

  refreshInfo.integrationOwnedBy.onNew.push((key, _) => {
    const adding = new Option(key, key);
    integrationOptions.set(key, adding);
    integrationIntegrations.append(adding);
  });
  refreshInfo.integrationOwnedBy.onDel.push((key) => {
    if (integrationOptions.has(key)) {
      const child = integrationOptions.get(key);
      integrationIntegrations.removeChild(child);
      integrationOptions.delete(key);
    }
  });
  refreshInfo.integrationOwnedBy.onChange.push((key, data) => {
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
    const selectedIntegration = refreshInfo.integrationOwnedBy.vals[selectedOption.value];

    integrationSetInfo(selectedOption.value, selectedIntegration);
  };
};