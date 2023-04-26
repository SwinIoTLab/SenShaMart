function startSenshamartWalletUI() {
  const publicKeySpan = document.getElementById("publicKey");
  const coinCountSpan = document.getElementById("coinCount");
  const status = document.getElementById("status");

  var currentTab = document.getElementById("payTab");

  const initTab = function (baseName) {
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
      tab.style.display = "initial";
      currentTab = tab;
    };
  };

  initTab("pay");
  initTab("query");
  initTab("sensorInfo");
  initTab("brokerInfo");
  initTab("registerSensor");
  initTab("registerBroker");
  initTab("integrate");
  currentTab.style.display = "initial";

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

  //sensorInfo
  const sensorFilter = document.getElementById("sensorFilter");
  const inSensorsSelect = {};
  const sensorsSelect = document.getElementById("sensors");
  const refreshButton = document.getElementById("refresh");


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
    if (loaded !== true) {
      return;
    }
    if (refreshCounter !== 0) {
      status.innerHTML = "Couldn't refresh, already currently refreshing";
      return;
    }

    const updateInfo = function (type, newData) {
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

    const refreshFetch = function (type, path) {
      fetch(path).then(function (res) {
        return res.json();
      }).then(function (data) {
        updateInfo(type, data);
      }).catch(function (err) {
        console.log(err);
        statusError(`Error: ${err}`);
        refreshFailed = true;
      }).finally(function () {
        refreshCounter--;
        if (refreshCounter === 0 && refreshFailed === false) {
          statusOK("Refresh finished");
        }
      });
    };

    refreshCounter = 2;
    refreshFailed = false;
    statusWorking("Refreshing");

    refreshFetch(refreshInfo.sensor, "/Sensors");
    refreshFetch(refreshInfo.balance, "/Balances");
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

  //our balace header
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

  //pay
  const payWallets = document.getElementById("payWallets");
  const payInfo = document.getElementById("payInfo");

  const payAmount = document.getElementById("payAmount");
  const payTo = document.getElementById("payTo");
  const payReward = document.getElementById("payReward");
  const payDo = document.getElementById("payDo");

  payDo.onclick = function (_) {
    if (payTo.value === "") {
      statusError("Empty wallet to pay to");
      return;
    }

    const payAmountValue = Number.parseInt(payAmount.value);

    if (Number.isNaN(payAmountValue)) {
      statusError("Couldn't convert pay amount to a number");
      return;
    }
    if (payAmountValue <= 0) {
      statusError("Trying to pay a non-positive amount");
      return;
    }

    const payRewardValue = Number.parseInt(payReward.value);

    if (Number.isNaN(payRewardValue)) {
      statusError("Couldn't convert pay reward to a number");
      return;
    }
    if (payReward.value < 0) {
      statusError("Trying to reward a negative amount");
      return;
    }

    fetch('/Payment', {
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        rewardAmount: payRewardValue,
        outputs: [{
            publicKey: payTo.value,
            amount: payAmountValue
          }]
      })
    });
  };

  refreshInfo.balance.onNew.push(function (key, data) {
    const newOption = new Option(key,key);
    payWallets.appendChild(newOption);
  });

  refreshInfo.balance.onDel.push(function (key) {
    const child = payWallets.namedItem(key);
    if (child !== null) {
      payWallets.removeChild(child);
    }
  });

  refreshInfo.balance.onChange.push(function (key, data) {
    const child = payWallets.namedItem(key);
    if (child === null) {
      return;
    }
    if (child.selected) {
      payInfo.innerHTML = data.balance;
    }
  });

  payWallets.oninput = function (_) {
    if (payWallets.selectedIndex === -1) {
      payInfo.innerHTML = "";
      return;
    }

    const selectedIndex = payWallets.selectedIndex;
    const selectedOption = payWallets.item(selectedIndex);
    const selectedBalance = refreshInfo.balance.vals[selectedOption.value];

    payInfo.innerHTML = selectedBalance.balance;
    payTo.value = selectedOption.value;
  };

  //query

  const queryInput = document.getElementById("queryInput");
  const queryGo = document.getElementById("queryGo");
  const queryHead = document.getElementById("queryHead");
  const queryBody = document.getElementById("queryBody");

  const queryClearTable = function (obj) {
    while (obj.rows.length !== 0) {
      obj.deleteRow(-1);
    }
  };

  queryGo.onclick = function (_) {
    const input = queryInput.value;

    queryGo.disabled = true;

    queryClearTable(queryHead);
    queryClearTable(queryBody);

    fetch("/sparql", {
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: input
      })
    }).then(function (res) {
      return res.json();
    }).then(function (entries) {
      
      const headers = new Map();

      for (const obj of entries) {
        for (const [key, value] of Object.entries(obj)) {
          if (!headers.has(key)) {
            headers.set(key, headers.size);
          }
        }
      }

      const headerRow = queryHead.insertRow(-1);
      const headerCells = [];
      for (var i = 0; i < headers.size; ++i) {
        const created = document.createElement('th');
        headerRow.appendChild(created);
        headerCells.push(created);
      }

      for (const [key, value] of headers) {
        headerCells[value].innerHTML = key;
      }

      for (const obj of entries) {
        const dataRow = queryBody.insertRow();

        const cells = [];

        for (var i = 0; i < headers.size; ++i) {
          cells.push(dataRow.insertCell());
        }

        for (const [key, value] of Object.entries(obj)) {
          cells[headers.get(key)].innerHTML = value.value;
        }
      }
      queryGo.disabled = false;
    });
  };

  //sensor
  const sensorSensors = document.getElementById("sensorSensors");
  const sensorInfo = document.getElementById("sensorInfo");

  refreshInfo.sensor.onNew.push(function(key, data) {
    const newOption = new Option(key, key);
  });
}