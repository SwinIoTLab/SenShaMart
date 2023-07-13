const Websocket = require('ws');
//const Mqtt = require('mqtt');
//const Aedes = require('aedes')(); /* aedes is a stream-based MQTT broker */
//const MQTTserver = require('net').createServer(aedes.handle);

const ChainUtil = require('../util/chain-util');
const crypto = require('crypto');

const STATE_CLIENT_HELLOING = 0;
const STATE_OPERATIONAL = 1;

function onClientHelloing(parent, socket, data) {
  const asJson = JSON.parse(data);
  const owner = asJson.owner;
  const sensor = asJson.sensor;
  const signature = asJson.signature;
  const clientNonce = asJson.clientNonce;

  if (typeof owner !== 'string' || typeof sensor !== 'string' || typeof signature !== 'object' || typeof clientNonce !== 'string') {
    console.log("Bad client hello");
    socket.close();
    return;
  }
  socket.owner = owner;
  socket.sensor = sensor;
  socket.clientNonce = clientNonce;
  const verifyRes = ChainUtil.verifySignature(owner, signature, socket.serverNonce + clientNonce);
  if (!verifyRes.result) {
    console.log("Bad client hello signature: " + verifyRes.reason);
    socket.close();
    return;
  }

  const ourSig = parent.keyPair.sign(clientNonce + socket.serverNonce);
  socket.send(JSON.stringify(ourSig));
  socket.state = STATE_OPERATIONAL;
  console.log(`Sensor ${socket.owner}:${socket.sensor} is operational`);
}

function onOperational(parent, socket, data) {
  parent.onMessage(socket.sensor, data);
}

function onSocketMessage(parent, socket, data) {
  switch (socket.state) {
    case STATE_CLIENT_HELLOING: onClientHelloing(parent, socket, data); break;
    case STATE_OPERATIONAL: onOperational(parent, socket, data); break;
    default: throw Error("Invalid internal state");
  }
}

class Socket {
  constructor(parent, socket, serverNonce) {
    this.parent = parent;
    this.socket = socket;
    this.serverNonce = serverNonce;
    this.state = STATE_CLIENT_HELLOING;
    this.socket.on('message', (data) => {
      onSocketMessage(parent, this, data);
    });
    this.send(serverNonce);
  }

  send(data) {
    this.socket.send(data);
  }

  close() {
    this.socket.close();
  }
}

function onConnection(broker, rawSocket) {
  console.log("Sensor connected");
  crypto.randomBytes(2048, (err, buf) => {
    if (err) {
      console.log(`Couldn't generate server nonce: ${err}`);
      rawSocket.close();
      return;
    }
    new Socket(broker, rawSocket, buf.toString('hex'));
  });
}

class Broker {
  constructor(keyPair) {
    //owner:sensor->mqtt channel
    this.brokering = {};
    this.keyPair = keyPair;
  }

  start(sensorPort, onMessage) {
    this.onMessage = onMessage;
    this.sensorPort = sensorPort;
    this.server = new Websocket.Server({ port: this.sensorPort });
    this.server.on('connection', socket => onConnection(this, socket));

    console.log(`Broker listening for sensors on: ${this.sensorPort}`);
  }
}

module.exports = Broker;