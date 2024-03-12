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

  let currentTab = document.getElementById("brokersTab");

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
}