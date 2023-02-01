const Websocket = require('ws');

function messageHandler(p2pServer, socket) {
  socket.on('message', (data) => {
    p2pServer.onData(data);
  });
}

function onConnection(p2pServer, socket) {
  p2pServer.sockets.push(socket);
  console.log(`${p2pServer.name} had a socket connect`);

  p2pServer.onConnect(socket);

  messageHandler(p2pServer, socket);
}

/* DEAD CODE STORAGE
 * 
 *     

    this.miner = new Miner(this.blockchain, rewardPublicKey, this);
 * 
 * socket.on('message', message => {
    const data = JSON.parse(message);
    switch (data.type) {
      case MESSAGE_TYPES.chain:
        newChain(p2pServer, data.data);
        break;
      case MESSAGE_TYPES.payment:
        this.newTransaction(new Transaction(data.transaction, Payment), false);
        break;
      case MESSAGE_TYPES.integration:
        this.newTransaction(new Transaction(data.transaction, Integration), false);
        break;
      case MESSAGE_TYPES.sensorRegistration:
        this.newTransaction(new Transaction(data.transaction, SensorRegistration), false);
        break;
      case MESSAGE_TYPES.brokerRegistration:
        this.newTransaction(new Transaction(data.transaction, BrokerRegistration), false);
        break;
      default:
        console.log(`Unknown type '${data.type}' recved from socket ${socket}`);
        break;
    }
  });
 * 
 * const MESSAGE_TYPES = {
  chain: 'CHAIN',
  payment: 'PAYMENT',
  integration: 'INTEGRATION',
  sensorRegistration: 'SENSORREGISTRATION',
  brokerRegistration: 'BROKERREGISTRATION'
};

console.error(`Couldn't persist chain, aborting: ${err}`);
      process.exit(-1);

function newChain(p2pServer, chain, persist) {
  const replaceResult = p2pServer.blockchain.replaceChain(chain);
  if (!replaceResult.result) {
    //failed to replace
    return;
  }

  for (let i = 0; i < replaceResult.chainDifference; i++) {
    p2pServer.miner.onNewBlock(p2pServer.blockchain.chain[i]);
  }

  p2pServer.miner.interrupt();

  if (typeof persist === "undefined" || persist) {
    persistChain(p2pServer, p2pServer.blockchain);
  }
}

function syncChains(p2pServer) {
  const serializedBlockchain = p2pServer.blockchain.serialize();

  for (const socket of p2pServer.sockets) {
    send(socket, serializedBlockchain, MESSAGE_TYPES.chain);
  }
}

function broadcastTransaction(p2pServer, tx) {
  let type = null;

  switch (tx.type) {
    case Payment: type = MESSAGE_TYPES.payment; break;
    case Integration: type = MESSAGE_TYPES.integration; break;
    case BrokerRegistration: type = MESSAGE_TYPES.brokerRegistration; break;
    case SensorRegistration: type = MESSAGE_TYPES.sensorRegistration; break;
    default: throw Error("Unknown tx type");
  }

  for (const socket of p2pServer.sockets) {
    send(socket, tx.transaction, type);
  }
}

  newTransaction(transaction, broadcast) {
    if (!transaction.verify(transaction.transaction)) {
      console.log("Couldn't add transaction to p2pServer, couldn't verify");
      return;
    }

    this.miner.addTransaction(transaction);

    if (broadcast === undefined || broadcast) {
      broadcastTransaction(this, transaction);
    }
  }

  blockMined(block) {
    if (!this.blockchain.addBlock(block)) {
      //invalid block, return
      return;
    }
    this.miner.onNewBlock(block);
    persistChain(this, this.blockchain);
    syncChains(this);
  }

 * 
 */

class P2pServer {
  constructor(name) {
    this.name = name;
    this.sockets = [];
  }

  start(port, peers, onConnect, onData) {
    this.port = port;
    this.onConnect = onConnect;
    this.onData = onData;
    this.server = new Websocket.Server({ port: port });
    this.server.on('connection', socket => onConnection(this, socket));

    for (const peer of peers) {
      this.connect(peer);
    }

    console.log(`Listening for peer-to-peer connections on: ${port}`);
  }

  connect(to) {
    const socket = new Websocket(to);

    socket.on('open', () => onConnection(this, socket));
  }

  broadcast(data) {
    for (const socket of this.sockets) {
      P2pServer.send(socket, data);
    }
  }

  static send(socket, data) {
    socket.send(data);
  }
}

module.exports = P2pServer;