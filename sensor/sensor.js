const Websocket = require('ws');

const ChainUtil = require('../util/chain-util');
const crypto = require('crypto');

const STATE_SERVER_HELLOING = 0;
const STATE_SERVER_FINNING = 1;
const STATE_OPERATIONAL = 2;

function onServerHelloing(sensor, data) {
  const serverNonce = data.toString();

  if (typeof serverNonce !== 'string') {
    console.log("Bad server hello");
    sensor.close();
    return;
  }
  sensor.serverNonce = serverNonce;

  crypto.randomBytes(2048, (err, buf) => {
    if (err) {
      console.log(`Couldn't generate client nonce: ${err}`);
      sensor.close();
      return;
    }

    sensor.clientNonce = buf.toString('hex');

    sensor.socket.send(JSON.stringify({
      owner: sensor.keyPair.getPublic().encode('hex'),
      sensor: sensor.sensorId,
      signature: sensor.keyPair.sign(sensor.serverNonce + sensor.clientNonce),
      clientNonce: sensor.clientNonce
    }));
    sensor.state = STATE_SERVER_FINNING;
  });
}

function onServerFinning(sensor, data) {
  const signature = JSON.parse(data);
  if (typeof signature !== 'object') {
    console.log("Bad server fin");
    sensor.close();
    return;
  }

  if (sensor.brokerPublicKey !== null) {
    const verifyRes = ChainUtil.verifySignature(sensor.brokerPublicKey, data, sensor.clientNonce + sensor.serverNonce);
    if (!verifyRes.result) {
      console.log("Bad server fin singature: " + verifyRes.reason);
      sensor.close();
      return;
    }
    console.log("Broker authed, operational");
  } else {
    console.log("No broker public key stored, blindly trusting the broker");
  }

  sensor.state = STATE_OPERATIONAL;
  for (const msg of sensor.queue) {
    sensor.send(msg);
  }
}

function onOperational(_, _) {
}

function onSocketMessage(sensor, data) {
  switch (sensor.state) {
    case STATE_SERVER_HELLOING: onServerHelloing(sensor, data); break;
    case STATE_SERVER_FINNING: onServerFinning(sensor, data); break;
    case STATE_OPERATIONAL: onOperational(sensor, data); break;
    default: throw Error("Invalid internal state");
  }
}

function onConnection(sensor) {
  sensor.socket.on('message', (data) => {
    onSocketMessage(sensor, data);
  });
}

class Sensor {
  constructor(keyPair, sensorId, brokerLocation, brokerPublicKey) {
    this.keyPair = keyPair;
    this.sensorId = sensorId;
    this.brokerPublicKey = brokerPublicKey;
    this.state = STATE_SERVER_HELLOING;
    this.queue = [];

    this.socket = new Websocket(brokerLocation);
    this.socket.on('open', (_) => onConnection(this));
  }

  send(data) {
    if (this.state != STATE_OPERATIONAL) {
      this.queue.push(data);
    } else {
      this.socket.send(data);
    }
  }

  close() {
    this.socket.close();
  }
}

module.exports = Sensor;