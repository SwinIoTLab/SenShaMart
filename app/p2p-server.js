const Websocket = require('ws');
const N3 = require('n3');
const parser = new N3.Parser(); //({format: 'application/n-quads'});
const DataFactory = require('n3').DataFactory;
const fs = require('fs');
const process = require('process');

const P2P_PORT = process.env.P2P_PORT || 5000;
const peers = process.env.PEERS ? process.env.PEERS.split(',') : [];
const MESSAGE_TYPES = {
  chain: 'CHAIN',
  transaction: 'TRANSACTION',
  clear_transactions: 'CLEAR_TRANSACTIONS',
  metadata: 'METADATA'
};

class P2pServer {
  constructor(blockchain, transactionPool,chainStorageLocation) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.sockets = [];
    this.store = new N3.Store();
    this.chainStorageLocation = chainStorageLocation;

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
          newChain(data.chain);
          break;
        case MESSAGE_TYPES.transaction:
          this.transactionPool.updateOrAddTransaction(data.transaction);
          break;
        case MESSAGE_TYPES.metadata:
          this.transactionPool.updateOrAddMetadata(data.metadata);
          break;
        case MESSAGE_TYPES.clear_transactions:
          this.transactionPool.clear();
          break;
      }
    });
  }

  newBlock(block) {
    this.onNewBlock(block.data);
    this.syncChains();
    this.persistChain(this.blockchain.chain);
  }

  newChain(chain,persist) {
    if (!this.blockchain.replaceChain(chain)) {
      //failed to replace
      return;
    }
    if (typeof persist === "undefined" || persist) {
      this.persistChain(chain);
    }
    //dirty clear
    this.store = new N3.Store();
    for (var block in this.blockchain.chain) {
      this.onNewBlock(block);
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
    if (block.length != 2) {
      //assert?
      return;
    }
    const metadatas = block[1];

    for (var metadata in metadatas) {
      if (!(SSNmetadata in metadata)) {
        //assert?
        return;
      }

      var ssn = metadata.SSNmetadata;

      parser.parse(
        ssn,
        (error, quadN, prefixes) => {
          if (quadN) {
            store.addQuad(DataFactory.quad(
              DataFactory.namedNode(quadN.subject.id),
              DataFactory.namedNode(quadN.predicate.id),
              DataFactory.namedNode(quadN.object.id)));
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

  //broadcastTransaction(transaction) {
  //  this.sockets.forEach(socket => this.sendTransaction(socket, transaction));
  //}

  //broadcastMetadata(metadata) {
  //  this.sockets.forEach(socket => this.sendMetadata(socket, metadata));
  //}

  //broadcastClearTransactions() {
  //  this.sockets.forEach(socket => socket.send(JSON.stringify({
  //    type: MESSAGE_TYPES.clear_transactions
  //  })));
  //}
}

module.exports = P2pServer;