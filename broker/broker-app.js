//BROKER
const express = require('express');
const bodyParser = require('body-parser');
const BlockchainProp = require('../network/blockchain-prop');
const Broker = require('./broker');

const Aedes = require('aedes');

const Config = require('../util/config');
const ChainUtil = require('../util/chain-util');

const QueryEngine = require('@comunica/query-sparql-rdfjs').QueryEngine;
const Blockchain = require('../blockchain/blockchain');
const Block = require('../blockchain/block');
const Integration = require('../blockchain/integration');
const SensorRegistration = require('../blockchain/sensor-registration');
const BrokerRegistration = require('../blockchain/sensor-registration');

'use strict';

const {
  DEFAULT_PORT_BROKER_API,
  DEFAULT_PORT_BROKER_CHAIN,
  DEFAULT_PORT_BROKER_SENSOR_HANDSHAKE,
  DEFAULT_PORT_BROKER_MQTT,
  DEFAULT_PORT_MINER_CHAIN
} = require('../util/constants');

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
const MQTTPort = config.get({
  key: "broker-MQTT-port",
  default: DEFAULT_PORT_BROKER_MQTT
});

const blockchain = Blockchain.loadFromDisk(blockchainLocation);

function minutesNow() {
  //divide by 1000 for ms, 60 for seconds, and floor to get whole minutes passed
  return Date.now() / (1000 * 60);
}

/*
  Sensor name -> {
     Integration Hash -> {
       sensor per kb
       sensor per min
       dataLastAt
       coinsLeft
       index
       }
    }
*/
const ourIntegrations = new Map();

const ourSensors = new Map();
const sensorOwnerHistory = [];

function onBlockchainChange(newBlocks, oldBlocks, difference) {
  const popCount = oldBlocks.length - difference;
  for (let i = 0; i < popCount; i++) {
    const changing = sensorOwnerHistory.pop();
    for (const sensorName of changing.removing) {
      ourSensors.delete(sensorName);
      console.log(`No longer brokering due to pop: ${sensorName}`);
    }
    for (const sensor of changing.adding) {
      ourSensors.set(SensorRegistration.getSensorName(sensor), sensor);
      console.log(`Now brokering due to pop: ${SensorRegistration.getSensorName(sensor)}`);
    }
  }

  //Integration hash -> Integration
  const removedIntegrations = new Map();

  for (let i = difference; i < oldBlocks.length; i++) {
    for (const integration of Block.getIntegrations(oldBlocks[i])) {
      removedIntegrations.set(Integration.hashToSign(integration), integration);
    }
  }

  //see what's added, then see what's removed
  //if it's been removed and added, we don't change anything, else we do the respective operation
  for (let i = difference; i < newBlocks.length; i++) {
    //play with the new integrations
    const newHistory = {
      adding: [],
      removing: []
    };
    for (const integration of Block.getIntegrations(newBlocks[i])) {
      const integrationHash = Integration.hashToSign(integration);
      for (let i = 0; i < integration.outputs.length; i++) { //for every output
        const output = integration.outputs[i];
        if (ourSensors.has(output.sensorName)) { //if it references one of our sensors
          
          const sensor = ourSensors.get(output.sensorName);
          if (!ourIntegrations.has(output.sensorName)) { //if the entry for this sensor doesn't exist
            ourIntegrations.set(output.sensorName, new Map()); //make it
          }
          const integrationMap = ourIntegrations.get(output.sensorName);
          if (integrationMap.has(integrationHash)) { //if it already exists
            removedIntegrations.delete(integrationHash); //remove it from the removed map, as it's still present in the new chain
          } else { //else
            console.log(`Starting to integrate for integration: ${integrationHash}, sensor: ${output.sensorName}, perMin: ${SensorRegistration.getCostPerMinute(sensor)}, costPerKB: ${SensorRegistration.getCostPerKB(sensor)}`);
            integrationMap.set(Integration.hashToSign(integration), //add the integration
              {
                perKB: SensorRegistration.getCostPerKB(sensor),
                perMin: SensorRegistration.getCostPerMinute(sensor),
                dataLastAt: minutesNow(),
                coinsLeft: output.amount,
                index: i
              });
          }
        }
      }
    }
    //playing with integrations done, now update which sensors we own
    for (const sensorRegistration of Block.getSensorRegistrations(newBlocks[i])) {
      const sensorName = SensorRegistration.getSensorName(sensorRegistration);
      if (ourSensors.has(sensorName)) { //if this sensor is currently one of ours
        const existingSensor = ourSensors.get(sensorName);
        if (SensorRegistration.getIntegrationBroker(sensorRegistration) !== broker_name) {//if the broker is now not us
          newHistory.adding.push(existingSensor);
          ourSensors.delete(sensorName);
          console.log(`No longer brokering due to push: ${sensorName}`);
        } else {
          newHistory.adding.push(existingSensor);
          ourSensors.set(sensorName, sensorRegistration);
          console.log(`Updated brokering of ${sensorName}`);
        }
      } else { //else, we don't currently own this sensor
        if (SensorRegistration.getIntegrationBroker(sensorRegistration) === broker_name) {
          newHistory.removing.push(sensorName);
          ourSensors.set(sensorName, sensorRegistration);
          console.log(`Now brokering due to push: ${sensorName}`);
        }
      }
    }
    sensorOwnerHistory.push(newHistory);
  }

  for (const [hash, integration] of removedIntegrations) {
    for (const output of integration.outputs) {
      if (ourSensors.has(output.sensorName)) {
        ourSensors.get(output.sensorName).integrations.remove(hash);
      }
    }
  }
}
blockchain.addListener(onBlockchainChange);
onBlockchainChange(blockchain.blocks(), [], 0);

const mqtt = new Aedes({
  id: broker_name
});
const MQTTServer = require('net').createServer(mqtt.handle);

function onNewPacket(sensor, data) {
  //check to see if sensor has been paid for

  console.log(`New packet from ${sensor} with size ${data.length}`);

  const foundSensor = ourIntegrations.get(sensor);

  if (typeof foundSensor === "undefined") {
    return;
  }

  const now = minutesNow();

  const removing = [];

  for (const [hash, info] of foundSensor) {
    const timeDelta = now - info.dataLastAt;
    const cost =
      timeDelta * info.perMin
      + data.length / 1024 * info.perKB;
    console.log(`out/${hash}/${info.index} = timeDelta: ${timeDelta}, cost: ${cost}`);
    if (cost >= info.coinsLeft) {
      //we're out of money, integration is over
      console.log(`out of coins for ${hash}`);
      removing.push(hash);
    } else {
      info.coinsLeft -= cost;
      info.dataLastAt = now;
      mqtt.publish({
        topic: "out/" + hash + '/' + info.index,
        payload: data
      });
    }
  }

  for (const hash of removing) {
    foundSensor.delete(hash);
  }
  if (foundSensor.size === 0) {
    ourIntegrations.delete(sensor);
  }
}

//can only subscribe to out/
mqtt.authorizeSubscribe = function (client, sub, callback) {
  if (!sub.topic.startsWith("out/")) {
    console.log(`Failed subscribe to topic ${sub.topic} by ${client}`);
    return callback(new Error("Can't sub to this topic"));
  } else {
    console.log(`Subscription by ${client} to ${sub.topic}`);
  }
  callback(null, sub)
}
//can only publish to in/
mqtt.authorizePublish = function (client, packet, callback) {
  if (!packet.topic.startsWith("in/")) {
    console.log(`Failed publish to topic ${packet.topic} by ${client}`);
    return callback(new Error("Can't publish to this topic"))
  } else {
    console.log(`Publish by ${client} to ${packet.topic} of size ${packet.payload.length}`);
    onNewPacket(packet.topic.substring(3), packet.payload);
  }
  callback(null)
}
//this will change maybe
mqtt.authenticate = function (client, username, password, callback) {
  callback(null, true)
}

function onSensorHandshakeMsg(sensor, data) {
  onNewPacket(sensor, data);
}

const chainServer = new BlockchainProp("Chain-server", blockchain);
chainServer.start(chainServerPort, null, chainServerPeers);

broker.start(sensorHandshakePort, onSensorHandshakeMsg);
MQTTServer.listen(MQTTPort, () => {
  console.log("Sensor MQTT started");
});

const app = express();
app.use(bodyParser.json());

app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));

app.get('/ourSensors', (req, res) => {
  res.json(ourSensors);
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