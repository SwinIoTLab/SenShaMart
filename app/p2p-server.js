const Websocket = require('ws');
const N3 = require('n3');
const DataFactory = require('n3').DataFactory;
const fs = require('fs');
const process = require('process');
const Miner = require('./miner');
const Transaction = require('../wallet/transaction');
const TransactionPool = require('../wallet/transaction-pool');
const Metadata = require('../wallet/metadata');

const P2P_PORT = process.env.P2P_PORT || 5000;
const peers = process.env.PEERS ? process.env.PEERS.split(',') : [];
const MESSAGE_TYPES = {
  chain: 'CHAIN',
  transaction: 'TRANSACTION',
  clear_transactions: 'CLEAR_TRANSACTIONS',
  metadata: 'METADATA'
};

class P2pServer {
  constructor(blockchain, transactionPool, wallet, chainStorageLocation) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.sockets = [];
    this.store = new N3.Store();
    this.chainStorageLocation = chainStorageLocation;
    this.miner = new Miner(this.blockchain, this.transactionPool, wallet, this);

    //possible race if deleted after check, but we live with it I guess
    if (fs.existsSync(this.chainStorageLocation)) {
      const rawPersistedChain = fs.readFileSync(this.chainStorageLocation, 'utf8');
      const chain = JSON.parse(rawPersistedChain);
      this.newChain(chain, false);
    } else {
      console.log("Didn't find a persisted chain, starting from genesis");
    }
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
    if (!Transaction.verifyTransaction(transaction)) {
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

  newBlock(block) {
    if (!this.blockchain.addBlock(block)) {
      //invalid block, return
      return;
    }
    this.onNewBlock(block);
    this.persistChain(this.blockchain.chain);
    this.syncChains();
  }

  newChain(chain, persist) {
    const oldChain = this.blockchain.chain;
    const divergence = this.blockchain.replaceChain(chain);

    if (divergence === null) {
      //failed to replace
      return;
    }
    if (typeof persist === "undefined" || persist) {
      this.persistChain(chain);
    }
    for (let i = divergence; i < oldChain.length; i++) {
      this.store.deleteGraph(oldChain[i].hash);
    }
    for (let i = divergence; i < this.blockchain.chain.length; i++) {
      this.onNewBlock(this.blockchain.chain[i]);
    }
  }

  persistChain(chain) {
    try {
      fs.writeFileSync(
        this.chainStorageLocation,
        JSON.stringify(chain));
    } catch (err) {
      console.error("Couldn't persist chain, aborting");
      process.exit(-1);
    }
  }

  onNewBlock(block) {
    //block data is of form [transactions,metadatas]
    if (block.data.length != 2) {
      //assert?
      return;
    }

    this.transactionPool.clearFromBlock(block);

    this.miner.interrupt();

    const metadatas = block.data[1];

    for (const metadata of metadatas) {
      if (!("SSNmetadata" in metadata)) {
        //assert?
        return;
      }

      var ssn = metadata.SSNmetadata;

      const parser = new N3.Parser();

      parser.parse(
        ssn,
        (error, quadN, prefixes) => {
          if (quadN) {
            this.store.addQuad(DataFactory.quad(
              DataFactory.namedNode(quadN.subject.id),
              DataFactory.namedNode(quadN.predicate.id),
              DataFactory.namedNode(quadN.object.id),
              DataFactory.namedNode(block.hash)));
          }
        });
    }
  }

  sendChain(socket) {
    socket.send(JSON.stringify({
      type: MESSAGE_TYPES.chain,
      chain: this.blockchain.chain
    }));
  }

  //sendTransaction(socket, transaction) {
  //  socket.send(JSON.stringify({
  //    type: MESSAGE_TYPES.transaction,
  //    transaction
  //  }));
  //}
  
  //sendMetadata(socket, metadata) {
  //  socket.send(JSON.stringify({ 
  //    type: MESSAGE_TYPES.metadata,
  //    metadata
  //  }));
  //}
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