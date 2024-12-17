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

type TabButtonVisibility = Readonly<[
  boolean, //genKey
  boolean, //yourBrokers
  boolean, //registerBroker
  boolean, //allBrokers
  boolean, //registerSensor
  boolean, //sensors
  boolean, //integrationUsesOurSensors
  boolean, //freeformQuery
  boolean, //integrate
  boolean]>; //integrations

const brokerTabButtonVisibility: TabButtonVisibility = [
  false, //genKey
  true, //yourBrokers
  true, //registerBroker
  false, //allBrokers
  false, //registerSensor
  false, //sensors
  false, //integrationUsesOurSensors
  false, //freeformQuery
  false, //integrate
  false] as const; //integrations

const providerTabButtonVisibility: TabButtonVisibility = [
  false, //genKey
  false, //yourBrokers
  false, //registerBroker
  false, //allBrokers
  true, //registerSensor
  true, //sensors
  true, //integrationUsesOurSensors
  false, //freeformQuery
  false, //integrate
  false] as const; //integrations

const applicationTabButtonVisibility: TabButtonVisibility = [
  false, //genKey
  false, //yourBrokers
  false, //registerBroker
  false, //allBrokers
  false, //registerSensor
  false, //sensors
  false, //integrationUsesOurSensors
  false, //freeformQuery
  true, //integrate
  true] as const; //integrations

const expertTabButtonVisibility: TabButtonVisibility = [
  true, //genKey
  true, //yourBrokers
  true, //registerBroker
  true, //allBrokers
  true, //registerSensor
  true, //sensors
  true, //integrationUsesOurSensors
  true, //freeformQuery
  true, //integrate
  true] as const; //integrations

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

  const setExpert = (expert: boolean) => {
    expertMode = expert;

    for (const cb of expertModeCbs) {
      cb(expertMode);
    }
  }

  let validKeyPair = false;

  const publicKeySpan = document.getElementById("publicKey") as HTMLInputElement;
  let ourKeyPair: string = "";
  let ourPubKey: string = "";
  const onPubKeyChange = [] as (() => void)[];
  const privateKey = document.getElementById("privateKey") as HTMLInputElement;
  const coinCountSpan = document.getElementById("coinCount") as HTMLSpanElement;
  const refreshStatus = document.getElementById("refreshStatus") as HTMLDivElement;
  const operationStatus = document.getElementById("operationStatus") as HTMLDivElement;

  const noKeyPage = document.getElementById("noKeyPage") as HTMLDivElement;
  const noKeyKeyPair = document.getElementById("noKeyKeyPair") as HTMLInputElement;
  const keyPage = document.getElementById("keyPage") as HTMLDivElement;

  const onPrivateKeyChange = () => {
    privateKey.disabled = true;
    noKeyKeyPair.value = privateKey.value;
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
        validKeyPair = false;
        return;
      }
      validKeyPair = true;
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

  type Tab = {
    button: HTMLButtonElement;
    tab: HTMLDivElement;
    style: string;
    onclick: (_?: unknown) => void;
  };

  let currentTab: Tab = null;

  const initTab = function (baseName: string, style: string, expert: boolean, tab?: HTMLDivElement): Tab {
    const buttonName = baseName + "Button";
    const button = document.getElementById(buttonName) as HTMLButtonElement;
    if (button === null) {
      throw new Error("Couldn't find: " + buttonName);
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
      throw new Error("Couldn't find tab for " + baseName);
    }
    tab.style.display = "none";

    const returning: Tab = {
      button: button,
      tab: tab,
      style: style,
      onclick: (_?:unknown) => {
        currentTab.tab.style.display = "none";
        currentTab.button.style.backgroundColor = "default";

        tab.style.display = style;
        currentTab = returning;
      }
    };

    button.onclick = returning.onclick;

    return returning;
  };

  const sensorsList = new SensorList(sensorNormalVisibility);
  keyPage.appendChild(sensorsList.parent());
  const allBrokersList = new BrokerList(brokerNormalVisibility);
  keyPage.appendChild(allBrokersList.parent());
  const yourBrokersList = new BrokerList(brokerNormalVisibility);
  keyPage.appendChild(yourBrokersList.parent());

  const genKey = initTab("genKey", "block", true);
  const yourBrokers = initTab("yourBrokers", "grid", true, yourBrokersList.parent());
  const registerBroker = initTab("registerBroker", "grid", true);
  const allBrokers = initTab("allBrokers", "grid", true, allBrokersList.parent());
  const registerSensor = initTab("registerSensor", "block", false);
  const sensors = initTab("sensors", "grid", false, sensorsList.parent());
  const integrationUsesOurSensors = initTab("integrationUsesOurSensors", "grid", true);
  const freeformQuery = initTab("freeformQuery", "block", false);
  const integrate = initTab("integrate", "block", false);
  const integrations = initTab("integrations", "grid", false);

  const setTabButtonVisibilities = function (visibilities: TabButtonVisibility) {
    genKey.button.style.display = visibilities[0] ? "block" : "none";
    yourBrokers.button.style.display = visibilities[1] ? "block" : "none";
    registerBroker.button.style.display = visibilities[2] ? "block" : "none";
    allBrokers.button.style.display = visibilities[3] ? "block" : "none";
    registerSensor.button.style.display = visibilities[4] ? "block" : "none";
    sensors.button.style.display = visibilities[5] ? "block" : "none";
    integrationUsesOurSensors.button.style.display = visibilities[6] ? "block" : "none";
    freeformQuery.button.style.display = visibilities[7] ? "block" : "none";
    integrate.button.style.display = visibilities[8] ? "block" : "none";
    integrations.button.style.display = visibilities[9] ? "block" : "none";
  };

  currentTab = freeformQuery;
  currentTab.tab.style.display = currentTab.style;
  currentTab.onclick();

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

  let refreshWorking = false;

  const refresh = function () {
    if (refreshWorking) {
      return;
    }
    refreshWorking = true;

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

        setTimeout(() => {
          refreshWorking = false;
          refresh()
        }, 1000);
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
        validKeyPair = false;
        return;
      }
      validKeyPair = true;
      publicKeySpan.value = res.value;
      noKeyKeyPair.value = keyPair;
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

  const noKeyKeyUpload = document.getElementById("noKeyKeyUpload") as HTMLInputElement;

  noKeyKeyUpload.addEventListener('change', (_event) => {
    if (noKeyKeyUpload.files.length !== 1) {
      statusError(operationStatus, "No file was selected");
      return;
    }
    noKeyKeyUpload.disabled = true;

    const reader = new FileReader();
    reader.onload = (_) => {
      onNoKeyKeyPair(reader.result as string).finally(() => {
        noKeyKeyUpload.disabled = false;
      });
    };
    reader.readAsText(noKeyKeyUpload.files[0]);
  });

  (document.getElementById("noKeyBrokerGo") as HTMLButtonElement).addEventListener('click', (_) => {
    setExpert(false);
    if (!validKeyPair) {
      statusError(operationStatus, "The key pair isn't valid. Either generate a new keypair or enter a valid keypair above");
      return;
    }

    setTabButtonVisibilities(brokerTabButtonVisibility);
    yourBrokers.onclick();

    noKeyPage.style.display = "none";
    keyPage.style.display = "block";
  });
  (document.getElementById("noKeyProviderGo") as HTMLButtonElement).addEventListener('click', (_) => {
    setExpert(false);
    if (!validKeyPair) {
      statusError(operationStatus, "The key pair isn't valid. Either generate a new keypair or enter a valid keypair above");
      return;
    }

    setTabButtonVisibilities(providerTabButtonVisibility);
    sensors.onclick();

    noKeyPage.style.display = "none";
    keyPage.style.display = "block";
  });
  (document.getElementById("noKeyApplicationGo") as HTMLButtonElement).addEventListener('click', (_) => {
    setExpert(false);
    if (!validKeyPair) {
      statusError(operationStatus, "The key pair isn't valid. Either generate a new keypair or enter a valid keypair above");
      return;
    }

    setTabButtonVisibilities(applicationTabButtonVisibility);
    integrate.onclick();

    noKeyPage.style.display = "none";
    keyPage.style.display = "block";
  });
  (document.getElementById("noKeyExpertGo") as HTMLButtonElement).addEventListener('click', (_) => {
    setExpert(true);

    setTabButtonVisibilities(expertTabButtonVisibility);
    genKey.onclick();
    refresh();

    noKeyPage.style.display = "none";
    keyPage.style.display = "block";
  });

  //refresh status
  expertModeCbs.push((expert) => {
    refreshStatus.style.display = expert ? "block" : "none";
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

  (document.getElementById("changeMode") as HTMLButtonElement).addEventListener('click', (_) => {
    noKeyPage.style.display = "block";
    keyPage.style.display = "none";
  });

  //chain depth

  const chainDepthDiv = document.getElementById("chainDepthDiv") as HTMLDivElement;

  expertModeCbs.push((expert) => {
    chainDepthDiv.style.display = expert ? "block" : "none";
  });

  //keypair set

  const keyPairSetDiv = document.getElementById("keyPairSetDiv") as HTMLDivElement;

  expertModeCbs.push((expert) => {
    keyPairSetDiv.style.display = expert ? "flex" : "none";
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
    allBrokersList.onNew(key, data);
  });
  refreshInfo.broker.onDel.push(function (key) {
    allBrokersList.onDel(key);
  });
  refreshInfo.broker.onChange.push(function (key, data) {
    allBrokersList.onChange(key, data);
  });

  expertModeCbs.push((expert) => {
    allBrokersList.setVisibility(expert ? brokerExpertVisibility : brokerNormalVisibility);
  });

  //yourBrokers

  refreshInfo.broker.onNew.push((key, data) => {
    if (data.input !== ourPubKey) {
      return;
    }
    yourBrokersList.onNew(key, data);
  });
  refreshInfo.broker.onDel.push((key) => {
    yourBrokersList.onDel(key);
  });
  refreshInfo.broker.onChange.push((key, data) => {
    if (data.input !== ourPubKey) {
      return;
    }
    yourBrokersList.onChange(key, data);
  });
  onPubKeyChange.push(() => {
    for (const [key, broker] of Object.entries(refreshInfo.broker.vals)) {
      if (broker.input === ourPubKey) {
        yourBrokersList.onNew(key, broker);
      } else {
        yourBrokersList.onDel(key);
      }
    }
  });

  expertModeCbs.push((expert) => {
    yourBrokersList.setVisibility(expert ? brokerExpertVisibility : brokerNormalVisibility);
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
  const registerSensorName = document.getElementById("registerSensorName") as HTMLInputElement;
  const registerSensorCPM = document.getElementById("registerSensorCPM") as HTMLInputElement;
  const registerSensorCPKB = document.getElementById("registerSensorCPKB") as HTMLInputElement;
  const registerSensorBrokerInfo = document.getElementById("registerSensorBrokerInfo") as HTMLSpanElement;
  const registerSensorBroker = document.getElementById("registerSensorBroker") as HTMLSelectElement;
  const registerSensorMetadataInfo = document.getElementById("registerSensorMetadataInfo") as HTMLSpanElement;
  const registerSensorMetadataData = document.getElementById("registerSensorMetadataData") as HTMLSpanElement;
  const registerSensorClearMetadata = document.getElementById("registerSensorClearMetadata") as HTMLButtonElement;
  const registerSensorMetadata = document.getElementById("registerSensorMetadata") as HTMLInputElement;
  registerSensorMetadata.value = "";
  const registerSensorLatitudeInfo = document.getElementById("registerSensorLatitudeInfo") as HTMLSpanElement;
  const registerSensorLatitude = document.getElementById("registerSensorLatitude") as HTMLInputElement;
  const registerSensorLongitudeInfo = document.getElementById("registerSensorLongitudeInfo") as HTMLSpanElement;
  const registerSensorLongitude = document.getElementById("registerSensorLongitude") as HTMLInputElement;
  const registerSensorMeasuresInfo = document.getElementById("registerSensorMeasuresInfo") as HTMLSpanElement;
  const registerSensorMeasures = document.getElementById("registerSensorMeasures") as HTMLInputElement;
  const registerSensorUnknownInterval = document.getElementById("registerSensorUnknownInterval") as HTMLButtonElement;
  let registerSensorIntervalIsKnown = true;
  const registerSensorInterval = document.getElementById("registerSensorInterval") as HTMLInputElement;
  const registerSensorIntervalFooter = document.getElementById("registerSensorIntervalFooter") as HTMLSpanElement;
  const registerSensorReward = document.getElementById("registerSensorReward") as HTMLInputElement;
  const registerSensorGo = document.getElementById("registerSensorGo") as HTMLButtonElement;
  const registerSensorConnectionDiv = document.getElementById("registerSensorConnectionDiv") as HTMLDivElement;
  const registerSensorConnectionAddress = document.getElementById("registerSensorConnectionAddress") as HTMLDivElement;
  const registerSensorConnectionTopic = document.getElementById("registerSensorConnectionTopic") as HTMLDivElement;
  const registerSensorResultDiv = document.getElementById("registerSensorResultDiv") as HTMLDivElement;
  const registerSensorResult = document.getElementById("registerSensorResult") as HTMLLabelElement;

  expertModeCbs.push((expert) => {
    registerSensorResultDiv.style.display = expert ? "block" : "none";
    registerSensorBrokerInfo.style.display = expert ? "block" : "none";
    registerSensorBroker.style.display = expert ? "block" : "none";
    registerSensorMetadataInfo.style.display = expert ? "block" : "none";
    registerSensorMetadataData.style.display = expert ? "block" : "none";
    registerSensorLatitudeInfo.style.display = expert ? "none" : "block";
    registerSensorLatitude.style.display = expert ? "none" : "block";
    registerSensorLongitudeInfo.style.display = expert ? "none" : "block";
    registerSensorLongitude.style.display = expert ? "none" : "block";
    registerSensorMeasuresInfo.style.display = expert ? "none" : "block";
    registerSensorMeasures.style.display = expert ? "none" : "block";
  });

  let registerSensorParsedNodeMetadata = [] as NodeMetadata[];
  let registerSensorParsedLiteralMetadata = [] as LiteralMetadata[];
  const registerSensorOptions = new Map<string, HTMLOptionElement>();
  registerSensorCPM.addEventListener("change", () => {
    const parsed = Number.parseInt(registerSensorCPM.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      registerSensorCPM.value = '1';
    }
  });
  registerSensorCPKB.addEventListener("change", () => {
    const parsed = Number.parseInt(registerSensorCPKB.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      registerSensorCPKB.value = '1';
    }
  });
  registerSensorReward.addEventListener("change", () => {
    const parsed = Number.parseInt(registerSensorReward.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      registerSensorReward.value = '0';
    }
  });
  registerSensorLatitude.addEventListener("change", () => {
    const parsed = Number.parseFloat(registerSensorLatitude.value);
    if (Number.isNaN(parsed) || parsed < -90 || parsed > 90) {
      registerSensorLatitude.value = '0';
    }
  });
  registerSensorLongitude.addEventListener("change", () => {
    const parsed = Number.parseFloat(registerSensorLongitude.value);
    if (Number.isNaN(parsed) || parsed < -180 || parsed > 180) {
      registerSensorLongitude.value = '0';
    }
  });
  registerSensorInterval.addEventListener("change", () => {
    const parsed = Number.parseInt(registerSensorInterval.value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      registerSensorInterval.value = '1000';
    }
  });
  registerSensorUnknownInterval.addEventListener('click', () => {
    registerSensorIntervalIsKnown = !registerSensorIntervalIsKnown;
    registerSensorInterval.style.display = registerSensorIntervalIsKnown ? "inline" : "none";
    registerSensorIntervalFooter.style.display = registerSensorIntervalIsKnown ? "inline" : "none";
    registerSensorUnknownInterval.innerHTML = registerSensorIntervalIsKnown ? "Set to not periodic" : "Set to periodic";
  });


  refreshInfo.broker.onNew.push((key, _) => {
    const adding = new Option(key, key);
    registerSensorOptions.set(key, adding);
    registerSensorBroker.append(adding);
  });
  refreshInfo.broker.onDel.push((key) => {
    if (registerSensorOptions.has(key)) {
      const child = registerSensorOptions.get(key);
      registerSensorBroker.removeChild(child);
      registerSensorOptions.delete(key);
    }
  });

  registerSensorClearMetadata.addEventListener("click", (_) => {
    registerSensorParsedNodeMetadata = [];
    registerSensorParsedLiteralMetadata = [];
    registerSensorMetadata.value = "";
  });
  registerSensorMetadata.addEventListener('change', (_event) => {
    if (registerSensorMetadata.files.length !== 1) {
      statusError(operationStatus, "No file was selected");
      return;
    }
    registerSensorMetadata.disabled = true;
    registerSensorClearMetadata.disabled = true;

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
        registerSensorMetadata.disabled = false;
        registerSensorClearMetadata.disabled = false;
      } catch (ex) {
        statusError(operationStatus, "Couldn't read file: " + ex.message);
        console.log(ex);
        registerSensorMetadata.value = "";
        registerSensorMetadata.disabled = false;
        registerSensorClearMetadata.disabled = false;
      }
    };
    reader.readAsText(registerSensorMetadata.files[0]);
  });

  registerSensorGo.addEventListener("click", (_) => {
    registerSensorGo.disabled = true;

    const input = {
      keyPair: ourKeyPair,
      sensorName: registerSensorName.value,
      costPerMinute: Number.parseInt(registerSensorCPM.value),
      costPerKB: Number.parseInt(registerSensorCPKB.value),
      rewardAmount: Number.parseInt(registerSensorReward.value),
      integrationBroker: null as string,
      interval: null as number,
      extraLiteralMetadata: null as LiteralMetadata[],
      extraNodeMetadata: null as NodeMetadata[]
    };

    if (expertMode) {
      if (registerSensorBroker.selectedIndex === -1) {
        statusError(operationStatus, "No broker selected");
        return;
      }
      input.integrationBroker = registerSensorBroker.item(registerSensorBroker.selectedIndex).value;
    }
    if (expertMode) {
      if (registerSensorParsedLiteralMetadata.length !== 0) {
        input.extraLiteralMetadata = registerSensorParsedLiteralMetadata;
      }
      if (registerSensorParsedNodeMetadata.length !== 0) {
        input.extraNodeMetadata = registerSensorParsedNodeMetadata;
      }
    } else {
      input.extraLiteralMetadata = [];
      input.extraLiteralMetadata.push(
        { s: 'SSMS://#observes', p: 'http://www.w3.org/2000/01/rdf-schema#label', o: registerSensorMeasures.value },
        { s: 'SSMS://#location', p: 'http://www.w3.org/2003/01/geo/wgs84_pos#lat', o: registerSensorLatitude.value },
        { s: 'SSMS://#location', p: 'http://www.w3.org/2003/01/geo/wgs84_pos#long', o: registerSensorLongitude.value }
      );

      input.extraNodeMetadata = [];
      input.extraNodeMetadata.push(
        { s: 'SSMS://', p: 'http://www.w3.org/ns/sosa/observes', o: 'SSMS://#observes' },
        { s: 'SSMS://', p: 'http://www.w3.org/ns/sosa/hasFeatureOfInterest', o: 'SSMS://#location' }
      );
    }
    if (registerSensorIntervalIsKnown) {
      input.interval = Number.parseInt(registerSensorInterval.value, 10);
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
      registerSensorConnectionDiv.style.display = 'grid';
      registerSensorConnectionAddress.innerHTML = "mqtt://" + res.brokerIp;
      registerSensorConnectionTopic.innerHTML = 'in/'+input.sensorName;
      registerSensorResult.innerHTML = JSON.stringify(res.tx, null, 2);
      statusOK(operationStatus, "Submitted sensor registration");
    }).finally(() => {
      registerSensorGo.disabled = false;
    })
  });

  //sensors
  refreshInfo.sensor.onNew.push((key, data) => {
    sensorsList.onNew(key, data);
  });
  refreshInfo.sensor.onDel.push((key) => {
    sensorsList.onDel(key);
  });
  refreshInfo.sensor.onChange.push((key, data) => {
    sensorsList.onChange(key, data);
  });

  expertModeCbs.push((expert) => {
    sensorsList.setVisibility(expert ? sensorExpertVisibility : sensorNormalVisibility);
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
  const freeformQueryInput = document.getElementById("freeformQueryInput") as HTMLTextAreaElement;
  const freeformGo = document.getElementById("freeformGo") as HTMLButtonElement;
  const freeformHead = document.getElementById("freeformHead") as HTMLTableSectionElement;
  const freeformBody = document.getElementById("freeformBody") as HTMLTableSectionElement;
  const freeformHeaders = new Map<string, number>();

  interface QueryResultSucces extends ResultSuccess {
    result: true,
    headers: string[];
    values: (string | number)[][];
  }

  type QueryResult = QueryResultSucces | ResultFailure;

  const freeformQueries: { [index: string]: string } = {
    "Get all camera sensors":
      `SELECT ?sensor_name ?sensor_hash ?broker_name ?broker_hash ?broker_endpoint ?lat ?long ?measures ?sensor_cpm ?sensor_cpkb WHERE {
       ?sensor_tx <ssm://Defines> ?sensor_name.
       ?sensor_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://SensorRegistration".
       ?sensor_tx <ssm://HasHash> ?sensor_hash.
       ?sensor_tx <ssm://UsesBroker> ?broker_name.
       ?sensor_tx <ssm://CostsPerMinute> ?sensor_cpm.
       ?sensor_tx <ssm://CostsPerKB> ?sensor_cpkb.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?sensor_tx }.
       
       ?broker_tx <ssm://Defines> ?broker_name.
       ?broker_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://BrokerRegistration".
       ?broker_tx <ssm://HasHash> ?broker_hash.
       ?broker_tx <ssm://HasEndpoint> ?broker_endpoint.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?broker_tx }.
       
       ?sensor_tx <http://www.w3.org/ns/sosa/observes> ?observes.
       ?sensor_tx <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location.
       ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long.
       ?observes <http://www.w3.org/2000/01/rdf-schema#label> "video".}`,
    "Get all milk pressure sensors":
      `SELECT ?sensor_name ?sensor_hash ?broker_name ?broker_hash ?broker_endpoint ?lat ?long ?measures ?sensor_cpm ?sensor_cpkb WHERE {
       ?sensor_tx <ssm://Defines> ?sensor_name.
       ?sensor_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://SensorRegistration".
       ?sensor_tx <ssm://HasHash> ?sensor_hash.
       ?sensor_tx <ssm://UsesBroker> ?broker_name.
       ?sensor_tx <ssm://CostsPerMinute> ?sensor_cpm.
       ?sensor_tx <ssm://CostsPerKB> ?sensor_cpkb.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?sensor_tx }.
       
       ?broker_tx <ssm://Defines> ?broker_name.
       ?broker_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://BrokerRegistration".
       ?broker_tx <ssm://HasHash> ?broker_hash.
       ?broker_tx <ssm://HasEndpoint> ?broker_endpoint.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?broker_tx }.
       
       ?sensor_tx <http://www.w3.org/ns/sosa/observes> ?observes.
       ?sensor_tx <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location.
       ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long.
       ?observes <http://www.w3.org/2000/01/rdf-schema#label> "Milk Pressure".}`,
    "Get all air temperature sensors":
      `SELECT ?sensor_name ?sensor_hash ?broker_name ?broker_hash ?broker_endpoint ?lat ?long ?measures ?sensor_cpm ?sensor_cpkb WHERE {
       ?sensor_tx <ssm://Defines> ?sensor_name.
       ?sensor_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://SensorRegistration".
       ?sensor_tx <ssm://HasHash> ?sensor_hash.
       ?sensor_tx <ssm://UsesBroker> ?broker_name.
       ?sensor_tx <ssm://CostsPerMinute> ?sensor_cpm.
       ?sensor_tx <ssm://CostsPerKB> ?sensor_cpkb.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?sensor_tx }.
       
       ?broker_tx <ssm://Defines> ?broker_name.
       ?broker_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://BrokerRegistration".
       ?broker_tx <ssm://HasHash> ?broker_hash.
       ?broker_tx <ssm://HasEndpoint> ?broker_endpoint.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?broker_tx }.
       
       ?sensor_tx <http://www.w3.org/ns/sosa/observes> ?observes.
       ?sensor_tx <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location.
       ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long.
       ?observes <http://www.w3.org/2000/01/rdf-schema#label> "Air Temperature".}`,
    "Get all air humidity sensors":
      `SELECT ?sensor_name ?sensor_hash ?broker_name ?broker_hash ?broker_endpoint ?lat ?long ?measures ?sensor_cpm ?sensor_cpkb WHERE {
       ?sensor_tx <ssm://Defines> ?sensor_name.
       ?sensor_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://SensorRegistration".
       ?sensor_tx <ssm://HasHash> ?sensor_hash.
       ?sensor_tx <ssm://UsesBroker> ?broker_name.
       ?sensor_tx <ssm://CostsPerMinute> ?sensor_cpm.
       ?sensor_tx <ssm://CostsPerKB> ?sensor_cpkb.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?sensor_tx }.
       
       ?broker_tx <ssm://Defines> ?broker_name.
       ?broker_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://BrokerRegistration".
       ?broker_tx <ssm://HasHash> ?broker_hash.
       ?broker_tx <ssm://HasEndpoint> ?broker_endpoint.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?broker_tx }.
       
       ?sensor_tx <http://www.w3.org/ns/sosa/observes> ?observes.
       ?sensor_tx <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location.
       ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long.
       ?observes <http://www.w3.org/2000/01/rdf-schema#label> "Relative air Humidity".}`,
    "Get all milk temperature sensors":
      `SELECT ?sensor_name ?sensor_hash ?broker_name ?broker_hash ?broker_endpoint ?lat ?long ?measures ?sensor_cpm ?sensor_cpkb WHERE {
       ?sensor_tx <ssm://Defines> ?sensor_name.
       ?sensor_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://SensorRegistration".
       ?sensor_tx <ssm://HasHash> ?sensor_hash.
       ?sensor_tx <ssm://UsesBroker> ?broker_name.
       ?sensor_tx <ssm://CostsPerMinute> ?sensor_cpm.
       ?sensor_tx <ssm://CostsPerKB> ?sensor_cpkb.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?sensor_tx }.
       
       ?broker_tx <ssm://Defines> ?broker_name.
       ?broker_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://BrokerRegistration".
       ?broker_tx <ssm://HasHash> ?broker_hash.
       ?broker_tx <ssm://HasEndpoint> ?broker_endpoint.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?broker_tx }.
       
       ?sensor_tx <http://www.w3.org/ns/sosa/observes> ?observes.
       ?sensor_tx <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location.
       ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long.
       ?observes <http://www.w3.org/2000/01/rdf-schema#label> "Milk Temperature".}`,
    "Get all sensors in Australia":
      `PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      SELECT ?sensor_name ?sensor_hash ?broker_name ?broker_hash ?broker_endpoint ?lat ?long ?measures ?sensor_cpm ?sensor_cpkb WHERE { 
       ?sensor_tx <ssm://Defines> ?sensor_name.
       ?sensor_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://SensorRegistration".
       ?sensor_tx <ssm://HasHash> ?sensor_hash.
       ?sensor_tx <ssm://UsesBroker> ?broker_name.
       ?sensor_tx <ssm://CostsPerMinute> ?sensor_cpm.
       ?sensor_tx <ssm://CostsPerKB> ?sensor_cpkb.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?sensor_tx }.
       
       ?broker_tx <ssm://Defines> ?broker_name.
       ?broker_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://BrokerRegistration".
       ?broker_tx <ssm://HasHash> ?broker_hash.
       ?broker_tx <ssm://HasEndpoint> ?broker_endpoint.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?broker_tx }.
       
       ?sensor_tx <http://www.w3.org/ns/sosa/observes> ?observes.
       ?sensor_tx <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location.
       ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long.
       FILTER( +
       xsd:decimal(?long) > 113.338953078
       && xsd:decimal(?long) < 153.569469029
       && xsd:decimal(?lat) > -43.6345972634
       && xsd:decimal(?lat) < -10.6681857235)}`
  };


  const freeformOnInput = () => {
    if (freeformSelect.selectedIndex === -1) {
      return;
    }

    const selected = freeformSelect.item(freeformSelect.selectedIndex);

    freeformQueryInput.value = freeformQueries[selected.value];
  };

  freeformSelect.addEventListener("input", freeformOnInput);

  for (const key of Object.keys(freeformQueries)) {
    freeformSelect.append(new Option(key, key));
  }

  freeformOnInput();

  freeformGo.onclick = (_) => {
    const input = freeformQueryInput.value;

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

      freeformHeaders.clear();
      for (const header of res.headers) {
        freeformHeaders.set(header, freeformHeaders.size);
      }

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

  const integrateFreeformSelect = document.getElementById("integrateFreeformSelect") as HTMLSelectElement;
  const integrateFreeformQueryInput = document.getElementById("integrateFreeformQueryInput") as HTMLTextAreaElement;
  const integrateFreeformGo = document.getElementById("integrateFreeformGo") as HTMLButtonElement;
  const integrateFreeformAdd = document.getElementById("integrateFreeformAdd") as HTMLButtonElement;
  const integrateFreeformHead = document.getElementById("integrateFreeformHead") as HTMLTableSectionElement;
  const integrateFreeformBody = document.getElementById("integrateFreeformBody") as HTMLTableSectionElement;
  const integrateFreeformHeaders = new Map<string, number>();

  let integrateFreeformNameIndex = integrateFreeformHeaders.get("sensor_name");
  let integrateFreeformSensorHashIndex = integrateFreeformHeaders.get("sensor_hash");
  let integrateFreeformBrokerHashIndex = integrateFreeformHeaders.get("broker_hash");
  let integrateFreeformBrokerEndpointIndex = integrateFreeformHeaders.get("broker_endpoint");
  let integrateFreeformBrokerNameIndex = integrateFreeformHeaders.has("broker_name") ? integrateFreeformHeaders.get("broker_name") : null;
  let integrateFreeformCpmIndex = integrateFreeformHeaders.has("sensor_cpm") ? integrateFreeformHeaders.get("sensor_cpm") : null;
  let integrateFreeformCpkbIndex = integrateFreeformHeaders.has("sensor_cpkb") ? integrateFreeformHeaders.get("sensor_cpkb") : null;

  interface QueryResultSucces extends ResultSuccess {
    result: true,
    headers: string[];
    values: (string | number)[][];
  }

  let integrateFreeformCurRes: QueryResultSucces = null

  const integrateFreeformOnInput = () => {
    if (integrateFreeformSelect.selectedIndex === -1) {
      return;
    }

    const selected = freeformSelect.item(integrateFreeformSelect.selectedIndex);

    integrateFreeformQueryInput.value = freeformQueries[selected.value];
  };

  integrateFreeformSelect.addEventListener("input", integrateFreeformOnInput);

  for (const key of Object.keys(freeformQueries)) {
    integrateFreeformSelect.append(new Option(key, key));
  }

  integrateFreeformOnInput();

  const addFreeformToIntegrate = (obj: (string | number)[]) => {
    const name = obj[integrateFreeformNameIndex] as string;
    let sensorInfo: IntegrateSensor = null;
    if (!integrateSensorsMap.has(name)) {
      const adding = new Option(name);
      integrateSensors.append(adding);
      sensorInfo = {
        sensor_name: name,
        sensor_hash: obj[integrateFreeformSensorHashIndex] as string,
        broker_name: null,
        broker_hash: obj[integrateFreeformBrokerHashIndex] as string,
        broker_endpoint: obj[integrateFreeformBrokerEndpointIndex] as string,
        cpm: null,
        cpkb: null,
        amount: 0,
        option: adding
      };
      integrateSensorsMap.set(name, sensorInfo);
    } else {
      sensorInfo = integrateSensorsMap.get(name);
      sensorInfo.sensor_hash = obj[integrateFreeformSensorHashIndex] as string;
      sensorInfo.broker_hash = obj[integrateFreeformBrokerHashIndex] as string;
      sensorInfo.broker_endpoint = obj[integrateFreeformBrokerEndpointIndex] as string;
    }

    if (integrateFreeformBrokerNameIndex !== null) {
      sensorInfo.broker_name = obj[integrateFreeformBrokerNameIndex] as string;
    }
    if (integrateFreeformCpmIndex !== null) {
      sensorInfo.cpm = obj[integrateFreeformCpmIndex] as number;
    }
    if (integrateFreeformCpkbIndex !== null) {
      sensorInfo.cpkb = obj[integrateFreeformCpkbIndex] as number;
    }
  };

  integrateFreeformGo.onclick = (_) => {
    const input = integrateFreeformQueryInput.value;

    integrateFreeformGo.disabled = true;

    clearTable(integrateFreeformHead);
    clearTable(integrateFreeformBody);

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

      integrateFreeformCurRes = res;

      integrateFreeformHeaders.clear();
      for (const header of res.headers) {
        integrateFreeformHeaders.set(header, integrateFreeformHeaders.size);
      }

      integrateFreeformNameIndex = integrateFreeformHeaders.has("sensor_name") ? integrateFreeformHeaders.get("sensor_name") : null;
      integrateFreeformSensorHashIndex = integrateFreeformHeaders.has("sensor_hash") ? integrateFreeformHeaders.get("sensor_hash") : null;
      integrateFreeformBrokerHashIndex = integrateFreeformHeaders.has("broker_hash") ? integrateFreeformHeaders.get("broker_hash") : null;
      integrateFreeformBrokerEndpointIndex = integrateFreeformHeaders.has("broker_endpoint") ? integrateFreeformHeaders.get("broker_endpoint") : null;
      integrateFreeformBrokerNameIndex = integrateFreeformHeaders.has("broker_name") ? integrateFreeformHeaders.get("broker_name") : null;
      integrateFreeformCpmIndex = integrateFreeformHeaders.has("sensor_cpm") ? integrateFreeformHeaders.get("sensor_cpm") : null;
      integrateFreeformCpkbIndex = integrateFreeformHeaders.has("sensor_cpkb") ? integrateFreeformHeaders.get("sensor_cpkb") : null;

      integrateFreeformAdd.disabled = !(
        integrateFreeformNameIndex !== null &&
        integrateFreeformSensorHashIndex !== null &&
        integrateFreeformBrokerHashIndex !== null &&
        integrateFreeformBrokerEndpointIndex !== null);

      const headerRow = integrateFreeformHead.insertRow(-1);
      //we reserve column 0 for the add button
      const buttonHeader = document.createElement('th');
      headerRow.appendChild(buttonHeader);
      for (let i = 0; i < integrateFreeformHeaders.size; ++i) {
        const created = document.createElement('th');
        created.innerHTML = res.headers[i];
        headerRow.appendChild(created);
      }

      for (const obj of res.values) {
        const dataRow = integrateFreeformBody.insertRow();

        const addCell = dataRow.insertCell();
        const addButton = document.createElement('button');
        addButton.disabled = integrateFreeformAdd.disabled;
        addButton.innerHTML = "Add Sensor";
        addButton.addEventListener('click', ((obj) => {
          return () => addFreeformToIntegrate(obj);
        })(obj));
        addCell.appendChild(addButton);

        for (let i = 0; i < integrateFreeformHeaders.size; ++i) {
          const newCell = dataRow.insertCell();
          newCell.style.border = "1px solid black";
          newCell.innerHTML = String(obj[i]);
        }
      }
      statusOK(operationStatus, "Finished query");
    }).finally(() => {
      integrateFreeformGo.disabled = false;
    });
  };

  integrateFreeformAdd.onclick = (_) => {
    for (const obj of integrateFreeformCurRes.values) {
      addFreeformToIntegrate(obj);
    }

    document.getElementById("integrateButton").click();
  };

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
        sensorNameCell.textContent = display.sensor;

        const brokerIpCell = dataRow.insertCell();
        brokerIpCell.style.border = "1px solid black";
        brokerIpCell.textContent = "mqtt://" + display.brokerIp;

        const topicCell = dataRow.insertCell();
        topicCell.style.border = "1px solid black";
        topicCell.textContent = 'out/' + res.hash + '/' + display.index;
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