const Websocket = require('ws');

const fs = require('fs');
const process = require('process');
const Miner = require('./miner');
const Transaction = require('../wallet/transaction');
const TransactionPool = require('../wallet/transaction-pool');
const Metadata = require('../wallet/metadata');
const Blockchain = require('../blockchain');

const P2P_PORT = process.env.P2P_PORT || 5000;
const peers = process.env.PEERS ? process.env.PEERS.split(',') : [];
const MESSAGE_TYPES = {
  chain: 'CHAIN',
  transaction: 'TRANSACTION',
  clear_transactions: 'CLEAR_TRANSACTIONS',
  metadata: 'METADATA'
};

class P2pServer {
  constructor(transactionPool, rewardPublicKey, chainStorageLocation) {
    this.blockchain = new Blockchain();
    this.transactionPool = transactionPool;
    this.sockets = [];
    this.chainStorageLocation = chainStorageLocation;

    //possible race if deleted after check, but we live with it I guess
    if (fs.existsSync(this.chainStorageLocation)) {
      const rawPersistedChain = fs.readFileSync(this.chainStorageLocation, 'utf8');
      const deserialized = Blockchain.deserialize(rawPersistedChain);
      if (deserialized === null) {
        console.log(`Couldn't deserialize chain at '${this.chainStorageLocation}', starting from genesis`);
      } else {
        this.blockchain = deserialized;
      }
    } else {
      console.log("Didn't find a persisted chain, starting from genesis");
    }

    this.miner = new Miner(this.blockchain, this.transactionPool, rewardPublicKey, this);
  }

  listen() {
    const server = new Websocket.Server({ port: P2P_PORT });
    server.on('connection', socket => this.connectSocket(socket));

    this.connectToPeers();

    console.log(`Listening for peer-to-peer connections on: ${P2P_PORT}`);
  }

  connectToPeers() {
    peers.forEach(peer => {
      const socket = new Websocket(peer);

      socket.on('open', () => this.connectSocket(socket));
    });
  }

  connectSocket(socket) {
    this.sockets.push(socket);
    console.log('Socket connected');

    this.messageHandler(socket);

    this.sendChain(socket);
  }

  messageHandler(socket) {
    socket.on('message', message => {
      const data = JSON.parse(message);
      switch(data.type) {
        case MESSAGE_TYPES.chain:
          this.newChain(data.chain);
          break;
        case MESSAGE_TYPES.transaction:
          this.newTransaction(data.transaction, false);
          break;
        case MESSAGE_TYPES.metadata:
          this.newMetadata(data.metadata, false);
          break;
        //case MESSAGE_TYPES.clear_transactions:
        //  this.transactionPool.clear();
        //  break;
      }
    });
  }

  newMetadata(metadata, broadcast) {
    if (!Metadata.verifyMetadata(metadata)) {
      console.log("Couldn't add metadata to p2pServer, couldn't verify");
      return;
    }

    switch (this.transactionPool.updateOrAddMetadata(metadata)) {
      case TransactionPool.Return.add:
        this.miner.startMine();
        break;
      case TransactionPool.Return.update:
        this.miner.interruptIfContainsMetadata(metadata);
        break;
      case TransactionPool.Return.error:
        console.log("Couldn't add metadata to p2pServer, couldn't updateOrAdd");
        return;
    }

    if (broadcast === undefined || broadcast) {
      this.broadcastMetadata(metadata);
    }
  }

  newTransaction(transaction, broadcast) {
    if (!Transaction.verify(transaction)) {
      console.log("Couldn't add transaction to p2pServer, couldn't verify");
      return false;
    }

    switch (this.transactionPool.updateOrAddTransaction(transaction)) {
      case TransactionPool.Return.add:
        this.miner.startMine();
        break;
      case TransactionPool.Return.update:
        this.miner.interruptIfContainsTransaction(transaction);
        break;
      case TransactionPool.Return.error:
        console.log("Couldn't add transaction to p2pServer, couldn't updateOrAdd");
        return;
    }

    if (broadcast === undefined || broadcast) {
      this.broadcastTransaction(transaction);
    }
  }

  blockMined(block) {
    if (!this.blockchain.addBlock(block)) {
      //invalid block, return
      return;
    }
    this.transactionPool.clearFromBlock(block);
    this.miner.interrupt();
    this.persistChain(this.blockchain);
    this.syncChains();
  }

  newChain(chain, persist) {
    const replaceResult = this.blockchain.replaceChain(chain);
    if (!replaceResult.result) {
      //failed to replace
      return;
    }

    for (let i = 0; i < replaceResult.chainDifference; i++) {
      this.transactionPool.clearFromBlock(this.blockchain.chain[i]);
    }

    this.miner.interrupt();

    if (typeof persist === "undefined" || persist) {
      this.persistChain(this.blockchain);
    }
  }

  persistChain(chain) {
    try {
      fs.writeFileSync(
        this.chainStorageLocation,
        chain.serialize());
    } catch (err) {
      console.error(`Couldn't persist chain, aborting: ${err}`);
      process.exit(-1);
    }
  }

  sendChain(socket) {
    socket.send(JSON.stringify({
      type: MESSAGE_TYPES.chain,
      chain: this.blockchain.serialize()
    }));
  }

  sendTransaction(socket, transaction) {
    socket.send(JSON.stringify({
      type: MESSAGE_TYPES.transaction,
      transaction
    }));
  }
  
  sendMetadata(socket, metadata) {
    socket.send(JSON.stringify({ 
      type: MESSAGE_TYPES.metadata,
      metadata
    }));
  }
  syncChains() {
    this.sockets.forEach(socket => this.sendChain(socket));
  }

  broadcastTransaction(transaction) {
    this.sockets.forEach(socket => this.sendTransaction(socket, transaction));
  }

  broadcastMetadata(metadata) {
    this.sockets.forEach(socket => this.sendMetadata(socket, metadata));
  }

  //broadcastClearTransactions() {
  //  this.sockets.forEach(socket => socket.send(JSON.stringify({
  //    type: MESSAGE_TYPES.clear_transactions
  //  })));
  //}
}

module.exports = P2pServer;