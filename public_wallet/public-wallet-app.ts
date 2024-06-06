/**
 *    Copyright (c) 2022-2024, SenShaMart
 *
 *    This file is part of SenShaMart.
 *
 *    SenShaMart is free software: you can redistribute it and/or modify
 *    it under the terms of the GNU Lesser General Public License.
 *
 *    SenShaMart is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Lesser General Public License for more details.
 *
 *    You should have received a copy of the GNU Lesser General Public License
 *    along with SenShaMart.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

/**
 * @author Anas Dawod e-mail: adawod@swin.edu.au
 */

//WALLET
import type { RouteParameters } from 'express-serve-static-core';
import { default as express } from 'express';
import bodyParser from 'body-parser';
import { PropServer as BlockchainProp, type SocketConstructor } from '../network/blockchain-prop.js';

import Wallet from './public-wallet.js';
import Config from '../util/config.js';
import { ChainUtil, isFailure, type ResultSuccess } from '../util/chain-util.js';

import { Blockchain, type IntegrationExpanded, INTEGRATION_STATE} from '../blockchain/blockchain.js';
//import { Persistence, type Underlying as UnderlyingPersistence } from '../blockchain/persistence.js';
//import fs from 'fs';
import { WebSocket, WebSocketServer } from 'ws';

import {
  DEFAULT_PUBLIC_WALLET_UI_BASE,
  DEFAULT_PORT_PUBLIC_WALLET_API,
  DEFAULT_PORT_PUBLIC_WALLET_CHAIN,
  DEFAULT_PORT_MINER_CHAIN,
  INITIAL_BALANCE
} from '../util/constants.js';
import SensorRegistration from '../blockchain/sensor-registration.js';
import BrokerRegistration from '../blockchain/broker-registration.js';
import Integration from '../blockchain/integration.js';
import { randomInt } from 'crypto';

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
add_static_file('/brokerList.js', uiBaseLocation + 'brokerList.js', '.js');
add_static_file('/info.js', uiBaseLocation + 'info.js', '.js');
add_static_file('/wallet.html', uiBaseLocation + 'public-wallet.html', '.html');
add_static_file('/n3.js', uiBaseLocation + 'n3.js', '.js');


app.post('/ChainServer/connect', (req, res) => {
  chainServer.connect(req.body.url);
  res.json({
    result: true
  });
});

type PubKeyedBody = {
  pubKey: string;
};

app.get('/gen-key', (_req, res) => {
  res.json({
    result: true,
    value: ChainUtil.serializeKeyPair(ChainUtil.genKeyPair())
  });
});

app.post('/PubKeyFor', (req, res) => {
  try {
    res.json({
      result: true,
      value: ChainUtil.deserializeKeyPair(req.body.keyPair).pubSerialized
    });
  } catch (err) {
    res.json({
     result: false,
      reason: err.message
    });
  }
});

app.get('/chain-length', (_req, res) => {
  res.json({
    result: true,
    value: blockchain.length()
  });
});
type BalanceGetRes = ResultSuccess & {
  default: number;
  value: {
    [index: string]: number;
  };
};
app.post<string, RouteParameters<string>, BalanceGetRes, PubKeyedBody>('/Balance', (req, res) => {
  const balance = blockchain.getBalanceCopy(req.body.pubKey);

  const returning: BalanceGetRes = {
    result: true,
    default: INITIAL_BALANCE,
    value: {}
  };

  returning.value[req.body.pubKey] = balance;

  res.json(returning);
});
app.get<string, RouteParameters<string>, BalanceGetRes, PubKeyedBody>('/Balances', (_req, res) => {
  const returning: BalanceGetRes = {
    result: true,
    default: INITIAL_BALANCE,
    value: {}
  };
  for (const [key, amount] of blockchain.data.WALLET) {
    returning.value[key] = amount.base.balance;
  }
  res.json(returning);
});

app.post('/Payment/Register', (req, res) => {
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

    res.json({
      result: true,
      value: payment.tx
    });
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
type IntegrationAllRes = ResultSuccess & {
  value: {
    [index: string]: Integration;
  };
}
app.get('/Integration/All', (_req, res) => {
  const returning: IntegrationAllRes = {
    result: true,
    value: {}
  };
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    returning.value[key] = integration.base;
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
type IntegrationUsesOwnedByRes = ResultSuccess & {
  value: {
    [index: string]: IntegrationExpanded;
  };
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

  const returning: IntegrationUsesOwnedByRes = {
    result: true,
    value: {},
  };
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    for (const output of integration.base.outputs) {
      const foundSensor = blockchain.getSensorInfo(output.sensorName);
      if (foundSensor !== null && foundSensor.input === req.body.pubKey) {
        returning.value[key] = integration.base;
        break;
      }
    }
  }
  res.json(returning);
});

app.post('/Integration/OwnedBy', (req, res) => {
  const returning: IntegrationUsesOwnedByRes = {
    result: true,
    value: {}
  };
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    if (integration.base.state === INTEGRATION_STATE.RUNNING && integration.base.input === req.body.pubKey) {
      returning.value[key] = integration.base;
    }
  }
  res.json(returning);
});

app.get('/Integration/OurBrokersBrokering', (req, res) => {

  const returning: IntegrationUsesOwnedByRes = {
    result: true,
    value: {}
  };
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    for (const output of integration.base.outputsExtra) {
      const foundBroker = blockchain.getBrokerInfo(output.broker);
      if (foundBroker !== null && foundBroker.input === req.body.pubKey) {
        returning.value[key] = integration.base;
        break;
      }
    }
  }
  res.json(returning);
});

app.get('/Integration/OurBrokersWitnessing', (req, res) => {

  const returning: IntegrationUsesOwnedByRes = {
    result: true,
    value: {}
  };
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    for (let i = 0; i < integration.base.outputs.length; i++) {
      const extra = integration.base.outputsExtra[i];
      if (Object.hasOwn(extra.witnesses, req.body.pubKey)) {
        returning.value[key] = integration.base;
        break;
      }
    }
  }
  res.json(returning);
});

//BrokerRegistration
type BrokerRegistrationGetRes = ResultSuccess & {
  value: {
    [index: string]: BrokerRegistration & {
      hash: string;
    };
  };
}

app.get('/BrokerRegistration/All', (_req, res) => {
  const returning: BrokerRegistrationGetRes = {
    result: true,
    value: {},
  };
  for (const [key, value] of blockchain.data.BROKER) {
    returning.value[key] = Object.assign({
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

  const returning: BrokerRegistrationGetRes = {
    result: true,
    value: {}
  };

  for (const [key, value] of blockchain.data.BROKER) {
    if (value.base.input !== req.body.pubKey) {
      continue;
    }
    returning.value[key] = Object.assign({
      hash: BrokerRegistration.hashToSign(value.base)
    }, value.base);
  }
  res.json(returning);
});
//SensorRegistration
type SensorRegistrationGetRes = ResultSuccess & {
  value: {
    [index: string]: SensorRegistration & {
      hash: string;
    };
  };
}
app.get('/SensorRegistration/All', (_req, res) => {
  const returning: SensorRegistrationGetRes = {
    result: true,
    value: {}
  };
  for (const [key, value] of blockchain.data.SENSOR) {
    returning.value[key] = Object.assign({
      hash: SensorRegistration.hashToSign(value.base)
    }, value.base);
  }
  res.json(returning);
});

const sensorRegistrationRegisterValidators = {
  keyPair: ChainUtil.validateIsKeyPair,
  sensorName: ChainUtil.validateIsString,
  costPerMinute: ChainUtil.createValidateIsIntegerWithMin(0),
  costPerKB: ChainUtil.createValidateIsIntegerWithMin(0),
  integrationBroker: ChainUtil.createValidateIsEither(ChainUtil.validateIsString, ChainUtil.validateIsNull),
  interval: ChainUtil.createValidateIsEither(ChainUtil.createValidateIsIntegerWithMin(1), ChainUtil.validateIsNull),
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

  if (req.body.integrationBroker === null) {
    if (blockchain.data.BROKER.size === 0) {
      res.json({
        result: false,
        reason: "There are no brokers with which to select a default broker with"
      });
    }
    const brokers = Array.from(blockchain.data.BROKER.keys());
    const rand_i = randomInt(0, brokers.length);
    req.body.integrationBroker = brokers[rand_i];
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
      req.body.interval,
      req.body.integrationBroker,
      req.body.extraNodeMetadata,
      req.body.extraLiteralMetadata);

    chainServer.sendTx(reg);

    res.json({
      result: true,
      tx: reg.tx,
      brokerIp: blockchain.getBrokerInfo((reg.tx as SensorRegistration).metadata.integrationBroker).metadata.endpoint
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

  const returning: SensorRegistrationGetRes = {
    result: true,
    value: {}
  };

  for (const [key, value] of blockchain.data.SENSOR) {
    if (value.base.input !== req.body.pubKey) {
      continue;
    }
    returning.value[key] = Object.assign({
      hash: SensorRegistration.hashToSign(value.base)
    }, value.base);
  }
  res.json(returning);
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
  }).then(queryRes => {
    console.log("Query status: " + queryRes.status);
    if (400 <= queryRes.status && queryRes.status <= 500) {
      return queryRes.text();
    } else {
      return queryRes.json();
    }
  }).then((fusekiRes: FusekiQueryRes | string) => {
    if (typeof (fusekiRes) == "string") {
      res.json({
        result: false,
        reason: fusekiRes
      });
      return;
    }

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
  }).catch((err: Error) => {
    res.json({
      result: false,
      reason: err.message
    });
  });
});

blockchain = await Blockchain.create(persistenceLocation, fusekiLocation);

chainServer = new BlockchainProp("Wallet-chain-server", blockchain, WebSocket as unknown as SocketConstructor, WebSocketServer);
chainServer.start(chainServerPort, chainServerPublicAddress, chainServerPeers); 

app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));

export type { IntegrationAllRes, IntegrationUsesOwnedByRes, BrokerRegistrationGetRes, SensorRegistrationGetRes };