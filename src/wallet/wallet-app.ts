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

'use strict';

import type { RouteParameters } from 'express-serve-static-core';
import { default as express } from 'express';
import bodyParser from 'body-parser';
import { PropServer as BlockchainProp } from '../network/blockchain-prop.js';

import Wallet from './wallet.js';
import Config from '../util/config.js';
import { ChainUtil, type ResultFailure, type ResultSuccess, type RdfTriple, type KeyPair } from '../util/chain-util.js';

import { Blockchain, type Integration, type Broker, type Sensor } from '../blockchain/blockchain.js';
//import { Persistence, type Underlying as UnderlyingPersistence } from '../blockchain/persistence.js';
//import fs from 'fs';
import { WebSocket, WebSocketServer } from 'ws';
import N3 from 'n3';

import {
  DEFAULT_PUBLIC_WALLET_UI_BASE,
  DEFAULT_PORT_PUBLIC_WALLET_API,
  DEFAULT_PORT_PUBLIC_WALLET_CHAIN,
  DEFAULT_PORT_MINER_CHAIN,
  INITIAL_BALANCE
} from '../util/constants.js';
import { default as SensorTx } from '../blockchain/sensor-registration.js';
import { default as BrokerTx } from '../blockchain/broker-registration.js';
import { default as IntegrationTx } from '../blockchain/integration.js';



const args = process.argv;

if (args.length > 2 && args[2] === "-h") {
  console.log(args[0] + ' ' + args[1] + " <optional: location of settings file> <optional: prefix in settings file>");
  process.exit(0);
}

const CONFIGS_STORAGE_LOCATION = args.length > 2 ? args[2] : "./settings.json";
const CONFIG_PREFIX = args.length > 3 ? args[3] : "public-wallet-";

const config = new Config(CONFIGS_STORAGE_LOCATION);

const wallet = new Wallet();
const apiPort = config.get(CONFIG_PREFIX + "api-port", DEFAULT_PORT_PUBLIC_WALLET_API, ChainUtil.createValidateIsNumberWithMinMax(1, 655356));
const persistenceLocation = config.get(CONFIG_PREFIX + "blockchain", "./public_wallet_blockchain.db", ChainUtil.validateIsString);
const chainServerPort = config.get(CONFIG_PREFIX + "chain-server-port", DEFAULT_PORT_PUBLIC_WALLET_CHAIN, ChainUtil.createValidateIsNumberWithMinMax(1, 655356));
const fusekiLocation = config.get(CONFIG_PREFIX + "fuseki", null, ChainUtil.createValidateIsEither<string | null>(ChainUtil.validateIsString, ChainUtil.validateIsNull));
const chainServerPublicAddress = config.get(CONFIG_PREFIX + "chain-server-public-address", "-", ChainUtil.validateIsString);
const chainServerPeers = config.get(CONFIG_PREFIX + "chain-server-peers", ["ws://127.0.0.1:" + DEFAULT_PORT_MINER_CHAIN], ChainUtil.createValidateArray(ChainUtil.validateIsString));
const uiBaseLocation = config.get(CONFIG_PREFIX + "ui-base", DEFAULT_PUBLIC_WALLET_UI_BASE, ChainUtil.validateIsString);

const blockchain = await Blockchain.create(persistenceLocation, fusekiLocation);

const chainServer = new BlockchainProp("Wallet-chain-server", blockchain, {
  connect(address: string) {
    return new WebSocket(address);
  },
  listen(port: number) {
    return new WebSocketServer({
      port: port
    });
  }
});
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

interface ResponseI {
  json(data: object): void;
}

function respondWithError(res: ResponseI, err: unknown) {
  if (err instanceof Error) {
    res.json({
      result: false,
      reason: err.message
    });
  } else {
    res.json({
      result: false,
      reason: "Non Error typed error"
    });
  }
}


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
  const genned = ChainUtil.genKeyPair();
  res.json({
    result: true,
    keyPair: ChainUtil.serializeKeyPair(genned),
    pubKey: genned.pubSerialized
  });
});

app.post('/PubKeyFor', (req, res) => {
  try {
    res.json({
      result: true,
      value: ChainUtil.deserializeKeyPair(req.body.keyPair).pubSerialized
    });
  } catch (err) {
    respondWithError(res, err);
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
  const returning: BalanceGetRes = {
    result: true,
    default: INITIAL_BALANCE,
    value: {}
  };

  blockchain.getWallet(req.body.pubKey).then((wallet) => {
    returning.value[req.body.pubKey] = wallet.val.balance;
    res.json(returning);
  });
});
app.get<string, RouteParameters<string>, BalanceGetRes, PubKeyedBody>('/Balances', (_req, res) => {
  const returning: BalanceGetRes = {
    result: true,
    default: INITIAL_BALANCE,
    value: {}
  };

  blockchain.getWallets((key, value) => {
      returning.value[key] = value.balance;
  }).then((_hash) => {
    res.json(returning);
  });
});

app.post('/Payment/Register', async (req, res) => {
  try {
    const keyPair = ChainUtil.deserializeKeyPair(req.body.keyPair);
    const rewardAmount = req.body.rewardAmount;
    const outputs = req.body.outputs;

    const payment = await wallet.createPayment(
      keyPair,
      blockchain,
      rewardAmount,
      outputs);

    chainServer.sendPaymentTx(payment);

    res.json({
      result: true,
      value: payment
    });
  } catch (err) {
    console.log(err);
    respondWithError(res, err);
  }
});

//Integration
type IntegrationAllRes = ResultSuccess & {
  value: {
    [index: string]: Integration;
  };
}
app.get('/Integration/All', async (_req, res) => {
  const returning: IntegrationAllRes = {
    result: true,
    value: {}
  };
  const integrations = (await blockchain.getIntegrations()).val;
  for(const integration of integrations) {
    returning.value[integration.key] = integration;
  }

  res.json(returning);
});

app.post('/Integration/Register', async (req, res) => {
  try {
    const keyPair = ChainUtil.deserializeKeyPair(req.body.keyPair);

    const integration = await wallet.createIntegration(
      keyPair,
      blockchain,
      req.body.rewardAmount,
      req.body.witnessCount,
      req.body.outputs);

    chainServer.sendIntegrationTx(integration);

    res.json({
      result: true,
      tx: integration,
      hash: IntegrationTx.mqttTopic(integration)
    });
  } catch (err) {
    console.log(err);
    respondWithError(res, err);
  }
});

type IntegrationUsesOwnedByReq = {
  pubKey: string;
};
const integrationUsesOwnedByValidators = {
  pubKey: ChainUtil.validateIsSerializedPublicKey
} as const;
type IntegrationUsesOwnedByRes = ResultSuccess & {
  value: {
    [index: string]: Integration;
  };
}
app.post('/Integration/UsesOwnedBy', async (req, res) => {
  const fail: ResultFailure = { result: false, reason: "" };
  if (!ChainUtil.validateObject<IntegrationUsesOwnedByReq>(req.body, integrationUsesOwnedByValidators, fail)) {
    res.json({
      result: false,
      reason: fail.reason
    });
    return;
  }

  const returning: IntegrationUsesOwnedByRes = {
    result: true,
    value: {},
  };

  const resultSet = (await blockchain.getRunningIntegrationsUsingSensorsOwnedBy(req.body.pubKey)).val;

  for (const integration of resultSet) {
    returning.value[integration.key] = integration;
  }

  res.json(returning);
});

app.post('/Integration/OwnedBy', async (req, res) => {
  const returning: IntegrationUsesOwnedByRes = {
    result: true,
    value: {}
  };
  const integrations = (await blockchain.getRunningIntegrationsOwnedBy(req.body.pubKey)).val;
  for(const integration of integrations) {
    returning.value[integration.key] = integration;
  }

  res.json(returning);
});

app.get('/Integration/OurBrokersBrokering', async (req, res) => {
  const fail: ResultFailure = { result: false, reason: "" };
  if (!ChainUtil.validateObject<IntegrationUsesOwnedByReq>(req.body, integrationUsesOwnedByValidators, fail)) {
    res.json({
      result: false,
      reason: fail.reason
    });
    return;
  }

  const returning: IntegrationUsesOwnedByRes = {
    result: true,
    value: {}
  };

  const resultSet = (await blockchain.getRunningIntegrationsUsingBrokersOwnedBy(req.body.pubKey)).val;

  for (const integration of resultSet) {
    returning.value[integration.key] = integration;
  }
  res.json(returning);
});


//NYI
//app.get('/Integration/OurBrokersWitnessing', (req, res) => {

//  const returning: IntegrationUsesOwnedByRes = {
//    result: true,
//    value: {}
//  };
//  for (const [key, integration] of blockchain.data.INTEGRATION) {
//    for (let i = 0; i < integration.base.outputs.length; i++) {
//      const extra = integration.base.outputsExtra[i];
//      if (Object.hasOwn(extra.witnesses, req.body.pubKey)) {
//        returning.value[key] = integration.base;
//        break;
//      }
//    }
//  }
//  res.json(returning);
//});

//BrokerRegistration
type BrokerRegistrationGetRes = ResultSuccess & {
  value: {
    [index: string]: BrokerTx & {
      hash: string;
    };
  };
}

app.get('/BrokerRegistration/All', (_req, res) => {
  const returning: BrokerRegistrationGetRes = {
    result: true,
    value: {},
  };
  blockchain.getBrokerTxs((key, value) => {
    returning.value[key] = Object.assign({
      hash: ChainUtil.hash(BrokerTx.toHash(value))
    }, value);
  }).then((_hash) => {
    res.json(returning);
  });
});

type BrokerRegistrationRegisterReq = {
  keyPair: string,
  brokerName: string,
  endpoint: string,
  rewardAmount: number,
  extraNodeMetadata?: RdfTriple[],
  extraLiteralMetadata?: RdfTriple[]
};

const brokerRegistrationRegisterValidators = {
  keyPair: ChainUtil.validateIsSerializedKeyPair,
  brokerName: ChainUtil.validateIsString,
  endpoint: ChainUtil.validateIsString,
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  extraNodeMetadata: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(ChainUtil.validateNodeMetadata)),
  extraLiteralMetadata: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(ChainUtil.validateNodeMetadata))
};

app.post('/BrokerRegistration/Register', async (req, res) => {
  const fail: ResultFailure = { result: false, reason: "" };

  if (!ChainUtil.validateObject(req.body, brokerRegistrationRegisterValidators, fail)) {
    res.json(fail.reason);
    return;
  }

  const body = req.body as BrokerRegistrationRegisterReq;

  try {
    const keyPair = ChainUtil.deserializeKeyPair(body.keyPair);

    const reg = await wallet.createBrokerRegistration(
      keyPair,
      blockchain,
      body.rewardAmount,
      body.brokerName,
      body.endpoint,
      body.extraNodeMetadata,
      body.extraLiteralMetadata);

    chainServer.sendBrokerRegistrationTx(reg);

    res.json({
      result: true,
      tx: reg
    });
  } catch (err) {
    console.log(err);
    respondWithError(res, err);
  }
});

type BrokerRegistrationOwnedByReq = {
  pubKey: string
}
const brokerRegistrationOwnedByValidators = {
  pubKey: ChainUtil.validateIsSerializedPublicKey
} as const;
app.post('/BrokerRegistration/OwnedBy', (req, res) => {
  const fail: ResultFailure = { result: false, reason: "" };

  if (!ChainUtil.validateObject(req.body, brokerRegistrationOwnedByValidators, fail)) {
    res.json({
      result: false,
      reason: fail.reason
    });
    return;
  }

  const body = req.body as BrokerRegistrationOwnedByReq;

  const returning: BrokerRegistrationGetRes = {
    result: true,
    value: {}
  };

  blockchain.getBrokerTxsOwnedBy(body.pubKey, (key, value) => {
    returning.value[key] = Object.assign({
      hash: ChainUtil.hash(BrokerTx.toHash(value))
    }, value);
  }).then((_hash) => {
    res.json(returning);
  });
});
//SensorRegistration
type SensorRegistrationGetRes = ResultSuccess & {
  value: {
    [index: string]: Sensor;
  };
}
app.get('/SensorRegistration/All', (_req, res) => {
  const returning: SensorRegistrationGetRes = {
    result: true,
    value: {}
  };
  blockchain.getSensors((key, value) => {
    returning.value[key] = value;
  }).then((_hash) => {
    res.json(returning);
  });
  res.json(returning);
});

async function sensorRegistrationRegister(keyPair: KeyPair, blockchain: Blockchain, rewardAmount: number, sensorName: string, costPerMinute: number, costPerKB: number,
  interval: number | null, integrationBroker: string, extraNodeMetadata: RdfTriple[] | undefined, extraLiteralMetadata: RdfTriple[] | undefined): Promise<SensorTx> {

  const reg = await wallet.createSensorRegistration(
    keyPair,
    blockchain,
    rewardAmount,
    sensorName,
    costPerMinute,
    costPerKB,
    interval,
    integrationBroker,
    extraNodeMetadata,
    extraLiteralMetadata);

  chainServer.sendSensorRegistrationTx(reg);

  return reg;
}

type SensorRegistrationRegisterReq = {
  keyPair: string,
  sensorName: string,
  costPerMinute: number,
  costPerKB: number,
  integrationBroker: string | null,
  interval: number | null,
  rewardAmount: number,
  extraNodeMetadata?: RdfTriple[],
  extraLiteralMetadata?: RdfTriple[]
};
const sensorRegistrationRegisterValidators = {
  keyPair: ChainUtil.validateIsSerializedKeyPair,
  sensorName: ChainUtil.validateIsString,
  costPerMinute: ChainUtil.createValidateIsIntegerWithMin(0),
  costPerKB: ChainUtil.createValidateIsIntegerWithMin(0),
  integrationBroker: ChainUtil.createValidateIsEither(ChainUtil.validateIsString, ChainUtil.validateIsNull),
  interval: ChainUtil.createValidateIsEither(ChainUtil.createValidateIsIntegerWithMin(1), ChainUtil.validateIsNull),
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  extraNodeMetadata: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(
      ChainUtil.validateNodeMetadata)),
  extraLiteralMetadata: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(
      ChainUtil.validateLiteralMetadata))
} as const;

app.post('/SensorRegistration/Register', async (req, res) => {
  const fail: ResultFailure = { result: false, reason: "" };

  if (!ChainUtil.validateObject<SensorRegistrationRegisterReq>(req.body, sensorRegistrationRegisterValidators,fail)) {
    res.json({
      result: false,
      reason: fail.reason
    });
    return;
  }

  const retrieveAt = blockchain.retrieveAtNow();

  let brokerInfo: Broker | null = null;
  if (req.body.integrationBroker === null) {
    const gotBroker = (await blockchain.getRandomBroker(retrieveAt)).val;
    if (gotBroker === null) {
      res.json({
        result: false,
        reason: "There are no brokers with which to select a default broker with"
      });
      return;
    }
    req.body.integrationBroker = gotBroker.name;
    brokerInfo = gotBroker.broker;
  } else {
    const gotBroker = (await blockchain.getBroker(req.body.integrationBroker, retrieveAt)).val
    if(gotBroker === null) {
      res.json({
        result: false,
        reason: "Couldn't find the named broker"
      });
      return;
    }
    brokerInfo = gotBroker;
  }

  try {
    const keyPair = ChainUtil.deserializeKeyPair(req.body.keyPair);

    const tx = await sensorRegistrationRegister(keyPair, blockchain,
      req.body.rewardAmount,
      req.body.sensorName,
      req.body.costPerMinute,
      req.body.costPerKB,
      req.body.interval,
      req.body.integrationBroker,
      req.body.extraNodeMetadata,
      req.body.extraLiteralMetadata);

    res.json({
      result: true,
      tx: tx,
      brokerIp: brokerInfo.endpoint
    });
  } catch (err) {
    if (err instanceof Error) {
      res.json({
        result: false,
        reason: err.message
      });
    } else {
      console.log(`throw with non Error type: ${err}`);
      res.json({
        result: false,
        reason: "Non error type thrown"
      });
    }
  }
});

type SensorRegistrationRegisterSimpleReq = {
  keyPair: string;
  sensorName: string;
  costPerMinute: number;
  costPerKB: number;
  integrationBroker: undefined | string | null;
  interval: undefined | number | null;
  rewardAmount: undefined | number;
  lat: undefined | string;
  long: undefined | string;
  measures: undefined | string;
  sensorType: undefined | string;
  sensorPlatform: undefined | string;
  sensorSystemHardware: undefined | string;
  sensorSystemSoftware: undefined | string;
  gmapsLocation: undefined | string;
  sensorSystemProtocol: undefined | string;
  extraMetadata: undefined | string;
  machineProtocolDesc: undefined | string;
  humanProtocolDesc: undefined | string;
};
const sensorRegistrationRegisterSimpleValidators = {
  keyPair: ChainUtil.validateIsSerializedKeyPair,
  sensorName: ChainUtil.validateIsString,
  costPerMinute: ChainUtil.createValidateIsIntegerWithMin(0),
  costPerKB: ChainUtil.createValidateIsIntegerWithMin(0),
  integrationBroker: ChainUtil.createValidateOptional(ChainUtil.createValidateIsEither(ChainUtil.validateIsString, ChainUtil.validateIsNull)),
  interval: ChainUtil.createValidateOptional(ChainUtil.createValidateIsEither(ChainUtil.createValidateIsIntegerWithMin(1), ChainUtil.validateIsNull)),
  rewardAmount: ChainUtil.createValidateOptional(ChainUtil.createValidateIsIntegerWithMin(0)),
  lat: ChainUtil.createValidateIsEither<undefined | string>(ChainUtil.validateIsUndefined, ChainUtil.validateIsString),
  long: ChainUtil.createValidateIsEither<undefined | string>(ChainUtil.validateIsUndefined, ChainUtil.validateIsString),
  measures: ChainUtil.createValidateOptional(ChainUtil.validateIsString),
  sensorType: ChainUtil.createValidateOptional(ChainUtil.validateIsString),
  sensorPlatform: ChainUtil.createValidateOptional(ChainUtil.validateIsString),
  sensorSystemHardware: ChainUtil.createValidateOptional(ChainUtil.validateIsString),
  sensorSystemSoftware: ChainUtil.createValidateOptional(ChainUtil.validateIsString),
  gmapsLocation: ChainUtil.createValidateOptional(ChainUtil.validateIsString),
  sensorSystemProtocol: ChainUtil.createValidateOptional(ChainUtil.validateIsString),
  extraMetadata: ChainUtil.createValidateOptional(ChainUtil.validateIsString),
  machineProtocolDesc: ChainUtil.createValidateOptional(ChainUtil.validateIsString),
  humanProtocolDesc: ChainUtil.createValidateOptional(ChainUtil.validateIsString)
} as const;
app.post('/SensorRegistration/Register/Simple', async (req, res) => {
  const fail: ResultFailure = { result: false, reason: "" };

  if (!ChainUtil.validateObject<SensorRegistrationRegisterSimpleReq>(req.body, sensorRegistrationRegisterSimpleValidators, fail)) {
    fail.reason = "Failed request body validation\n" + fail.reason;
    res.json(fail);
    return
  }

  const retrieveAt = blockchain.retrieveAtNow();

  let brokerInfo: Broker | null = null;
  if (req.body.integrationBroker === undefined || req.body.integrationBroker === null) {
    const gotBroker = (await blockchain.getRandomBroker(retrieveAt)).val;
    if (gotBroker === null) {
      res.json({
        result: false,
        reason: "There are no brokers with which to select a default broker with"
      });
      return;
    }
    req.body.integrationBroker = gotBroker.name;
    brokerInfo = gotBroker.broker;
  } else {
    const gotBroker = (await blockchain.getBroker(req.body.integrationBroker, retrieveAt)).val
    if (gotBroker === null) {
      res.json({
        result: false,
        reason: "Couldn't find the named broker"
      });
      return;
    }
    brokerInfo = gotBroker;
  }
  if (req.body.rewardAmount === undefined) {
    req.body.rewardAmount = 0;
  }
  if (req.body.interval === undefined) {
    req.body.interval = null;
  }

  const nodeMetadata: RdfTriple[] = [];
  const literalMetadata: RdfTriple[] = [];

  nodeMetadata.push({
    s: "SSMS://",
    p: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    o: "http://www.w3.org/ns/sosa/Sensor"
  });

  if (req.body.measures !== undefined && req.body.measures !== "") {
    nodeMetadata.push({
      s: "SSMS://",
      p: "http://www.w3.org/ns/sosa/observes",
      o: "SSMS://#observes"
    });
    literalMetadata.push({
      s: "SSMS://#observes",
      p: "http://www.w3.org/2000/01/rdf-schema#label",
      o: req.body.measures
    });
  }

  if ((req.body.lat !== undefined && req.body.lat !== "")
    || (req.body.long !== undefined && req.body.long !== "")
    || (req.body.gmapsLocation !== undefined && req.body.gmapsLocation !== "")) {
    nodeMetadata.push({
      s: "SSMS://",
      p: "http://www.w3.org/ns/sosa/hasFeatureOfInterest",
      o: "SSMS://#location"
    });
    nodeMetadata.push({
      s: "SSMS://#location",
      p: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      o: "http://www.w3.org/ns/sosa/FeatureOfInterest"
    });
    if (req.body.lat !== undefined && req.body.lat !== "") {
      const parsed = Number.parseFloat(req.body.lat);
      if (Number.isNaN(parsed)) {
        res.json({
          result: false,
          reason: "Couldn't convert lat to float"
        });
        return;
      }
      if (parsed < -90 || parsed > 90) {
        res.json({
          result: false,
          reason: "Lat isn't in range [-90,90]"
        });
        return;
      }
      literalMetadata.push({
        s: "SSMS://#location",
        p: "http://www.w3.org/2003/01/geo/wgs84_pos#lat",
        o: req.body.lat
      });
    }
    if (req.body.long !== undefined && req.body.long !== "") {
      const parsed = Number.parseFloat(req.body.long);
      if (Number.isNaN(parsed)) {
        res.json({
          result: false,
          reason: "Couldn't convert long to float"
        });
        return;
      }
      if (parsed < -180 || parsed > 180) {
        res.json({
          result: false,
          reason: "Long isn't in range [-180,180]"
        });
        return;
      }
      literalMetadata.push({
        s: "SSMS://#location",
        p: "http://www.w3.org/2003/01/geo/wgs84_pos#long",
        o: req.body.long
      });
    }
    if (req.body.gmapsLocation !== undefined && req.body.gmapsLocation !== "") {
      literalMetadata.push({
        s: "SSMS://#location",
        p: "http://www.w3.org/2000/01/rdf-schema#label",
        o: req.body.gmapsLocation
      });
    }
  }
  
  if (req.body.sensorType !== undefined && req.body.sensorType !== "") {
    literalMetadata.push({
      s: "SSMS://",
      p: "http://www.w3.org/2000/01/rdf-schema#label",
      o: req.body.sensorType
    });
  }
  if (req.body.sensorPlatform !== undefined && req.body.sensorPlatform !== "") {
    literalMetadata.push({
      s: "SSMS://",
      p: "http://www.w3.org/2000/01/rdf-schema#label",
      o: req.body.sensorPlatform
    });
  }
  if (req.body.extraMetadata !== undefined && req.body.extraMetadata !== "") {
    const parser = new N3.Parser();
    const tuples = parser.parse(req.body.extraMetadata);
    for (const tuple of tuples) {
      const adding = {
        s: tuple.subject.value,
        p: tuple.predicate.value,
        o: tuple.object.value
      };
      if (tuple.object.termType === "Literal") {
        literalMetadata.push(adding);
      } else {
        nodeMetadata.push(adding);
      }
    }
  }
  if (req.body.sensorSystemHardware !== undefined && req.body.sensorSystemHardware !== "") {
    literalMetadata.push({
      s: "SSMS://",
      p: "ssmu://systemHardware",
      o: req.body.sensorSystemHardware
    });
  }
  if (req.body.sensorSystemSoftware !== undefined && req.body.sensorSystemSoftware !== "") {
    literalMetadata.push({
      s: "SSMS://",
      p: "ssmu://systemSoftware",
      o: req.body.sensorSystemSoftware
    });
  }
  if (req.body.sensorSystemProtocol !== undefined && req.body.sensorSystemProtocol !== "") {
    literalMetadata.push({
      s: "SSMS://",
      p: "ssmu://systemProtocol",
      o: req.body.sensorSystemProtocol
    });
  }
  if (req.body.machineProtocolDesc !== undefined && req.body.machineProtocolDesc !== "") {
    literalMetadata.push({
      s: "SSMS://",
      p: "ssmu://machineProtocolDesc",
      o: req.body.machineProtocolDesc
    });
  }
  if (req.body.humanProtocolDesc !== undefined && req.body.humanProtocolDesc !== "") {
    literalMetadata.push({
      s: "SSMS://",
      p: "ssmu://humanProtocolDesc",
      o: req.body.humanProtocolDesc
    });
  }

  try {
    const keyPair = ChainUtil.deserializeKeyPair(req.body.keyPair);

    const tx = sensorRegistrationRegister(keyPair, blockchain,
      req.body.rewardAmount,
      req.body.sensorName,
      req.body.costPerMinute,
      req.body.costPerKB,
      req.body.interval,
      req.body.integrationBroker,
      nodeMetadata,
      literalMetadata);

    res.json({
      result: true,
      tx: tx,
      brokerIp: brokerInfo.endpoint
    });
  } catch (err) {
    if (err instanceof Error) {
      res.json({
        result: false,
        reason: err.message
      });
    } else {
      console.log(`throw with non Error type: ${err}`);
      res.json({
        result: false,
        reason: "Non error type thrown"
      });
    }
  }
});
type SensorRegistrationOwnerByReq = {
  pubKey: string
};
const sensorRegistrationOwnedByValidators = {
  pubKey: ChainUtil.validateIsSerializedPublicKey
} as const;
app.post('/SensorRegistration/OwnedBy', async (req, res) => {
  const fail: ResultFailure = { result: false, reason: "" };
  if(!ChainUtil.validateObject<SensorRegistrationOwnerByReq>(req.body, sensorRegistrationOwnedByValidators, fail)) {
    res.json(fail);
    return;
  }

  const returning: SensorRegistrationGetRes = {
    result: true,
    value: {}
  };

  const sensors = (await blockchain.getSensorsOwnedBy(req.body.pubKey)).val;

  for (const sensor of sensors) {
    returning.value[sensor.name] = sensor.sensor;
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
  if (fusekiLocation === null) {
    res.json({
      result: false,
      reason: "We aren't connected to an RDF DB instance"
    });
    return;
  }

  const fail: ResultFailure = { result: false, reason: "" };

  if (!ChainUtil.validateIsString(req.body.query, fail)) {
    fail.reason = "Request body failed string validation\n" + fail.reason;
    res.json(fail);
    return;
  }

  fetch(fusekiLocation + "/query", {
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

    for (const row of fusekiRes.results.bindings) {
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

chainServer.start(chainServerPort, chainServerPublicAddress, chainServerPeers); 

app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));

export type { IntegrationAllRes, IntegrationUsesOwnedByRes, BrokerRegistrationGetRes, SensorRegistrationGetRes };