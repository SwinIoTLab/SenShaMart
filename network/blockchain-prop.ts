import { ChainUtil, isFailure } from '../util/chain-util.js';
import Block from '../blockchain/block.js';
import { type AnyTransaction, type Transaction, type TransactionClass } from '../blockchain/transaction_base.js';
import { ALL_TYPES } from '../blockchain/transaction_wrapper.js';
import BrokerRegistration from '../blockchain/broker-registration.js';
import SensorRegistration from '../blockchain/sensor-registration.js';
import Integration from '../blockchain/integration.js';
import Payment from '../blockchain/payment.js';
import Compensation from '../blockchain/compensation.js';
//import Transaction from '../blockchain/transaction_base.mjs';
import Blockchain, { type UpdaterChanges } from '../blockchain/blockchain.js';

interface SocketEvent {
  type: string;
  target: Socket;
}

interface SocketErrorEvent extends SocketEvent {
  error: unknown;
  message: string;
  type: string;
  target: Socket;
}

interface SocketCloseEvent extends SocketEvent {
  wasClean: boolean;
  code: number;
  reason: string;
  type: string;
  target: Socket;
}

type SocketData = string | Buffer | ArrayBuffer | Buffer[];

interface SocketMessageEvent {
  data: SocketData;
  type: string;
  target: Socket;
}

interface Socket {
  readonly bufferedAmount: number;
  addEventListener(method: "error", listener: (event: SocketErrorEvent) => void): this;
  addEventListener(method: "message", listener: (event: SocketMessageEvent) => void): this;
  addEventListener(method: "open", cb: (event: SocketEvent) => void): void;
  addEventListener(method: "close", cb: (event: SocketCloseEvent) => void): void;
  send(data: string): void;
  close(): void;
}
interface Listener {
  on(event: "connection", cb: (this: Listener, socket: Socket) => void): this;
}
interface ListenerConstructor {
  new(options: object): Listener;
}
interface SocketConstructor {
  new(address:string): Socket;
}

const CONNECTION_STATE = {
  INIT: 0,
  CONNECTING: 1,
  WAITING_FOR_PEER: 2,
  READY: 3,
  WAITING_FOR_BLOCKCHAIN: 4
} as const;

type Connection_state = typeof CONNECTION_STATE[keyof typeof CONNECTION_STATE];

const SEND_WAIT = 1000;
const RECV_WAIT = 10 * SEND_WAIT;

function _state_to_string(state: Connection_state): string {
  switch (state) {
    case CONNECTION_STATE.INIT: return "INIT";
    case CONNECTION_STATE.CONNECTING: return "CONNECTING";
    case CONNECTION_STATE.WAITING_FOR_PEER: return "WAITING_FOR_PEER";
    case CONNECTION_STATE.READY: return "READY";
    case CONNECTION_STATE.WAITING_FOR_BLOCKCHAIN: return "WAITING_FOR_BLOCKCHAIN";
    default: throw new Error(`Unknown state: ${state}`);
  }
}
const PEER_STATE = {
  OK: 0,
  DEAD : 1
} as const;

type Peer_state = typeof PEER_STATE[keyof typeof PEER_STATE];

const chainValidation = {
  start: ChainUtil.createValidateIsIntegerWithMin(0),
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

interface ConnectionListNode {
  prev: ConnectionListNode;
  next: ConnectionListNode;
}

type SendingChain = {
  start: number;
  blocks: Block[];
};
type SendingTransactions = {
  [index: string]: Transaction[];
};

interface ConnectionQueue {
  txs?: SendingTransactions;
  chain?: SendingChain;
  sub?: {
    txs: boolean;
  };
  address?: string;
}

class Connection implements ConnectionListNode{
  parent: PropServer;
  address: string | null;
  socket: Socket | null;
  state: Connection_state;

  reconnectWait: number;

  prev: ConnectionListNode;
  next: ConnectionListNode;

  differing: number;
  lastBlockHash: string;

  queue: ConnectionQueue;
  timer: NodeJS.Timeout | null;
  sub: {
    txs: boolean
  };

  logName: string;
  constructor(parent: PropServer) {
    this.parent = parent;
    this.address = null;
    this.socket = null;
    this.state = CONNECTION_STATE.INIT;

    this.reconnectWait = 0;

    this.prev = null;
    this.next = null;

    this.differing = null;
    this.lastBlockHash = "";

    this.queue = null;
    this.timer = null;

    this.sub = {
      txs: false
    };

    this.logName = `${parent.logName}:${parent.connectionCounter}`;
    parent.connectionCounter++;
  }

  accepted(socket: Socket) {
    this.socket = socket;

    this.socket.addEventListener("error", (err) => {
      this.onError("Error event: " + err.message);
    });


    this.socket.addEventListener("message", (data) => {
      this.onMessage(data);
    });

    this.onConnection(false);
  }

  connect(address: string) {
    this.address = address;
    this.state = CONNECTION_STATE.CONNECTING;

    this.reconnectWait = 1;
    this.reconnect();
  }

  reconnect() {
    console.log(`${this.logName} connecting`);
    this.socket = new this.parent.socketConstructor(this.address);
    this.socket.addEventListener("error", (err) => {
      this.onError("Error event: " + err.message);
    });

    this.socket.addEventListener("open", () => {
      this.onConnection(true);
    });

    this.socket.addEventListener("message", (data) => {
      this.onMessage(data);
    });
  }

  retryDead(_address: string) {

  }

  onError(message: string) {
    console.log(this.logName + ": " + message);

    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    } 

    switch (this.state) {
      case CONNECTION_STATE.CONNECTING:
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
        if (this.next !== null && this.prev !== null) {
          this.next.prev = this.prev;
          this.prev.next = this.next;
        }
        this.next = null;
        this.prev = null;
        if (this.address !== null) {
          this.state = CONNECTION_STATE.CONNECTING;
          this.reconnectWait = 1;
          this.reconnect();
        } else {
          //do nothing?
        }
        break;
    }
  }

  onConnection(weInitiated: boolean) {
    console.log(`${this.logName} connected, initiated: ${weInitiated}`);

    if (weInitiated) {
      this.state = CONNECTION_STATE.WAITING_FOR_PEER;
    } else {
      this.state = CONNECTION_STATE.READY;
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

    this.differing = 0;
    this.lastBlockHash = "";

    this.send();
  }

  onSendTimer() {
    this.timer = null;
    this.send();
  }
  onRecvTimer() {
    this.timer = null;
    this.onError("Recv timeout");
  }

  handleChain(chain: SendingChain) {
    console.log(`${this.logName}: handleChain, this.differing: ${this.differing}, our startI: ${this.parent.blockchain.getCachedStartIndex()}, our length: ${this.parent.blockchain.links.length}, their start: ${chain.start}, their length ${chain.blocks.length}`);
    const validationRes = ChainUtil.validateObject(chain, chainValidation);
    if (isFailure(validationRes)) {
      console.log(JSON.stringify(chain));
      this.onError("Couldn't validate chain message: " + validationRes.reason);
      return false;
    }

    const ourChain = this.parent.blockchain.getCachedBlocks();

    if (chain.start < this.parent.blockchain.getCachedStartIndex()) {
      this.onError(`Recved start that's out of bounds of our current cached chain. start: ${chain.start}, ourStart: ${this.parent.blockchain.getCachedStartIndex()}`);
      return false;
    }

    if (this.differing < chain.start) {
      return true;
    } else if (chain.start < this.differing) {
      this.differing = chain.start;
    }

    if (chain.start + chain.blocks.length <= ourChain.blocks.length) {
      for (let i = 0; i < chain.blocks.length; i++) {
        const newBlock = chain.blocks[i];
        const oldBlock = ourChain.blocks[chain.start + i];
        if (newBlock.hash !== oldBlock.hash) {
          this.differing = chain.start + i;
          return true;
        }
      }
      this.differing = chain.start + chain.blocks.length;
      return true;
    }
    if (chain.blocks.length !== 0) {
      this.state = CONNECTION_STATE.WAITING_FOR_BLOCKCHAIN;
      this.parent.blockchain.replaceChain(chain.blocks, chain.start, (err) => {
        console.log(err.result);
        if (isFailure(err)) {
          if (err.code !== Blockchain.ERROR_REPLACEHCHAIN.SHORTER) {
            this.onError(err.reason); return;
          }
        } else {
          this.differing = this.parent.blockchain.length();
        }
        if (this.state === CONNECTION_STATE.WAITING_FOR_BLOCKCHAIN) {
          this.state = CONNECTION_STATE.READY;
        }
      });
    }

    return true;
  }

  handleTxs(txs: SendingTransactions) {
    console.log("Recved msg with txs:");
    const validationRes = ChainUtil.validateObject(txs, txsValidation);
    if (isFailure(validationRes)) {
      this.onError("Couldn't validate txs message: " + validationRes.reason);
      return false;
    }

    for (const type of ALL_TYPES) {
      const key = type.txName();
      if (key in txs) {
        console.log(`${key} txs found`);
        for (const tx of txs[key]) {
          if (!this.parent.txsSeen.has((type as TransactionClass<Transaction>).hashToSign(tx))) {
            const newTx: AnyTransaction = {
              tx: tx,
              type: type
            };

            //don't gossip txs atm
            //this.parent.sendTx(newTx);

            if (this.parent.txsCallback !== null) {
              this.parent.txsCallback(newTx);
            }
          }
        }
      }
    }
    return true;
  }

  onMessage(event: SocketMessageEvent) {
    if (this.state !== CONNECTION_STATE.WAITING_FOR_PEER || this.socket.bufferedAmount !== 0) {
      //how did we recv, if we haven't finished sending?
      //our partner isn't waiting for a recv before sending, error
      this.onError("Partner isn't following simplex protocol");
      return;
    }

    this.state = CONNECTION_STATE.READY;

    this.setSendTimer();

    let recved = null;
    try {
      recved = JSON.parse(event.data as string);
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

  }

  newChain(_newBlocks: Block[], _changes: UpdaterChanges, difference: number) {
    if (difference < this.differing) {
      console.log(`${this.logName}: Adjusting difference from ${this.differing} to ${difference}`);
      this.differing = difference;
    } else {
      console.log(`${this.logName}: Didn't adjust difference from ${this.differing} to ${difference}`);
    }
  }

  sendTx(transaction: AnyTransaction) {
    if (!this.sub.txs) {
      return;
    }

    if (this.queue === null) {
      this.queue = {};
    }

    if (!("txs" in this.queue)) {
      this.queue.txs = {};
    }

    const key = transaction.type.txName();

    if (!(key in this.queue.txs)) {
      this.queue.txs[key] = [];
    }
    this.queue.txs[key].push(transaction.tx);
  }

  setSendTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    } 

    this.timer = setTimeout(() => {
      this.onSendTimer();
    }, SEND_WAIT);
  }
  setRecvTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.onRecvTimer();
    }, RECV_WAIT);
  }

  send() {
    if (this.state !== CONNECTION_STATE.READY) {
      return;
    }

    const cachedBlocks = this.parent.blockchain.getCachedBlocks();
    let lastBlock = null;
    if (cachedBlocks.blocks.length === 0) {
      lastBlock = Block.genesis();
    } else {
      lastBlock = cachedBlocks.blocks[cachedBlocks.blocks.length - 1];
    }
    if ((this.differing < cachedBlocks.start + cachedBlocks.blocks.length && this.lastBlockHash !== lastBlock.hash) || this.queue !== null) {
      if (this.queue === null) {
        this.queue = {};
      }

      const starting = Math.max(this.differing, cachedBlocks.start);

      this.queue.chain = {
        start: starting,
        blocks: cachedBlocks.blocks.slice(starting - cachedBlocks.start)
      };

      this.differing = cachedBlocks.start + cachedBlocks.blocks.length;
      this.lastBlockHash = lastBlock.hash;
    }

    if (this.queue === null) {
      this.queue = {};
    }
    const sending = JSON.stringify(this.queue);
    this.socket.send(sending);
    this.setRecvTimer();

    this.state = CONNECTION_STATE.WAITING_FOR_PEER;
    this.queue = null;
  }
}

function updateBlocksImpl(server: PropServer, newBlocks: Block[], changes: UpdaterChanges, difference: number) {
  for (let connection = server.connected.next; connection !== server.connected; connection = connection.next) {
    (connection as Connection).newChain(newBlocks, changes, difference);
  }
}

//this acts as a publisher, and subscriber
class PropServer {
  logName: string;
  blockchain: Blockchain;
  peerState: Map<string, Peer_state>;
  connected: {
    next: ConnectionListNode;
    prev: ConnectionListNode;
  };
  txsSeen: Set<string>;
  port: number | null;
  myAddress: string | null;
  server: Listener | null;
  connectionCounter: number;
  txsCallback: null | ((tx: AnyTransaction) => void);
  socketConstructor: SocketConstructor;
  listenerConstructor: ListenerConstructor;

  constructor(logName: string, blockchain: Blockchain, socketConstructor: SocketConstructor, listenerConstructor: ListenerConstructor, txsCallback?: (tx: AnyTransaction) => void) {
    this.logName = logName;
    this.peerState = new Map<string, Peer_state>();
    this.connected = {
      next: null,
      prev: null
    };
    this.connected.next = this.connected;
    this.connected.prev = this.connected;
    this.blockchain = blockchain;
    this.blockchain.addListener((newBlocks: Block[], changes: UpdaterChanges, difference: number) => {
      updateBlocksImpl(this, newBlocks, changes, difference);
    });
    this.txsSeen = new Set<string>();
    this.port = null;
    this.myAddress = null;
    this.server = null;
    this.connectionCounter = 0;
    if (typeof txsCallback === "undefined") {
      this.txsCallback = null;
    } else {
      this.txsCallback = txsCallback;
    }
    this.socketConstructor = socketConstructor;
    this.listenerConstructor = listenerConstructor;
  }

  start(port: number, myAddress: string, peers: string[]) {
    if (this.port !== null) {
      console.log(`Couldn't start BlockchainPub '${this.logName}', already started`);
      return;
    }

    this.port = port;
    this.myAddress = myAddress;
    for (const peer of peers) {
      this.connect(peer);
    }

    if (port !== null && this.listenerConstructor !== null) {
      console.log
      this.server = new this.listenerConstructor({ port: port });
      this.server.on('connection', socket => {
        const connection = new Connection(this);
        connection.accepted(socket);
      });
    }
  }

  connect(peer: string) {
    if (!this.peerState.has(peer)) {
      this.peerState.set(peer, PEER_STATE.OK);

      const connection = new Connection(this);
      connection.connect(peer);
    }
  }

  sendTx(transaction: AnyTransaction) {
    const hash = transaction.type.hashToSign(transaction.tx);

    if (this.txsSeen.has(hash)) {
      return;
    }
    this.txsSeen.add(hash);

    for (let connection = this.connected.next; connection !== this.connected; connection = connection.next) {
      (connection as Connection).sendTx(transaction);
    }
  }
}

export { PropServer, type SocketConstructor, type ListenerConstructor };
export default PropServer;