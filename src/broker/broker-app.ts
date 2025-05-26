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
import express from 'express'
import bodyParser from 'body-parser'
import { PropServer } from '../network/blockchain-prop.js'
//import Broker from './broker.js';

import Aedes from 'aedes'
import Config from '../util/config.js'
import { ChainUtil } from '../util/chain-util.js'
import { default as IntegrationCache } from './integration-cache.js'
import { Blockchain } from '../blockchain/blockchain.js'
import Net from 'net';
import Broker from './broker.js'
import { WebSocket, WebSocketServer } from 'ws'
import Commit from '../blockchain/commit.js'
//import fs from 'fs';

'use strict';

import {
  DEFAULT_PORT_BROKER_API,
  DEFAULT_PORT_BROKER_CHAIN,
  DEFAULT_PORT_BROKER_MQTT,
  DEFAULT_PORT_MINER_CHAIN
} from '../util/constants.js';

const args = process.argv;

if (args.length > 2 && args[2] === "-h") {
  console.log(args[0] + ' ' + args[1] + " <optional: location of settings file> <optional: prefix in settings file>");
  process.exit(0);
}

const CONFIGS_STORAGE_LOCATION = args.length > 2 ? args[2] : "./settings.json";
const CONFIG_PREFIX = args.length > 3 ? args[3] : "broker-";

const config = new Config(CONFIGS_STORAGE_LOCATION);

const keyPairString = config.get(CONFIG_PREFIX + "keypair", null, ChainUtil.createValidateIsEither<string | null>(ChainUtil.validateIsSerializedKeyPair, ChainUtil.validateIsNull));
if (keyPairString === null) {
  throw new Error("No keypair found");
}
const keyPair = ChainUtil.deserializeKeyPair(keyPairString);
const pubKey = ChainUtil.serializePublicKey(keyPair.pub);
const brokerName = config.get(CONFIG_PREFIX + "name", pubKey, ChainUtil.validateIsString);

const fusekiLocation = config.get(CONFIG_PREFIX + "fuseki", null, ChainUtil.createValidateIsEither<string | null>(ChainUtil.validateIsString, ChainUtil.validateIsNull));
const apiPort = config.get(CONFIG_PREFIX + "api-port", DEFAULT_PORT_BROKER_API, ChainUtil.validateIsNumber);
const persistenceLocation = config.get(CONFIG_PREFIX + "blockchain", "./broker_blockchain.db", ChainUtil.validateIsString);
const chainServerPort = config.get(CONFIG_PREFIX + "chain-server-port", DEFAULT_PORT_BROKER_CHAIN, ChainUtil.validateIsNumber);
const publicAddress = config.get(CONFIG_PREFIX + "public-address", "-", ChainUtil.validateIsString);
const chainServerPeers = config.get(CONFIG_PREFIX + "chain-server-peers", ["ws://127.0.0.1:" + DEFAULT_PORT_MINER_CHAIN], ChainUtil.createValidateArray<string>(ChainUtil.validateIsString));
const MQTTPort = config.get(CONFIG_PREFIX + "MQTT-port", DEFAULT_PORT_BROKER_MQTT, ChainUtil.validateIsNumber);
const passthrough = config.get(CONFIG_PREFIX + "passthrough", false, ChainUtil.validateBoolean);
const integrationCacheLocation = config.get(CONFIG_PREFIX + "cache-location", "./broker_integration_cache.db", ChainUtil.validateIsString);

const blockchain: Blockchain = await Blockchain.create(persistenceLocation, fusekiLocation);
const chainServer: PropServer = new PropServer("Chain-server", blockchain, {
  connect(address: string) {
    return new WebSocket(address);
  },
  listen(port: number) {
    return new WebSocketServer({
      port: port
    });
  }
});
const integrationCache = await IntegrationCache.create(integrationCacheLocation);

const aedesOptions: Aedes.AedesOptions = {
  id: brokerName,
  authorizeSubscribe: function (client: Aedes.Client, sub: Aedes.Subscription, cb: (err: Error | null, sub: Aedes.Subscription) => void) { //can only subscribe to out/
    if (!sub.topic.startsWith("out/")) {
      console.log(`Failed subscribe to topic ${sub.topic} by ${client}`);
      return cb(new Error("Can't sub to this topic"), sub);
    } else {
      console.log(`Subscription by ${client} to ${sub.topic}`);
    }
    cb(null, sub)
  },
  authorizePublish: function (client: Aedes.Client, packet: Aedes.PublishPacket, callback: (err: Error | null) => void) { //can only publish to in/
    if (!packet.topic.startsWith("in/")) {
      console.log(`Failed publish to topic ${packet.topic} by ${client}`);
      return callback(new Error("Can't publish to this topic"))
    } else {
      broker.onNewPacket(packet.topic.substring(3), packet.payload);
    }
    callback(null)
  },
  authenticate: function (_client: Aedes.Client, _username: string, _password: Buffer, callback: (err: Aedes.AuthenticateError | null, success: boolean)=>void) { //this will change maybe
    callback(null, true)
  }
};

const mqtt = Aedes.Server(aedesOptions);
const MQTTServer = Net.createServer(mqtt.handle);

const broker = new Broker(keyPair, passthrough, brokerName, blockchain, {
  publish: (topic: string, payload: string | Buffer): void => {
    mqtt.publish({
      cmd: 'publish',
      retain: true,
      dup: false,
      qos: 2,
      topic: topic,
      payload: payload
    }, (err) => {
      if (err) {
        console.log(`Error on internal passthrough publish: ${err.message}`);
      }
    });
  }
}, integrationCache, {
  commit: (tx: Commit) => {
    chainServer.sendCommitTx(tx);
  }
}, true);


//whenever a new packet of data is received by the MQTT broker


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

chainServer.start(chainServerPort, publicAddress, chainServerPeers);

app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));

MQTTServer.listen(MQTTPort, () => {
  console.log("Sensor MQTT started");
});