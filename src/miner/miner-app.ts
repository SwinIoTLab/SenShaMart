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

import express from 'express';
import bodyParser from 'body-parser';
import { PropServer, type SocketConstructor } from '../network/blockchain-prop.js';
import Blockchain from '../blockchain/blockchain.js';
//import { Persistence, type Underlying as UnderlyingPersistence } from '../blockchain/persistence.js';
import Miner from './miner.js';
'use strict';/* "use strict" is to indicate that the code should be executed in "strict mode".
              With strict mode, you can not, for example, use undeclared variables.*/

import Config from '../util/config.js';
import { ChainUtil, isFailure } from '../util/chain-util.js';
import Payment from '../blockchain/payment.js';
import Integration from '../blockchain/integration.js';
import SensorRegistration from '../blockchain/sensor-registration.js';
import BrokerRegistration from '../blockchain/broker-registration.js';
import Commit from '../blockchain/commit.js';
import { type AnyTransaction, isTransactionType } from '../blockchain/transaction_base.js';
//import fs from 'fs';
import { WebSocket, WebSocketServer } from 'ws';

import {
  DEFAULT_PORT_MINER_API,
  DEFAULT_PORT_MINER_CHAIN,
} from '../util/constants.js';

const CONFIGS_STORAGE_LOCATION = "./settings.json";

const config = new Config(CONFIGS_STORAGE_LOCATION);

const minerPublicKey = config.get({
  key: "miner-public-key",
  default: ""
});
const persistenceLocation = config.get({
  key: "miner-blockchain",
  default: "./miner_blockchain.db"
});
const fusekiLocation = config.get({
  key: "miner-fuseki",
  default: null
});
const chainServerPort = config.get({
  key: "miner-chain-server-port",
  default: DEFAULT_PORT_MINER_CHAIN
});
const chainServerPeers = config.get({
  key: "miner-chain-server-peers",
  default: []
});
const minerPublicAddress = config.get({
  key: "miner-public-address",
  default: "-"
});
const apiPort = config.get({
  key: "miner-api-port",
  default: DEFAULT_PORT_MINER_API
});

let blockchain: Blockchain = null;
let miner: Miner = null;
let chainServer: PropServer = null;

const newTxCb = function (tx: AnyTransaction): void {
  console.log("new tx through cb");

  if (isTransactionType(tx, Payment)) {
    miner.addPayment(tx.tx);
  } else if (isTransactionType(tx, SensorRegistration)) {
    miner.addSensorRegistration(tx.tx);
  } else if (isTransactionType(tx, BrokerRegistration)) {
    miner.addBrokerRegistration(tx.tx);
  } else if (isTransactionType(tx, Integration)) {
    miner.addIntegration(tx.tx);
  } else if (isTransactionType(tx, Commit)) {
    miner.addCommit(tx.tx);
  } else {
    console.log("Unknown tx through prop server. Name: '" + tx.type.txName() + "'");
  }
};

const app = express();

app.use(bodyParser.json());

// GET APIs
app.get('/blocks', (_req, res) => {
  res.json(blockchain.links);
});
///////////////
app.get('/Transactions', (_req, res) => {
  res.json(miner.txs);
});
app.get('/public-key', (_req, res) => {
  res.json(minerPublicKey);
});
///////////////
app.get('/MinerBalance', (_req, res) => {
  const balance = blockchain.getBalanceCopy(minerPublicKey);
  res.json(balance);
});
app.get('/Balance', (req, res) => {
  const balance = blockchain.getBalanceCopy(req.body.publicKey);
  res.json(balance);
});
app.get('/Balances', (_req, res) => {
  const returning: { [index: string]: number } = {};
  for (const [key, amount] of blockchain.data.WALLET) {
    returning[key] = amount.base.balance;
  }
  res.json(returning);
});

///////////////
//this API prints all the quads stored in the RDF store and returns the entire store
app.get('/quads', (_req, res) => {
  //for (const quad of store)
  //console.log(quad);
  //res.json(blockchain.stores);
  res.json("NYI");
});

app.get('/brokers', (_req, res) => {
  const returning: {
    [index: string]: { [index: string]: unknown }
  } = {};
  for (const [key, value] of Object.entries(blockchain.data.BROKER)) {
    returning[key] = Object.assign({}, value);
    returning[key].hash = ChainUtil.hash(BrokerRegistration.toHash(value));
  }
  res.json(returning);
});

app.get('/sensors', (_req, res) => {
  const returning: {
    [index: string]: { [index: string]: unknown }
  } = {};
  for (const [key, value] of Object.entries(blockchain.data.SENSOR)) {
    returning[key] = Object.assign({}, value);
    returning[key].hash = ChainUtil.hash(SensorRegistration.toHash(value));
  }
  res.json(returning);
  console.log("/Sensors called");
  console.log(`Returned ${Object.entries(returning).length} sensors`);
});


app.get('/ChainServer/sockets', (_req, res) => {
  res.json("NYI");
});
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

miner = new Miner(blockchain, minerPublicKey);
chainServer = new PropServer("Chain-server", blockchain, WebSocket as unknown as SocketConstructor, WebSocketServer, newTxCb);
chainServer.start(chainServerPort, minerPublicAddress, chainServerPeers);

app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));