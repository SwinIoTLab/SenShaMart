//WALLET
import express from 'express';
import bodyParser from 'body-parser';
import { PropServer as BlockchainProp, type SocketConstructor } from '../network/blockchain-prop.js';

import Wallet from './public-wallet.js';
import Config from '../util/config.js';
import { ChainUtil, isFailure, type ResultSuccess } from '../util/chain-util.js';

import { Blockchain, type IntegrationExpanded } from '../blockchain/blockchain.js';
//import { Persistence, type Underlying as UnderlyingPersistence } from '../blockchain/persistence.js';
//import fs from 'fs';
import { WebSocket, WebSocketServer } from 'ws';

import {
  DEFAULT_PUBLIC_WALLET_UI_BASE,
  DEFAULT_PORT_PUBLIC_WALLET_API,
  DEFAULT_PORT_PUBLIC_WALLET_CHAIN,
  DEFAULT_PORT_MINER_CHAIN
} from '../util/constants.js';
import SensorRegistration from '../blockchain/sensor-registration.js';
import BrokerRegistration from '../blockchain/broker-registration.js';
import Integration from '../blockchain/integration.js';

'use strict';

const CONFIGS_STORAGE_LOCATION = "./settings.json";

const config = new Config(CONFIGS_STORAGE_LOCATION);

const wallet = new Wallet();
const apiPort = config.get({
  key: "public-wallet-api-port",
  default: DEFAULT_PORT_PUBLIC_WALLET_API
});
const persistenceLocation = config.get({
  key: "public-wallet-blockchain",
  default: "./public_wallet_blockchain.db"
});
const chainServerPort = config.get({
  key: "public-wallet-chain-server-port",
  default: DEFAULT_PORT_PUBLIC_WALLET_CHAIN
});
const fusekiLocation = config.get({
  key: "public-wallet-fuseki",
  default: null
});
const chainServerPublicAddress = config.get({
  key: "public-wallet-chain-server-public-address",
  default: "-"
});
const chainServerPeers = config.get({
  key: "public-wallet-chain-server-peers",
  default: ["ws://127.0.0.1:" + DEFAULT_PORT_MINER_CHAIN]
});
const uiBaseLocation = config.get({
  key: "wallet-ui-base",
  default: DEFAULT_PUBLIC_WALLET_UI_BASE
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

const add_static_file = (url: string, location: string, type: string) => {
  app.get(url, (_req, res) => {
    res.type(type).sendFile(location, {
      root: "./"
    });
  });
};

add_static_file('/wallet.js', uiBaseLocation + 'public-wallet.js', '.js');
add_static_file('/sensorList.js', uiBaseLocation + 'sensorList.js', '.js');
add_static_file('/info.js', uiBaseLocation + 'info.js', '.js');
add_static_file('/wallet.html', uiBaseLocation + 'public-wallet.html', '.html');


app.post('/ChainServer/connect', (req, res) => {
  chainServer.connect(req.body.url);
  res.json("Connecting");
});

app.get('/gen-key', (_req, res) => {
  res.json({
    result: true,
    value: ChainUtil.serializeKeyPair(ChainUtil.genKeyPair())
  });
});

app.post('/PubKeyFor', (req, res) => {
  //try {
    res.json({
      result: true,
      value: ChainUtil.deserializeKeyPair(req.body.keyPair).pubSerialized
    });
  //} catch (err) {
  //  res.json({
  //   result: false,
  //    reason: err.message
  //  });
  //}
});

app.get('/chain-length', (_req, res) => {
  res.json(blockchain.length());
});
type BalanceGetRes = {
  [index: string]: number
};
app.post('/Balance', (req, res) => {
  const balance = blockchain.getBalanceCopy(req.body.pubKey);
  res.json(balance);
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
  try {
    const keyPair = ChainUtil.deserializeKeyPair(req.body.keyPair);
    const rewardAmount = req.body.rewardAmount;
    const outputs = req.body.outputs;

    const payment = wallet.createPaymentAsTransaction(
      keyPair,
      blockchain,
      rewardAmount,
      outputs);

    chainServer.sendTx(payment);

    res.json(payment.tx);
  } catch (err) {
    console.log(err);
    res.json({
      result: false,
      reason: err.message
    });
  }
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
app.get('/Integration/All', (_req, res) => {
  const returning: IntegrationAllRes = {};
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    returning[key] = integration.base;
  }
  res.json(returning);
});

app.post('/Integration/Register', (req, res) => {
  try {
    const keyPair = ChainUtil.deserializeKeyPair(req.body.keyPair);

    const integration = wallet.createIntegrationAsTransaction(
      keyPair,
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
  pubKey: ChainUtil.validateIsPublicKey
} as const;
type IntegrationUsesOwnedByRes = {
  [index: string]: IntegrationExpanded;
}
app.post('/Integration/UsesOwnedBy', (req, res) => {
  const validateRes = ChainUtil.validateObject(req.body, integrationUsesOwnedByValidators);

  if (isFailure(validateRes)) {
    res.json({
      result: false,
      reason: validateRes.reason
    });
    return;
  }

  const returning: IntegrationUsesOwnedByRes = {};
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    console.log(`integration: ${Integration.hashToSign(integration.base)} with ${integration.base.outputs.length} outputs`);
    for (const output of integration.base.outputs) {
      const foundSensor = blockchain.getSensorInfo(output.sensorName);
      console.log(`foundSensor: ${foundSensor}, with input = ${foundSensor !== null ? foundSensor.input : null}`);
      if (foundSensor !== null && foundSensor.input === req.body.pubKey) {
        returning[key] = integration.base;
        break;
      }
    }
  }
  res.json(returning);
});

app.post('/Integration/OwnedBy', (req, res) => {
  const returning: IntegrationUsesOwnedByRes = {};
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    if (integration.base.input === req.body.pubKey) {
      returning[key] = integration.base;
    }
  }
  res.json(returning);
});

app.get('/Integration/OurBrokersBrokering', (req, res) => {

  const returning: IntegrationUsesOwnedByRes = {};
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    for (const output of integration.base.outputsExtra) {
      const foundBroker = blockchain.getBrokerInfo(output.broker);
      if (foundBroker !== null && foundBroker.input === req.body.pubKey) {
        returning[key] = integration.base;
        break;
      }
    }
  }
  res.json(returning);
});

app.get('/Integration/OurBrokersWitnessing', (req, res) => {

  const returning: IntegrationUsesOwnedByRes = {};
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    for (const witness of Object.keys(integration.base.witnesses)) {
      const foundBroker = blockchain.getBrokerInfo(witness);
      if (foundBroker !== null && foundBroker.input === req.body.pubKey) {
        returning[key] = integration.base;
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
  keyPair: ChainUtil.validateIsKeyPair,
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
    const keyPair = ChainUtil.deserializeKeyPair(req.body.keyPair);

    const reg = wallet.createBrokerRegistrationAsTransaction(
      keyPair,
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
  pubKey: ChainUtil.validateIsPublicKey
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
    if (value.base.input !== req.body.pubKey) {
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
  keyPair: ChainUtil.validateIsKeyPair,
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
    const keyPair = ChainUtil.deserializeKeyPair(req.body.keyPair);

    const reg = wallet.createSensorRegistrationAsTransaction(
      keyPair,
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
  pubKey: ChainUtil.validateIsPublicKey
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
    if (value.base.input !== req.body.pubKey) {
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

interface QueryResult extends ResultSuccess {
  result: true,
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
      result: true,
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

blockchain = new Blockchain(persistenceLocation, fusekiLocation, (err) => {
  if (isFailure(err)) {
    console.log(`Couldn't load blockchain: ${err.reason}`);
    return;
  }
  chainServer = new BlockchainProp("Wallet-chain-server", blockchain, WebSocket as unknown as SocketConstructor, WebSocketServer);
  chainServer.start(chainServerPort, chainServerPublicAddress, chainServerPeers); 

  app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));
});

