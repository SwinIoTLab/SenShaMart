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
 * @author Josip Milovac
 */
//BROKER
import express from 'express';
import bodyParser from 'body-parser';
import { PropServer, type SocketConstructor } from '../network/blockchain-prop.js';
//import Broker from './broker.js';

import Aedes from 'aedes';

import Config from '../util/config.js';
import { ChainUtil, isFailure } from '../util/chain-util.js';

import { Blockchain, type UpdaterChanges, INTEGRATION_STATE } from '../blockchain/blockchain.js';
//import { Persistence, type Underlying as FsProvider } from '../blockchain/persistence.js';
import Block from '../blockchain/block.js';
import Net from 'net';
import Commit from '../blockchain/commit.js';
import { WebSocket, WebSocketServer } from 'ws';
import Integration from '../blockchain/integration.js';
//import fs from 'fs';

'use strict';

import {
  DEFAULT_PORT_BROKER_API,
  DEFAULT_PORT_BROKER_CHAIN,
  DEFAULT_PORT_BROKER_MQTT,
  DEFAULT_PORT_MINER_CHAIN
} from '../util/constants.js';

const CONFIGS_STORAGE_LOCATION = "./settings.json";

const config = new Config(CONFIGS_STORAGE_LOCATION);

const keyPair = config.get({
  key: "broker-keypair",
  default: null,
  transform: ChainUtil.deserializeKeyPair
});
const pubKey = ChainUtil.serializePublicKey(keyPair.pub);
const broker_name = config.get({
  key: "broker-name",
  default: pubKey
});

const fusekiLocation = config.get({
  key: "broker-fuseki",
  default: null
});
const apiPort = config.get({
  key: "broker-api-port",
  default: DEFAULT_PORT_BROKER_API
});
const persistenceLocation = config.get({
  key: "broker-blockchain",
  default: "./broker_blockchain.db"
});
const chainServerPort = config.get({
  key: "broker-chain-server-port",
  default: DEFAULT_PORT_BROKER_CHAIN
});
const publicAddress = config.get({
  key: "broker-public-address",
  default: "-"
});
const chainServerPeers = config.get({
  key: "broker-chain-server-peers",
  default: ["ws://127.0.0.1:" + DEFAULT_PORT_MINER_CHAIN]
});
const MQTTPort = config.get({
  key: "broker-MQTT-port",
  default: DEFAULT_PORT_BROKER_MQTT
});

let blockchain: Blockchain = null;
let chainServer: PropServer = null;
function minutesNow(now: number = Date.now()) {
  //divide by 1000 for ms, 60 for seconds, and floor to get whole minutes passed
  return now / (1000 * 60);
}

type SensorIntegration = {
  topic: string;
  integrationInput: string;
  integrationCounter: number;
  outputIndex: number;
  perKB: number;
  perMin: number;
  dataLastAt: number;
  coinsLeft: number;
  index: number;
};

//integrationKey->SensorIntegration
type SensorIntegrations = {
  integrations: Map<string, SensorIntegration>;
  };

//sensor name -> integration key -> SensorIntegration
const ourIntegrations = new Map<string, SensorIntegrations>();
//integration key -> sensors it uses
const cachedIntegrations = new Map<string, string[]>(); 

//return true
function applyCost(hash: string, info: SensorIntegration, now: number, data_length: number) {
  const timeDelta = now - info.dataLastAt;
  if (timeDelta < 0) {
    return;
  }
  const cost =
    timeDelta * info.perMin
    + data_length / 1024 * info.perKB;

  console.log(`out/${hash}/${info.index} = timeDelta: ${timeDelta}, cost: ${cost}`);

  info.coinsLeft -= cost;
  info.dataLastAt = now;
}

function onBlockchainChange(_newBlocks: Block[], changes: UpdaterChanges, _difference: number) {
  console.log("on blockchain change");
  for (const sensorName of changes.SENSOR) {
    const sensorReg = blockchain.getSensorInfo(sensorName);
    if (sensorReg === undefined) { //if the sensor no longer exists
      //TODO: also compensate any current integrations
      ourIntegrations.delete(sensorName); //remove any integrations
      continue;
    }
  }

  for (const integrationKey of changes.INTEGRATION) { //for every integration that was changed
    const integration = blockchain.getIntegration(integrationKey); //get the integration
    const cached = cachedIntegrations.get(integrationKey); //get what we think the integration used to be

    console.log(`New integration: key: ${integrationKey}, hash: ${ChainUtil.hash(Integration.toHash(integration))}`);

    if (integration === undefined) { //if the integration no longer exists
      console.log("No longer exists");
      if (cached !== undefined) { //and it used to exist
        for (const sensorName of cached) { //for every sensor it used to reference
          const foundSensor = ourIntegrations.get(sensorName); //get information about the sensor (if we broker it)
          if (foundSensor !== undefined) { //if we did broker it
            foundSensor.integrations.delete(integrationKey); //get rid of the integration
          }
        }
      }
      cachedIntegrations.delete(integrationKey); //it no longer exists, forget about it
      continue; //next
    }

    console.log(`Not undefined: ${integration}`);

    if (integration.state !== INTEGRATION_STATE.RUNNING) {
      console.log(`Integration ${integrationKey} has been set to state: ${integration.state}`);
      continue;
    }

    for (let i = 0; i < integration.outputs.length; i++) { //for every output
      const output = integration.outputs[i]; //get the output
      const outputExtra = integration.outputsExtra[i]; //get the output extra information
      if (outputExtra.broker != broker_name) { //if we aren't the broker for this
        console.log(`Output ${i} does not use us, it uses: ${outputExtra.broker}`);
        continue; //we don't care, next output 
      }
      let ourIntegration = ourIntegrations.get(output.sensorName); //get the appropriate SensorIntegrations
      if (ourIntegration === undefined) { //if it doesn't exist
        ourIntegration = { //make it
          integrations: new Map<string, SensorIntegration>()
        };
        ourIntegrations.set(output.sensorName, ourIntegration); //update ourIntegrations
      }
      if (ourIntegration.integrations.has(integrationKey)) { //if the sensor already has this integration
        console.log(`Output ${i} uses us, but we already have it`);
        continue; //we already have it, nothing to do, next output
      } else { //else, this integration is new for this sensor
        //log for debugging
        console.log(`Starting to integrate for integration: ${integrationKey}, sensor: ${output.sensorName}, perMin: ${outputExtra.sensorCostPerMin}, costPerKB: ${outputExtra.sensorCostPerKB}`);
        ourIntegration.integrations.set(integrationKey, //add this integration to our information, using the extra output information for correct costs
          {
            topic: Integration.mqttTopic(integration),
            integrationInput: integration.input,
            integrationCounter: integration.counter,
            outputIndex: i,
            perKB: integration.outputsExtra[i].sensorCostPerKB,
            perMin: integration.outputsExtra[i].sensorCostPerMin,
            dataLastAt: minutesNow(integration.startTime),
            coinsLeft: output.amount,
            index: i
          });
      }
    }
  }

  const removing: string[] = [];

  for (const [sensorName, sensorIntegrations] of ourIntegrations) {

    for (const [hash, info] of sensorIntegrations.integrations) {
      applyCost(hash, info, minutesNow(blockchain.lastBlock().timestamp), 0);
      if (info.coinsLeft < 0) {
        chainServer.sendTx(Commit.wrap(new Commit(keyPair, info.integrationInput, info.integrationCounter, [{ i: info.outputIndex, commitRatio: 1 }])));
        removing.push(hash);
      }
    }
    for (const hash of removing) {
      sensorIntegrations.integrations.delete(hash);
    }
    if (sensorIntegrations.integrations.size === 0) {
      ourIntegrations.delete(sensorName);
    }
  }
}

const aedesOptions: Aedes.AedesOptions = {
  id: broker_name,
  authorizeSubscribe: function (client: Aedes.Client, sub: Aedes.Subscription, cb: (err: Error, sub: Aedes.Subscription) => void) { //can only subscribe to out/
    if (!sub.topic.startsWith("out/")) {
      console.log(`Failed subscribe to topic ${sub.topic} by ${client}`);
      return cb(new Error("Can't sub to this topic"), sub);
    } else {
      console.log(`Subscription by ${client} to ${sub.topic}`);
    }
    cb(null, sub)
  },
  authorizePublish: function (client: Aedes.Client, packet: Aedes.PublishPacket, callback: (err: Error) => void) { //can only publish to in/
    if (!packet.topic.startsWith("in/")) {
      console.log(`Failed publish to topic ${packet.topic} by ${client}`);
      return callback(new Error("Can't publish to this topic"))
    } else {
      onNewPacket(packet.topic.substring(3), packet.payload);
    }
    callback(null)
  },
  authenticate: function (_client: Aedes.Client, _username: string, _password: Buffer, callback: (err: Aedes.AuthenticateError, success: boolean)=>void) { //this will change maybe
    callback(null, true)
  }
};

const mqtt = Aedes.Server(aedesOptions);
const MQTTServer = Net.createServer(mqtt.handle);

//whenever a new packet of data is received by the MQTT broker
function onNewPacket(sensor: string, data:string | Buffer) {
  //check to see if sensor has been paid for

  console.log(`New packet from ${sensor} with size ${data.length}`);

  const foundSensor = ourIntegrations.get(sensor);

  //if we aren't brokering this sensor, ignore
  if (foundSensor === undefined) {
    console.log(`We aren't brokering this sensor`);
    return;
  }

  const now = minutesNow();

  const removing: string[] = [];

  //for everone intergrating with this sensor
  for (const [hash, info] of foundSensor.integrations) {
    applyCost(hash, info, now, 0);    
    if (info.coinsLeft < 0) {
      //we're out of time, integration is over
      console.log(`out of coins for ${hash}`);
      chainServer.sendTx(Commit.wrap(new Commit(keyPair, info.integrationInput, info.integrationCounter, [{i: info.outputIndex, commitRatio: 1}])));
      removing.push(hash);
    } else {
      applyCost(hash, info, now, data.length);
      mqtt.publish({
        cmd: 'publish',
        retain: true,
        dup: false,
        qos: 2,
        topic: "out/" + info.topic + '/' + info.index,
        payload: data
      },
        (err: Error) => {
          if (err) {
            console.log(`Error internal publish: ${err.message}`);
          }
        });
    }
  }

  for (const hash of removing) {
    foundSensor.integrations.delete(hash);
  }
  if (foundSensor.integrations.size === 0) {
    ourIntegrations.delete(sensor);
  }
}

MQTTServer.listen(MQTTPort, () => {
  console.log("Sensor MQTT started");
});

const app = express();
app.use(bodyParser.json());

app.get('/ChainServer/sockets', (_req, res) => {
  res.json('NYI');
});
app.post('/ChainServer/connect', (req, res) => {
  chainServer.connect(req.body.url);
  res.json("Connecting");
});

app.get('/public-key', (_req, res) => {
  res.json(pubKey);
});

app.get('/key-pair', (_req, res) => {
  res.json(ChainUtil.serializeKeyPair(keyPair));
});

app.get('/MyBalance', (_req, res) => {
  res.json(blockchain.getBalanceCopy(pubKey));
});
app.get('/Balance', (req, res) => {
  const balance = blockchain.getBalanceCopy(req.body.publicKey);
  res.json(balance);
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

//init chain
blockchain = await Blockchain.create(persistenceLocation, fusekiLocation);

chainServer = new PropServer("Chain-server", blockchain, WebSocket as unknown as SocketConstructor, WebSocketServer);
chainServer.start(chainServerPort, publicAddress, chainServerPeers);

app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));

blockchain.addListener(onBlockchainChange);

const fakeChanges: UpdaterChanges = {
  SENSOR: new Set<string>(),
  WALLET: new Set<string>(),
  BROKER: new Set<string>(),
  INTEGRATION: new Set<string>(),
  NODE_RDF: new Set<string>(),
  LITERAL_RDF: new Set<string>()
};

const currentIntegrations = blockchain.getIntegrations();
for (const integrationKey of currentIntegrations.keys()) {
  fakeChanges.INTEGRATION.add(integrationKey);
}
onBlockchainChange(null, fakeChanges, 0);