const Websocket = require('ws');
const Assert = require('assert');
const ChainUtil = require('../chain-util');
const Block = require('../blockchain/block');
const Blockchain = require('../blockchain/blockchain');

const STATE_INIT = 0;
const STATE_CONNECTING = 1;
const STATE_RUNNING = 2;

const PEER_OK = 0;
const PEER_DEAD = 1;

const chainValidation = {
  start: ChainUtil.createValidateIsIntegerWithMin(0),
  blocks: ChainUtil.createValidateArray(Block.validateIsBlock)
};

class Connection {
  constructor(parent) {
    this.parent = parent;
    this.address = null;
    this.socket = null;
    this.state = STATE_INIT;

    this.prev = null;
    this.next = null;

    this.blockIndex = null;

    this.queue = null;
    this.queueTimer = null;

    this.sub = {
      txs: false
    };

    this.logName = `${parent.logName}:${parent.connectionCounter}`;
    parent.connectionCounter++;
  }

  accepted(socket) {
    console.log(`${this.logName} accepted`);
    this.socket = socket;
    this.state = STATE_RUNNING;

    this.socket.on("error", () => {
      this.onError();
    });

    this.socket.on("open", () => {
      this.onConnection();
    });

    this.socket.on("message", (data) => {
      this.onMessage(data);
    });

    this.onConnection();
  }

  connect(address) {
    console.log(`${this.logName} connecting`);
    this.address = address;
    this.state = STATE_CONNECTING;

    this.reconnectWait = 1;
    this.socket = new Websocket(this.address);

    this.socket.on("error", () => {
      this.onError();
    });

    this.socket.on("open", () => {
      this.onConnection();
    });

    this.socket.on("message", (data) => {
      this.onMessage(data);
    });
  }

  retryDead(address) {

  }

  onError() {
    switch (this.state) {
      case STATE_CONNECTING:
        //this.reconnectWait seconds + random [0,1000] ms
        setTimeout(() => this.socket = new Websocket(this.address),
          1000 * this.reconnectWait + Math.floor(Math.random() * 1000));
        this.reconnectWait *= 2;
        if (this.reconnectWait > 64) {
          this.reconnectWait = 64;
        }
        break;
      case STATE_RUNNING:
        this.socket.close();
        this.next.prev = this.prev;
        this.prev.next = this.next;
        this.next = null;
        this.prev = null;
        if (this.address !== null) {
          this.state = STATE_CONNECTING;
          this.reconnectWait = 1;
          this.socket = new Websocket(this.address);
        } else {
          //do nothing?
        }
        break;
    }
  }

  onConnection() {
    this.state = STATE_RUNNING;

    this.prev = this.parent.connected;
    this.next = this.parent.connected.next;
    this.next.prev = this;
    this.prev.next = this;

    const sending = {
      sub: {
        txs: this.parent.subTxs
      },
      address: this.parent.myAddress
    };

    const blocks = this.parent.blockchain.blocks();

    if (blocks.length > 1) {
      sending.chain = {
        blocks: blocks.slice(1),
        start: 1
      }
    }

    this.socket.send(JSON.stringify(sending));

    this.blockIndex = blocks.length;
  }

  onQueueTimer() {
    this.queueTimer = null;
    if (this.state !== STATE_RUNNING) {
      return;
    }

    this.checkSend();

    // we don't retimer as we wait for external to send
  }

  onMessage(event) {
    var recved = null;
    try {
      recved = JSON.parse(event);
    } catch (ex) {
      console.log(`Bad message on ${this.logName}, not a json object`);
      this.onError();
      return;
    }

    if ("chain" in recved) {
      const validationRes = ChainUtil.validateObject(recved.chain, chainValidation);
      if (!validationRes.result) {
        console.log(`${this.logName} couldn't validate chain message: ${validationRes.reason}`);
        this.onError();
        return;
      }

      console.log(`${this.logName} recved chain with start: ${recved.chain.start}`);

      var newBlocks = this.parent.blockchain.blocks().slice(0, recved.chain.start + 1);
      newBlocks = newBlocks.concat(recved.chain.blocks);

      this.parent.updatingConnection = this;
      this.parent.blockchain.replaceChain(newBlocks);
      this.parent.updatingConnection = null;
    }
  }

  sendChain(oldBlocks, blocks) {
    if (this.queue === null) {
      this.queue = {};
    }

    var startIndex = this.blockIndex - 1;

    while (oldBlocks[startIndex].hash !== blocks[startIndex].hash) {
      startIndex--;
    }

    this.queue.chain = {
      blocks: blocks.slice(startIndex + 1),
      start: startIndex + 1
    };

    this.checkSend();
  }

  checkSend() {
    if (this.queue === null) {
      return;
    }

    if (this.socket.bufferedAmount === 0) {
      this.socket.send(JSON.stringify(this.queue));

      if ("chain" in this.queue) {
        this.blockIndex = this.queue.chain.start + this.queue.chain.blocks.length;
      }

      this.queue = null;
    } else if (this.queueTimer === null) {
      this.queueTimer = setTimeout(this.onQueueTimer, 1000);
    }
  }
}

function updateBlocksImpl(server, newBlocks, oldBlocks) {
  if (server.updatingConnection !== null) {
    server.updatingConnection.blockIndex = blocks.length;
  }

  for (var connection = server.connected.next; connection !== server.connected; connection = connection.next) {
    if (connection === server.updatingConnection) {
      continue;
    }
    connection.sendChain(oldBlocks, newBlocks);
  }
}

//this acts as a publisher, and subscriber
class PropServer {
  constructor(logName, subTxs, blockchain) {
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
      updateBlocksImpl(this, newBlocks, oldBlocks);
    });
    this.port = null;
    this.myAddress = null;
    this.server = null;
    this.connectionCounter = 0;
    this.subTxs = subTxs;
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
}

module.exports = PropServer;