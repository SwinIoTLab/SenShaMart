//SENSOR
const express = require('express');
const bodyParser = require('body-parser');

const Config = require('../util/config');
const ChainUtil = require('../util/chain-util');
const Sensor = require('./sensor');

const {
  DEFAULT_PORT_BROKER_SENSOR_HANDSHAKE,
  DEFAULT_PORT_SENSOR_API,
} = require('../util/constants');

'use strict';

const CONFIGS_STORAGE_LOCATION = "./settings.json";

const config = new Config(CONFIGS_STORAGE_LOCATION);

const keyPair = config.get({
  key: "sensor-keypair",
  default: ChainUtil.genKeyPair(),
  transform: ChainUtil.deserializeKeyPair
});
const apiPort = config.get({
  key: "sensor-api-port",
  default: DEFAULT_PORT_SENSOR_API
});
const sensorId = config.get({
  key: "sensor-id",
  default: "Test sensor"
});
const brokerLocation = config.get({
  key: "sensor-broker-location",
  default: "ws://127.0.0.1:" + DEFAULT_PORT_BROKER_SENSOR_HANDSHAKE
});
const brokerPublicKey = config.get({
  key: "sensor-broker-publickey",
  default: null
});

const sensor = new Sensor(keyPair, sensorId, brokerLocation, brokerPublicKey);

const app = express();
app.use(bodyParser.json());


app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));

app.post('/send', (req, res) => {
  console.log(`sending: ${JSON.stringify(req.body)}`);
  sensor.send(JSON.stringify(req.body));
  res.json("sent");
});