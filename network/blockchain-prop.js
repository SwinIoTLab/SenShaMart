const Websocket = require('ws');
const ChainUtil = require('../util/chain-util');
const Block = require('../blockchain/block');
const BrokerRegistration = require('../blockchain/broker-registration');
const SensorRegistration = require('../blockchain/sensor-registration');
const Integration = require('../blockchain/integration');
const Payment = require('../blockchain/payment');
const Compensation = require('../blockchain/compensation');
const Transaction = require('../blockchain/transaction');

const STATE_INIT = 0;
const STATE_CONNECTING = 1;
const STATE_WAITING = 2;
const STATE_READY = 3;

const PEER_OK = 0;
const PEER_DEAD = 1;

const chainValidation = {
  start: ChainUtil.createValidateIsIntegerWithMin(1),
  blocks: ChainUtil.createValidateArray(Block.verify)
};

const txsValidation = {
  SensorRegistration: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(SensorRegistration.verify)),
  BrokerRegistration: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(BrokerRegistration.verify)),
  Integration: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(Integration.verify)),
  Compensation: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(Compensation.verify)),
  Payment: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(Payment.verify))
};

class Connection {
  constructor(parent) {
    this.parent = parent;
    this.address = null;
    this.socket = null;
    this.state = STATE_INIT;

    this.prev = null;
    this.next = null;

    this.differing = null;
    this.lastBlockHash = "";

    this.queue = null;
    this.queueTimer = null;

    this.sub = {
      txs: false
    };

    this.logName = `${parent.logName}:${parent.connectionCounter}`;
    parent.connectionCounter++;
  }

  accepted(socket) {
    this.socket = socket;

    this.socket.addEventListener("error", (err) => {
      this.onError("Error event");
    });


    this.socket.addEventListener("message", (data) => {
      this.onMessage(data);
    });

    this.onConnection(false);
  }

  connect(address) {
    this.address = address;
    this.state = STATE_CONNECTING;

    this.reconnectWait = 1;
    this.reconnect();
  }

  reconnect() {
    console.log(`${this.logName} connecting`);
    this.socket = new Websocket(this.address);
    this.socket.addEventListener("error", (err) => {
      this.onError("Error event");
    });

    this.socket.addEventListener("open", () => {
      this.onConnection(true);
    });

    this.socket.addEventListener("message", (data) => {
      this.onMessage(data);
    });
  }

  retryDead(address) {

  }

  onError(message) {
    console.log(this.logName + ": " + message);
    switch (this.state) {
      case STATE_CONNECTING:
        //this.reconnectWait seconds + random [0,1000] ms
        setTimeout(() => this.reconnect(),
          1000 * this.reconnectWait + Math.floor(Math.random() * 1000));
        this.reconnectWait *= 2;
        if (this.reconnectWait > 64) {
          this.reconnectWait = 64;
        }
        break;
      default:
        this.socket.close();
        this.next.prev = this.prev;
        this.prev.next = this.next;
        this.next = null;
        this.prev = null;
        if (this.address !== null) {
          this.state = STATE_CONNECTING;
          this.reconnectWait = 1;
          this.reconnect();
        } else {
          //do nothing?
        }
        break;
    }
  }

  onConnection(weInitiated) {
    console.log(`${this.logName} connected, initiated: ${weInitiated}`);

    if (weInitiated) {
      this.state = STATE_WAITING;
    } else {
      this.state = STATE_READY;
    }
    this.prev = this.parent.connected;
    this.next = this.parent.connected.next;
    this.next.prev = this;
    this.prev.next = this;

    this.queue = {
      sub: {
        txs: this.parent.txsCallback !== null
      },
      address: this.parent.myAddress
    };

    this.differing = 1;
    this.lastBlockHash = "";

    this.checkSend();
  }

  onQueueTimer() {
    this.queueTimer = null;
    this.checkSend();
  }

  handleChain(chain) {
    const validationRes = ChainUtil.validateObject(chain, chainValidation);
    if (!validationRes.result) {
      this.onError("Couldn't validate chain message: " + validationRes.reason);
      return false;
    }

    const ourChain = this.parent.blockchain.blocks();

    if (chain.start > ourChain.length) {
      this.onError("Recved start that's out of bounds of our current chain");
      return false;
    }

    if (this.differing < chain.start) {
      return true;
    } else if (chain.start < this.differing) {
      this.differing = chain.start;
    }

    if (chain.start + chain.blocks.length <= ourChain.length) {
      for (let i = 0; i < chain.blocks.length; i++) {
        const newBlock = chain.blocks[i];
        const oldBlock = ourChain[chain.start + i];
        if (newBlock.hash !== oldBlock.hash) {
          this.differing = chain.start + i;
          return true;
        }
      }
      this.differing = chain.start + chain.blocks.length;
      return true;
    }

    const newBlocks = ourChain.slice(0, chain.start).concat(chain.blocks);

    this.parent.updatingConnection = this;
    const replaceRes = this.parent.blockchain.replaceChain(newBlocks);
    this.parent.updatingConnection = null;

    if (replaceRes.result === true) {
      this.differing = newBlocks.length;
    }

    return true;
  }

  handleTxs(txs) {
    console.log("Recved msg with txs:");
    const validationRes = ChainUtil.validateObject(txs, txsValidation);
    if (!validationRes.result) {
      this.onError("Couldn't validate txs message: " + validationRes.reason);
      return false;
    }

    for (const type of Transaction.ALL_TYPES) {
      const key = type.name();
      if (key in txs) {
        console.log(`${key} txs found`);
        for (const tx of txs[key]) {
          if (!this.parent.txsSeen.has(type.hashToSign(tx))) {
            const newTx = new Transaction(tx, type);

            this.parent.updatingConnection = this;
            this.parent.sendTx(newTx);
            this.parent.updatingConnection = null;

            if (this.parent.txsCallback !== null) {
              this.parent.txsCallback(newTx);
            }
          }
        }
      }
    }
    return true;
  }

  onMessage(event) {
    if (this.state !== STATE_WAITING || this.socket.bufferedAmount !== 0) {
      //how did we recv, if we haven't finished sending?
      //our partner isn't waiting for a recv before sending, error
      this.onError("Partner isn't following simplex protocol");
      return;
    }

    this.state = STATE_READY;

    let recved = null;
    try {
      recved = JSON.parse(event.data);
    } catch (ex) {
      this.onError("Bad message, not a json object: " + ex.message);
      return;
    }

    if ("sub" in recved) {
      if ("txs" in recved.sub) {
        this.sub.txs = recved.sub.txs === true;
        console.log(`${this.logName} set sub to txs to ${this.sub.txs}`);
      }
    }

    if ("chain" in recved) {
      if (!this.handleChain(recved.chain)) {
        return;
      }
    }

    if (this.parent.txsCallback !== null && "txs" in recved) {
      if (!this.handleTxs(recved.txs)) {
        return;
      }
    }

    this.checkSend();
  }

  newChain(oldBlocks, blocks, difference) {
    if (difference < this.differing) {
      this.differing = difference;
    }

    this.checkSend();
  }

  sendTx(transaction) {
    if (!this.sub.txs) {
      return;
    }

    if (this.queue === null) {
      this.queue = {};
    }

    if (!("txs" in this.queue)) {
      this.queue.txs = {};
    }

    const key = transaction.type.name();

    if (!(key in this.queue.txs)) {
      this.queue.txs[key] = [];
    }
    this.queue.txs[key].push(transaction.transaction);

    this.checkSend();
  }

  setTimer() {
    if (this.queueTimer !== null) {
      return;
    } else {
      this.queueTimer = setTimeout(() => {
        this.onQueueTimer();
      }, 1000);
    }
  }

  checkSend() {
    if (this.state !== STATE_READY) {
      return;
    }

    const blocks = this.parent.blockchain.blocks();

    const lastBlock = blocks[blocks.length - 1];

    if ((this.differing < blocks.length && this.lastBlockHash !== lastBlock.hash) || this.queue !== null) {
      if (this.queue === null) {
        this.queue = {};
      }

      this.queue.chain = {
        start: this.differing,
        blocks: blocks.slice(this.differing)
      };

      this.differing = blocks.length;
      this.lastBlockHash = lastBlock.hash;
    }

    if (this.queue === null) {
      this.setTimer();
      //set queue to force a send the next time we check (either naturally or due to timer)
      this.queue = {};
      return;
    }

    const sending = JSON.stringify(this.queue);
    this.socket.send(sending);

    this.state = STATE_WAITING;
    this.queue = null;
  }
}

function updateBlocksImpl(server, newBlocks, oldBlocks, difference) {
  if (server.updatingConnection !== null) {
    server.updatingConnection.blockIndex = newBlocks.length;
  }

  for (var connection = server.connected.next; connection !== server.connected; connection = connection.next) {
    if (connection === server.updatingConnection) {
      continue;
    }
    connection.newChain(oldBlocks, newBlocks, difference);
  }
}

//this acts as a publisher, and subscriber
class PropServer {
  constructor(logName, blockchain, txsCallback) {
    this.logName = logName;
    this.peerState = new Map();
    this.connected = {
      next: null,
      prev: null
    };
    this.connected.next = this.connected;
    this.connected.prev = this.connected;
    this.blockchain = blockchain;
    this.blockchain.addListener((newBlocks, oldBlocks, difference) => {
      updateBlocksImpl(this, newBlocks, oldBlocks, difference);
    });
    this.txsSeen = new Set();
    this.port = null;
    this.myAddress = null;
    this.server = null;
    this.connectionCounter = 0;
    if (typeof txsCallback === "undefined") {
      this.txsCallback = null;
    } else {
      this.txsCallback = txsCallback;
    }
    this.updatingConnection = null;
  }

  start(port, myAddress, peers) {
    if (this.port !== null) {
      console.log(`Couldn't start BlockchainPub '${this.logName}', already started`);
      return;
    }

    this.port = port;
    this.myAddress = myAddress;
    for (const peer of peers) {
      if (!this.peerState.has(peer)) {
        this.peerState.set(peer, PEER_OK);

        const connection = new Connection(this);
        connection.connect(peer);
      }
    }

    this.server = new Websocket.Server({ port: port });
    this.server.on('connection', socket => {
      const connection = new Connection(this);
      connection.accepted(socket);
    });
  }

  sendTx(transaction) {
    const hash = transaction.type.hashToSign(transaction.transaction);

    if (this.txsSeen.has(hash)) {
      return;
    }
    this.txsSeen.add(hash);

    for (let connection = this.connected.next; connection !== this.connected; connection = connection.next) {
      if (connection === this.updatingConnection) {
        continue;
      }
      connection.sendTx(transaction);
    }
  }
}

module.exports = PropServer;