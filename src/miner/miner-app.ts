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
 **/

/**
 * @author Anas Dawod e-mail: adawod@swin.edu.au
 */
/**
 * npm run dev
 * HTTP_PORT=3002 P2P_PORT=5002 MQTT_PORT=1884 PEERS=ws://localhost:5001 npm run dev
 * HTTP_PORT=3003 P2P_PORT=5003 MQTT_PORT=1885 PEERS=ws://localhost:5001,ws://localhost:5002 npm run dev
 * HTTP_PORT=3004 P2P_PORT=5004 MQTT_PORT=1886 PEERS=ws://localhost:5001,ws://localhost:5002,ws://localhost:5003 npm run dev
 * HTTP_PORT=3005 P2P_PORT=5005 MQTT_PORT=1887 PEERS=ws://localhost:5001,ws://localhost:5002,ws://localhost:5003,ws://localhost:5004  npm run dev
 */

/**
 * npm run dev                                                                                                          //node1
 * HTTP_PORT=3002 P2P_PORT=5002 MQTT_PORT=1884 PEERS=ws://45.113.235.182:5001 npm run dev                                           //node2
 * HTTP_PORT=3003 P2P_PORT=5003 MQTT_PORT=1885 PEERS=ws://45.113.235.182:5001,ws://45.113.234.151:5002 npm run dev                  //node3
 * HTTP_PORT=3004 P2P_PORT=5004 MQTT_PORT=1886 PEERS=ws://IP:5001,ws://IP:5002,ws://IP:5003 npm run dev                 //node4
 * HTTP_PORT=3005 P2P_PORT=5005 MQTT_PORT=1887 PEERS=ws://IP:5001,ws://IP:5002,ws://IP:5003,ws://IP:5004  npm run dev   //node5
 */

/**
 * for monitoring the memory and cpu as well as run node in the background use the following, 
 * note: the second section of the instruction is to change the heap memory
 * pm2 start app/index.js --node-args="--max_old_space_size=8192"
 * HTTP_PORT=3002 P2P_PORT=5002 MQTT_PORT=1884 PEERS=ws://45.113.235.182:5001 pm2 start app/index.js --node-args="--max_old_space_size=8192"
 * HTTP_PORT=3003 P2P_PORT=5003 MQTT_PORT=1885 PEERS=ws://45.113.235.182:5001,ws://45.113.234.151:5002 pm2 start app/index.js --node-args="--max_old_space_size=8192"
 * HTTP_PORT=3004 P2P_PORT=5004 MQTT_PORT=1886 PEERS=ws://IP:5001,ws://IP:5002,ws://IP:5003 pm2 start app/index.js --node-args="--max_old_space_size=8192"
 * HTTP_PORT=3005 P2P_PORT=5005 MQTT_PORT=1887 PEERS=ws://IP:5001,ws://IP:5002,ws://IP:5003,ws://IP:5004 pm2 start app/index.js --node-args="--max_old_space_size=8192"
 * use 
 * $ pm2 monit
 * to monitor the node
 * 
 */

'use strict';

import express from 'express';
import bodyParser from 'body-parser';
import { PropServer } from '../network/blockchain-prop.js';
import { Blockchain } from '../blockchain/blockchain.js';
import Miner from './miner.js';

import Config from '../util/config.js';
import { ChainUtil, isFailure } from '../util/chain-util.js';
import { WebSocketServer } from 'ws';

import {
  DEFAULT_PORT_MINER_API,
  DEFAULT_PORT_MINER_CHAIN
} from '../util/constants.js';
import { Payment as PaymentTx } from '../blockchain/payment.js';
import { SensorRegistration as SensorRegistrationTx } from '../blockchain/sensor-registration.js';
import { BrokerRegistration as BrokerRegistrationTx } from '../blockchain/broker-registration.js';
import { Integration as IntegrationTx } from '../blockchain/integration.js';
import { Commit as CommitTx } from '../blockchain/commit.js';

const args = process.argv;

if (args.length > 2 && args[2] === "-h") {
  console.log(args[0] + ' ' + args[1] + " <optional: location of settings file> <optional: prefix in settings file>");
  process.exit(0);
}

const CONFIGS_STORAGE_LOCATION = args.length > 2 ? args[2] : "./settings.json";
const CONFIG_PREFIX = args.length > 3 ? args[3] : "miner-";

const config = new Config(CONFIGS_STORAGE_LOCATION);

const minerPublicKey = config.get({
  key: CONFIG_PREFIX + "public-key",
  default: ""
});
const persistenceLocation = config.get({
  key: CONFIG_PREFIX + "blockchain",
  default: "./miner_blockchain.db"
});
const fusekiLocation = config.get({
  key: CONFIG_PREFIX + "fuseki",
  default: null
});
const chainServerPort = config.get({
  key: CONFIG_PREFIX + "chain-server-port",
  default: DEFAULT_PORT_MINER_CHAIN
});
const chainServerPeers = config.get({
  key: CONFIG_PREFIX + "chain-server-peers",
  default: []
});
const minerPublicAddress = config.get({
  key: CONFIG_PREFIX + "public-address",
  default: "-"
});
const apiPort = config.get({
  key: CONFIG_PREFIX + "api-port",
  default: DEFAULT_PORT_MINER_API
});

const blockchain = await Blockchain.create(persistenceLocation, fusekiLocation);
const miner: Miner = new Miner(blockchain, minerPublicKey);
const chainServer = new PropServer("Chain-server", blockchain, {
  connect(address: string) {
    return new WebSocket(address);
  },
  listen(port: number) {
    return new WebSocketServer({
      port: port
    });
  }
}, (tx) => {
  console.log('Recved a tx of type: ' + tx.type.txName());
  switch (tx.type) {
    case PaymentTx: miner.addPayment(tx.tx as PaymentTx); break;
    case BrokerRegistrationTx: miner.addBrokerRegistration(tx.tx as BrokerRegistrationTx); break;
    case SensorRegistrationTx: miner.addSensorRegistration(tx.tx as SensorRegistrationTx); break;
    case IntegrationTx: miner.addIntegration(tx.tx as IntegrationTx); break;
    case CommitTx: miner.addCommit(tx.tx as CommitTx); break;
    default: console.log("Recved unknown type with name: " + tx.type.txName()); break;
  }
});

const app = express();

app.use(bodyParser.json());

// GET APIs
///////////////
app.get('/Transactions', (_req, res) => {
  res.json(miner.txs);
});
app.get('/public-key', (_req, res) => {
  res.json(minerPublicKey);
});
///////////////
app.get('/MinerBalance', async (_req, res) => {
  const balance = await blockchain.getWallet(minerPublicKey);
  res.json(balance);
});
app.get('/Balance', async (req, res) => {
  const balance = await blockchain.getWallet(req.body.publicKey);
  res.json(balance);
});

app.get('/sensors', (_req, res) => {
  const returning: {
    [index: string]: SensorRegistrationTx & { hash: string }
  } = {};
  blockchain.getSensorTxs((key, value) => {
    returning[key] = Object.assign({
      hash: ChainUtil.hash(SensorRegistrationTx.toHash(value)),
    }, value);
  }).then((_hash) => {
    res.json(returning);
    console.log("/Sensors called");
    console.log(`Returned ${Object.entries(returning).length} sensors`);
  });
});


//app.get('/ChainServer/sockets', (_req, res) => {
//  res.json("NYI");
//});
app.post('/ChainServer/connect', (req, res) => {
  chainServer.connect(req.body.url);
  res.json("Connecting");
});

app.post('/Payment', (req, res) => {
  const addRes = miner.addPayment(req.body);
  if (isFailure(addRes)) {
    res.json(addRes.reason);
  } else {
    res.json("Added to pool");
  }
});

app.post('/Integration', (req, res) => {
  const addRes = miner.addIntegration(req.body);
  if (isFailure(addRes)) {
    res.json(addRes.reason);
  } else {
    res.json("Added to pool");
  }
});

app.post('/BrokerRegistration', (req, res) => {
  const addRes = miner.addBrokerRegistration(req.body);
  if (isFailure(addRes)) {
    res.json(addRes.reason);
  } else {
    res.json("Added to pool");
  }
});

app.post('/SensorRegistration', (req, res) => {
  const addRes = miner.addSensorRegistration(req.body);
  if (isFailure(addRes)) {
    res.json(addRes.reason);
  } else {
    res.json("Added to pool");
  }
});

app.post('/Commit', (req, res) => {
  const addRes = miner.addCommit(req.body);
  if (isFailure(addRes)) {
    res.json(addRes.reason);
  } else {
    res.json("Added to pool");
  }
});

//TODO: probably want to move query logic into blockchain
//type FusekiQueryRes = {
//  head: {
//    vars: string[];
//  };
//  results: {
//    bindings: {
//      [index: string]: {
//        type: string;
//        value: string | number;
//      };
//    }[];
//  }
//};

//type QueryResult = {
//  headers: string[];
//  values: (string | number)[][];
//}

//app.post('/sparql', (req, res) => {
//  if (blockchain.fuseki_location === null) {
//    res.json({
//      result: false,
//      reason: "We aren't connected to an RDF DB instance"
//    });
//    return;
//  }

//  if (isFailure(ChainUtil.validateIsString(req.body.query))) {
//    res.json({
//      result: false,
//      reason: "Body missing a query field that is a string"
//    });
//    return;
//  }

//  fetch(blockchain.fuseki_location + "/query", {
//    method: 'POST',
//    headers: {
//      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
//    },
//    body: 'query=' + encodeURIComponent(req.body.query)
//  }).then(res => {
//    return res.json();
//  }).then((fusekiRes: FusekiQueryRes) => {
//    const returning: QueryResult = {
//      headers: fusekiRes.head.vars,
//      values: []
//    };

//    for (const row of Object.values(fusekiRes.results.bindings)) {
//      const adding = [];
//      for (const k of returning.headers) {
//        adding.push(row[k].value);
//      }
//      returning.values.push(adding);
//    }

//    res.json(returning);
//  }).catch((err) => {
//    res.json({
//      result: false,
//      reason: err
//    });
//  });
//});

blockchain.addListener((_newDepth, _commonDepth) => {
  //console.log(`New depth of ${newDepth} with a commonDepth of ${commonDepth}`);
});


chainServer.start(chainServerPort, minerPublicAddress, chainServerPeers);

app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));