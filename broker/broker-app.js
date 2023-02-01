//BROKER
const express = require('express');
const bodyParser = require('body-parser');
const P2pServer = require('../p2p-server');
const Broker = require('./broker');

const Aedes = require('aedes');

const Config = require('../config');
const ChainUtil = require('../chain-util');

const QueryEngine = require('@comunica/query-sparql-rdfjs').QueryEngine;
const Blockchain = require('../blockchain/blockchain');

'use strict';

const {
  DEFAULT_PORT_BROKER_API,
  DEFAULT_PORT_BROKER_CHAIN,
  DEFAULT_PORT_BROKER_SENSOR_HANDSHAKE,
  DEFAULT_PORT_BROKER_SENSOR_MQTT,
  DEFAULT_PORT_BROKER_CLIENT_MQTT,
  DEFAULT_PORT_MINER_CHAIN
} = require('../constants');

const CONFIGS_STORAGE_LOCATION = "./settings.json";

const config = new Config(CONFIGS_STORAGE_LOCATION);

const broker = new Broker(config.get({
  key: "broker-keypair",
  default: ChainUtil.genKeyPair(),
  transform: ChainUtil.deserializeKeyPair
}));
const broker_name = config.get({
  key: "broker-name",
  default: broker.keyPair.getPublic().encode('hex')
});
const apiPort = config.get({
  key: "broker-api-port",
  default: DEFAULT_PORT_BROKER_API
});
const blockchainLocation = config.get({
  key: "broker-blockchain-location",
  default: "./broker_blockchain.json"
});
const chainServerPort = config.get({
  key: "broker-chain-server-port",
  default: DEFAULT_PORT_BROKER_CHAIN
});
const chainServerPeers = config.get({
  key: "broker-chain-server-peers",
  default: ["ws://127.0.0.1:" + DEFAULT_PORT_MINER_CHAIN]
});
const sensorHandshakePort = config.get({
  key: "broker-sensor-handshake-port",
  default: DEFAULT_PORT_BROKER_SENSOR_HANDSHAKE
});
const sensorMQTTPort = config.get({
  key: "broker-sensor-MQTT-port",
  default: DEFAULT_PORT_BROKER_SENSOR_MQTT
});
const clientMQTTPort = config.get({
  key: "broker-client-MQTT-port",
  default: DEFAULT_PORT_BROKER_CLIENT_MQTT
});

const blockchain = Blockchain.loadFromDisk(blockchainLocation);

let sensorsServing = {};

const sensorMQTT = new Aedes({
  id: broker_name
});
const sensorMQTTServer = require('net').createServer(sensorMQTT.handle);
const sensorMQTTSubscriptions = {};
const clientMQTT = new Aedes({
  id: broker_name
});
const clientMQTTServer = require('net').createServer(clientMQTT.handle);

function onNewPacket(sensor, data) {
  //check to see if sensor has been paid for

  clientMQTT.publish({
    topic: sensor,
    payload: data
  });
}

function onChainServerRecv(data) {
  const replaceResult = blockchain.replaceChain(Blockchain.deserialize(data));
  if (!replaceResult.result) {
    console.log(`Failed to replace chain: ${replaceResult.reason}`);
    //failed to replace
    return;
  }

  blockchain.saveToDisk(blockchainLocation);

  sensorsServing = {};

  for (const sensorName in blockchain.sensors) {
    const sensorData = blockchain.sensors[sensorName];

    if (sensorData.integrationBroker === broker_name) {
      sensorsServing[sensorName] = sensorData;
    }
  }

  //UNSUBSCRIBE
  for (const sensorName in sensorMQTTSubscriptions) {
    if (!(sensorName in sensorsServing)) {

      const deliverFunction = sensorMQTTSubscriptions[sensorName];

      sensorMQTT.unsubscribe(sensorName, deliverFunction, () => { });

      delete sensorMQTTSubscriptions[sensorName];
    }
  }

  //SUBSCRIBE
  for (const sensorName in sensorsServing) {
    if (!(sensorName in sensorMQTTSubscriptions)) {
      const deliverFunction = (packet, cb) => {
        onNewPacket(packet.topic, packet.payload);
        cb();
      };

      sensorMQTTSubscriptions[sensorName] = deliverFunction;

      sensorMQTT.subscribe(sensorName, deliverFunction, () => { });
    }
  }
}
function onSensorHandshakeMsg(sensor, data) {
  onNewPacket(sensor, data);
}

const chainServer = new P2pServer("Chain-server");
chainServer.start(chainServerPort, chainServerPeers, (_) => { }, onChainServerRecv);

broker.start(sensorHandshakePort, onSensorHandshakeMsg);
sensorMQTTServer.listen(sensorMQTTPort, () => {
  console.log("Sensor MQTT started");
});
clientMQTTServer.listen(clientMQTTPort, () => {
  console.log("Client MQTT started");
});

const app = express();
app.use(bodyParser.json());


app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));

app.get('/sensors', (req, res) => {
  res.json(sensorsServing);
});

app.get('/ChainServer/sockets', (req, res) => {
  res.json(chainServer.sockets);
});
app.post('/ChainServer/connect', (req, res) => {
  chainServer.connect(req.body.url);
  res.json("Connecting");
});

app.get('/public-key', (req, res) => {
  res.json(wallet.publicKey);
});

app.get('/key-pair', (req, res) => {
  res.json(ChainUtil.serializeKeyPair(wallet.keyPair));
});

app.get('/MyBalance', (req, res) => {
  res.json(blockchain.getBalanceCopy(wallet.publicKey));
});
app.get('/Balance', (req, res) => {
  const balance = blockchain.getBalanceCopy(req.body.publicKey);
  res.json(balance);
});
app.get('/Balances', (req, res) => {
  const balances = blockchain.balances;
  res.json(balances);
});

const myEngine = new QueryEngine();

app.post('/sparql', (req, res) => {
  const start = async function () {
    try {
      let result = [];
      const bindingsStream = await myEngine.queryBindings(
        req.body.query,
        {
          readOnly: true,
          sources: getBlockchain().stores
        });
      bindingsStream.on('data', (binding) => {
        result.push(binding);
      });
      bindingsStream.on('end', () => {
        res.json(JSON.stringify(result));
      });
      bindingsStream.on('error', (err) => {
        console.error(err);
      });
    } catch (err) {
      console.error(err);
      res.json("Error occured while querying");
    }
  };

  start()

});