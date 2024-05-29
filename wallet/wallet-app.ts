//WALLET
import express from 'express';
import bodyParser from 'body-parser';
import { PropServer as BlockchainProp, type SocketConstructor } from '../network/blockchain-prop.js';

import Wallet from './wallet.js';
import Config from '../util/config.js';
import { ChainUtil, isFailure, type ResultSuccess } from '../util/chain-util.js';

import { Blockchain, type IntegrationExpanded } from '../blockchain/blockchain.js';
//import { Persistence, type Underlying as UnderlyingPersistence } from '../blockchain/persistence.js';
//import fs from 'fs';
import { WebSocket, WebSocketServer } from 'ws';

import {
  DEFAULT_UI_HTML,
  DEFAULT_UI_JS,
  DEFAULT_DEMO_UI_HTML,
  DEFAULT_DEMO_UI_JS,
  DEFAULT_PROVIDER_UI_HTML,
  DEFAULT_PROVIDER_UI_JS,
  DEFAULT_BROKER_UI_HTML,
  DEFAULT_BROKER_UI_JS,
  DEFAULT_APPLICATION_UI_HTML,
  DEFAULT_APPLICATION_UI_JS,
  DEFAULT_PORT_WALLET_API,
  DEFAULT_PORT_WALLET_CHAIN,
  DEFAULT_PORT_MINER_CHAIN
} from '../util/constants.js';
import SensorRegistration from '../blockchain/sensor-registration.js';
import BrokerRegistration from '../blockchain/broker-registration.js';
import Integration from '../blockchain/integration.js';

'use strict';

const CONFIGS_STORAGE_LOCATION = "./settings.json";

const config = new Config(CONFIGS_STORAGE_LOCATION);

const wallet = new Wallet(config.get({
  key: "wallet-keypair",
  default: ChainUtil.genKeyPair(),
  transform: ChainUtil.deserializeKeyPair
}));
const apiPort = config.get({
  key: "wallet-api-port",
  default: DEFAULT_PORT_WALLET_API
});
const persistenceLocation = config.get({
  key: "wallet-blockchain",
  default: "./wallet_blockchain.db"
});
const chainServerPort = config.get({
  key: "wallet-chain-server-port",
  default: DEFAULT_PORT_WALLET_CHAIN
});
const fusekiLocation = config.get({
  key: "wallet-fuseki",
  default: null
});
const chainServerPublicAddress = config.get({
  key: "wallet-chain-server-public-address",
  default: "-"
});
const chainServerPeers = config.get({
  key: "wallet-chain-server-peers",
  default: ["ws://127.0.0.1:" + DEFAULT_PORT_MINER_CHAIN]
});
const uiHtmlLocation = config.get({
  key: "wallet-ui-html",
  default: DEFAULT_UI_HTML
});
const uiJsLocation = config.get({
  key: "wallet-ui-js",
  default: DEFAULT_UI_JS
});
const demoUiHtmlLocation = config.get({
  key: "wallet-demo-ui-html",
  default: DEFAULT_DEMO_UI_HTML
});
const demoUiJsLocation = config.get({
  key: "wallet-demo-ui-js",
  default: DEFAULT_DEMO_UI_JS
});
const providerUiHtmlLocation = config.get({
  key: "wallet-provider-ui-html",
  default: DEFAULT_PROVIDER_UI_HTML
});
const providerUiJsLocation = config.get({
  key: "wallet-provider-ui-js",
  default: DEFAULT_PROVIDER_UI_JS
});
const brokerUiHtmlLocation = config.get({
  key: "wallet-broker-ui-html",
  default: DEFAULT_BROKER_UI_HTML
});
const brokerUiJsLocation = config.get({
  key: "wallet-broker-ui-js",
  default: DEFAULT_BROKER_UI_JS
});
const applicationUiHtmlLocation = config.get({
  key: "wallet-application-ui-html",
  default: DEFAULT_APPLICATION_UI_HTML
});
const applicationUiJsLocation = config.get({
  key: "wallet-application-ui-js",
  default: DEFAULT_APPLICATION_UI_JS
});

let blockchain: null | Blockchain = null;
let chainServer: null | BlockchainProp = null;
const app = express();

app.use(bodyParser.json());

app.use(function (_req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Method', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});


app.get('/logic.js', (_req, res) => {
  res.type('.js').sendFile(uiJsLocation, {
    root: "./"
  });
});
app.get('/ui.html', (_req, res) => {
  res.type('.html').sendFile(uiHtmlLocation, {
    root: "./"
  });
});

app.get('/demo-logic.js', (_req, res) => {
  res.type('.js').sendFile(demoUiJsLocation, {
    root: "./"
  });
});
app.get('/demo-ui.html', (_req, res) => {
  res.type('.html').sendFile(demoUiHtmlLocation, {
    root: "./"
  });
});

app.get('/provider.js', (_req, res) => {
  res.type('.js').sendFile(providerUiJsLocation, {
    root: "./"
  });
});
app.get('/provider.html', (_req, res) => {
  res.type('.html').sendFile(providerUiHtmlLocation, {
    root: "./"
  });
});

app.get('/broker.js', (_req, res) => {
  res.type('.js').sendFile(brokerUiJsLocation, {
    root: "./"
  });
});
app.get('/broker.html', (_req, res) => {
  res.type('.html').sendFile(brokerUiHtmlLocation, {
    root: "./"
  });
});

app.get('/application.js', (_req, res) => {
  res.type('.js').sendFile(applicationUiJsLocation, {
    root: "./"
  });
});
app.get('/application.html', (_req, res) => {
  res.type('.html').sendFile(applicationUiHtmlLocation, {
    root: "./"
  });
});


app.post('/ChainServer/connect', (req, res) => {
  chainServer.connect(req.body.url);
  res.json("Connecting");
});

app.get('/gen-key', (_req, res) => {
  res.json(ChainUtil.serializeKeyPair(ChainUtil.genKeyPair()));
});

app.get('/public-key', (_req, res) => {
  res.json(wallet.publicKey);
});

app.get('/key-pair', (_req, res) => {
  res.json(ChainUtil.serializeKeyPair(wallet.keyPair));
});

app.get('/MyBalance', (_req, res) => {
  res.json(blockchain.getBalanceCopy(wallet.publicKey));
});
app.get('/chain-length', (_req, res) => {
  res.json(blockchain.length());
});
type BalanceGetRes = {
  [index: string]: number
};
app.get('/Balance', (req, res) => {
  const balance = blockchain.getBalanceCopy(req.body.publicKey);
  res.json(balance);
});
app.get('/Balance/Ours', (_req, res) => {
  const returning: BalanceGetRes = {};

  returning[wallet.publicKey] = blockchain.getBalanceCopy(wallet.publicKey);

  res.json(returning);
});
app.get('/Balances', (_req, res) => {
  const returning: BalanceGetRes = {};
  for (const [key, amount] of blockchain.data.WALLET) {
    returning[key] = amount.base.balance;
  }
  res.json(returning);
});

app.post('/Payment/Register', (req, res) => {
  console.log(JSON.stringify(req.body));
  const rewardAmount = req.body.rewardAmount;
  const outputs = req.body.outputs;

  const payment = wallet.createPaymentAsTransaction(
    blockchain,
    rewardAmount,
    outputs);

  chainServer.sendTx(payment);

  res.json(payment.tx);
});

//const integrationRegisterValidators = {
//  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
//  witnessCount: ChainUtil.createValidateIsIntegerWithMin(0),
//  outputs: ChainUtil.createValidateObject(
//};

//Integration
type IntegrationAllRes = {
  [index: string]: Integration;
}

type IntegrationUsesOwnedByRes = ResultSuccess & {
  value: {
    [index: string]: IntegrationExpanded;
  };
}

app.get('/Integration/All', (_req, res) => {
  const returning: IntegrationAllRes = {};
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    returning[key] = integration.base;
  }
  res.json(returning);
});

app.post('/Integration/Register', (req, res) => {
  try {
    const integration = wallet.createIntegrationAsTransaction(
      blockchain,
      req.body.rewardAmount,
      req.body.witnessCount,
      req.body.outputs);

    chainServer.sendTx(integration);

    res.json({
      result: true,
      tx: integration.tx,
      hash: integration.type.hashToSign(integration.tx)
    });
  } catch (err) {
    console.log(err);
    res.json({
      result: false,
      reason: err.message
    });
  }
});

const integrationUsesOwnedByValidators = {
  owner: ChainUtil.validateIsPublicKey
} as const;
app.post('/Integration/UsesOwnedBy', (req, res) => {
  const validateRes = ChainUtil.validateObject(req.body, integrationUsesOwnedByValidators);

  if (isFailure(validateRes)) {
    res.json({
      result: false,
      reason: validateRes.reason
    });
    return;
  }

  const returning: IntegrationUsesOwnedByRes = {
    result: true,
    value: {},
  };
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    console.log(`integration: ${Integration.hashToSign(integration.base)} with ${integration.base.outputs.length} outputs`);
    for (const output of integration.base.outputs) {
      const foundSensor = blockchain.getSensorInfo(output.sensorName);
      console.log(`foundSensor: ${foundSensor}, with input = ${foundSensor !== null ? foundSensor.input : null}`);
      if (foundSensor !== null && foundSensor.input === req.body.pubKey) {
        returning.value[key] = integration.base;
        break;
      }
    }
  }
  res.json(returning);
});

app.get('/Integration/Ours', (_req, res) => {
  const returning: IntegrationUsesOwnedByRes = {
    result: true,
    value: {}
  };
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    if (integration.base.input === wallet.publicKey) {
      returning.value[key] = integration.base;
    }
  }
  res.json(returning);
});

app.get('/Integration/UsesOurSensors', (_req, res) => {
  const returning: IntegrationUsesOwnedByRes = {
    result: true,
    value: {},
  };
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    console.log(`integration: ${Integration.hashToSign(integration.base)} with ${integration.base.outputs.length} outputs`);
    for (const output of integration.base.outputs) {
      const foundSensor = blockchain.getSensorInfo(output.sensorName);
      console.log(`foundSensor: ${foundSensor}, with input = ${foundSensor !== null ? foundSensor.input : null}`);
      if (foundSensor !== null && foundSensor.input === wallet.publicKey) {
        returning.value[key] = integration.base;
        break;
      }
    }
  }
  res.json(returning);
});

app.get('/Integration/OurBrokersBrokering', (_req, res) => {

  const returning: IntegrationUsesOwnedByRes = {
    result: true,
    value: {}
  };
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    for (const output of integration.base.outputsExtra) {
      const foundBroker = blockchain.getBrokerInfo(output.broker);
      if (foundBroker !== null && foundBroker.input === wallet.publicKey) {
        returning.value[key] = integration.base;
        break;
      }
    }
  }
  res.json(returning);
});

app.get('/Integration/OurBrokersWitnessing', (_req, res) => {

  const returning: IntegrationUsesOwnedByRes = {
    result: true,
    value: {}
  };
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    for (let i = 0; i < integration.base.outputs.length; i++) {
      const extra = integration.base.outputsExtra[i];
      if (Object.hasOwn(extra.witnesses, wallet.publicKey)) {
        returning.value[key] = integration.base;
        break;
      }
    }
  }
  res.json(returning);
});

//BrokerRegistration
type BrokerRegistrationGetRes = {
  [index: string]: BrokerRegistration & {
    hash: string;
  };
}
app.get('/BrokerRegistration/All', (_req, res) => {
  const returning: BrokerRegistrationGetRes = {};
  for (const [key, value] of blockchain.data.BROKER) {
    returning[key] = Object.assign({
      hash: BrokerRegistration.hashToSign(value.base)
    }, value.base);
  }
  res.json(returning);
});

const brokerRegistrationRegisterValidators = {
  brokerName: ChainUtil.validateIsString,
  endpoint: ChainUtil.validateIsString,
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  extraNodeMetadata: ChainUtil.createValidateOptional(
    ChainUtil.validateIsObject),
  extraLiteralMetadata: ChainUtil.createValidateOptional(
    ChainUtil.validateIsObject)
};

app.post('/BrokerRegistration/Register', (req, res) => {
  const validateRes = ChainUtil.validateObject(req.body, brokerRegistrationRegisterValidators);

  if (isFailure(validateRes)) {
    res.json(validateRes.reason);
    return;
  }

  try {
    const reg = wallet.createBrokerRegistrationAsTransaction(
      blockchain,
      req.body.rewardAmount,
      req.body.brokerName,
      req.body.endpoint,
      req.body.extraNodeMetadata,
      req.body.extraLiteralMetadata);

    chainServer.sendTx(reg);

    res.json({
      result: true,
      tx: reg.tx
    });
  } catch (err) {
    console.log(err);
    res.json({
      result: false,
      reason: err.message
    });
  }
});

const brokerRegistrationOwnedByValidators = {
  owner: ChainUtil.validateIsPublicKey
} as const;
app.post('/BrokerRegistration/OwnedBy', (req, res) => {
  const validateRes = ChainUtil.validateObject(req.body, brokerRegistrationOwnedByValidators);

  if (isFailure(validateRes)) {
    res.json({
      result: false,
      reason: validateRes.reason
    });
    return;
  }

  const returning: BrokerRegistrationGetRes = {};

  for (const [key, value] of blockchain.data.BROKER) {
    if (value.base.input !== req.body.owner) {
      continue;
    }
    returning[key] = Object.assign({
      hash: BrokerRegistration.hashToSign(value.base)
    }, value.base);
  }
  res.json(returning);
  console.log("/BrokerRegistration/OwnedBy called");
  console.log(`Returned ${Object.entries(returning).length} brokers`);
});
app.get('/BrokerRegistration/Ours', (_req, res) => {

  const returning: BrokerRegistrationGetRes = {};

  for (const [key, value] of blockchain.data.BROKER) {
    if (value.base.input !== wallet.publicKey) {
      continue;
    }
    returning[key] = Object.assign({
      hash: BrokerRegistration.hashToSign(value.base)
    }, value.base);
  }
  res.json(returning);
  console.log("/BrokerRegistration/OwnedBy called");
  console.log(`Returned ${Object.entries(returning).length} brokers`);
});

//SensorRegistration
type SensorRegistrationGetRes = {
  [index: string]: SensorRegistration & {
    hash: string;
  };
}
app.get('/SensorRegistration/All', (_req, res) => {
  const returning: SensorRegistrationGetRes = {};
  for (const [key, value] of blockchain.data.SENSOR) {
    returning[key] = Object.assign({
      hash: SensorRegistration.hashToSign(value.base)
    }, value.base);
  }
  res.json(returning);
  console.log("/SensorRegistration/All called");
  console.log(`Returned ${Object.entries(returning).length} sensors`);
});

const sensorRegistrationRegisterValidators = {
  sensorName: ChainUtil.validateIsString,
  costPerMinute: ChainUtil.createValidateIsIntegerWithMin(0),
  costPerKB: ChainUtil.createValidateIsIntegerWithMin(0),
  integrationBroker: ChainUtil.validateIsString,
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  extraNodeMetadata: ChainUtil.createValidateOptional(
    ChainUtil.validateIsObject),
  extraLiteralMetadata: ChainUtil.createValidateOptional(
    ChainUtil.validateIsObject)
} as const;
app.post('/SensorRegistration/Register', (req, res) => {
  const validateRes = ChainUtil.validateObject(req.body, sensorRegistrationRegisterValidators);

  if (isFailure(validateRes)) {
    res.json({
      result: false,
      reason: validateRes.reason
    });
    return;
  }

  try {
    const reg = wallet.createSensorRegistrationAsTransaction(
      blockchain,
      req.body.rewardAmount,
      req.body.sensorName,
      req.body.costPerMinute,
      req.body.costPerKB,
      req.body.integrationBroker,
      req.body.extraNodeMetadata,
      req.body.extraLiteralMetadata);

    chainServer.sendTx(reg);

    res.json({
      result: true,
      tx: reg.tx
    });
  } catch (err) {
    console.log(err);
    res.json({
      result: false,
      reason: err.message
    });
  }
});

const sensorRegistrationOwnedByValidators = {
  owner: ChainUtil.validateIsPublicKey
} as const;
app.post('/SensorRegistration/OwnedBy', (req, res) => {
  const validateRes = ChainUtil.validateObject(req.body, sensorRegistrationOwnedByValidators);

  if (isFailure(validateRes)) {
    res.json({
      result: false,
      reason: validateRes.reason
    });
    return;
  }

  const returning: SensorRegistrationGetRes = {};

  for (const [key, value] of blockchain.data.SENSOR) {
    if (value.base.input !== req.body.owner) {
      continue;
    }
    returning[key] = Object.assign({
      hash: SensorRegistration.hashToSign(value.base)
    }, value.base);
  }
  res.json(returning);
  console.log("/SensorRegistration/OwnedBy called");
  console.log(`Returned ${Object.entries(returning).length} sensors`);
});

app.get('/SensorRegistration/Ours', (_req, res) => {
  const returning: SensorRegistrationGetRes = {};

  for (const [key, value] of blockchain.data.SENSOR) {
    if (value.base.input !== wallet.publicKey) {
      continue;
    }
    returning[key] = Object.assign({
      hash: SensorRegistration.hashToSign(value.base)
    }, value.base);
  }
  res.json(returning);
  console.log("/SensorRegistration/Ours called");
  console.log(`Returned ${Object.entries(returning).length} sensors`);
});

//TODO: probably want to move query logic into blockchain
type FusekiQueryRes = {
  head: {
    vars: string[];
  };
  results: {
    bindings: {
      [index: string]: {
        type: string;
        value: string | number;
      };
    }[];
  }
};

type QueryResult = {
  headers: string[];
  values: (string | number)[][];
}

app.post('/sparql', (req, res) => {
  if (blockchain.fuseki_location === null) {
    res.json({
      result: false,
      reason: "We aren't connected to an RDF DB instance"
    });
    return;
  }

  if (isFailure(ChainUtil.validateIsString(req.body.query))) {
    res.json({
      result: false,
      reason: "Body missing a query field that is a string"
    });
    return;
  }

  fetch(blockchain.fuseki_location + "/query", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    body: 'query=' + encodeURIComponent(req.body.query)
  }).then(res => {
    return res.json();
  }).then((fusekiRes: FusekiQueryRes) => {
    const returning: QueryResult = {
      headers: fusekiRes.head.vars,
      values: []
    };

    for (const row of Object.values(fusekiRes.results.bindings)) {
      const adding = [];
      for (const k of returning.headers) {
        adding.push(row[k].value);
      }
      returning.values.push(adding);
    }

    res.json(returning);
  }).catch((err) => {
    res.json({
      result: false,
      reason: err
    });
  });
});

blockchain = await Blockchain.create(persistenceLocation, fusekiLocation);


chainServer = new BlockchainProp("Wallet-chain-server", blockchain, WebSocket as unknown as SocketConstructor, WebSocketServer);
chainServer.start(chainServerPort, chainServerPublicAddress, chainServerPeers); 

app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));

