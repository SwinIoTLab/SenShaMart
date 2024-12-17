/**
 *    Copyright (c) 2022-2024, SenShaMart
 *
 *    This file is part of SenShaMart.
 *
 *    SenShaMart is free software: you can redistribute it and/or modify
 *    it under the terms of the GNU Lesser General Public License.
 *
 *    SenShaMart is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Lesser General Public License for more details.
 *
 *    You should have received a copy of the GNU Lesser General Public License
 *    along with SenShaMart.  If not, see <http://www.gnu.org/licenses/>.
 **/

/**
 * @author Anas Dawod e-mail: adawod@swin.edu.au
           Josip Milovac
 */
import { ChainUtil, isFailure } from '../util/chain-util.js';
import Block from '../blockchain/block.js';
import { type AnyTransaction, type Transaction, type TransactionClass } from '../blockchain/transaction_base.js';
import { ALL_TYPES } from '../blockchain/transaction_wrapper.js';
import BrokerRegistration from '../blockchain/broker-registration.js';
import SensorRegistration from '../blockchain/sensor-registration.js';
import Integration from '../blockchain/integration.js';
import Payment from '../blockchain/payment.js';
import Commit from '../blockchain/commit.js';
//import Transaction from '../blockchain/transaction_base.mjs';
import { MINE_RATE } from '../util/constants.js';
import Blockchain, { type UpdaterChanges, MAX_BLOCKS_IN_MEMORY } from '../blockchain/blockchain.js';

const MAX_BLOCKS_SENDING = MAX_BLOCKS_IN_MEMORY / 2;

//A bad approximation of the ws interface, to allow for different transports
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

const SEND_WAIT = MINE_RATE / 2;
const RECV_WAIT = Math.max(5 * 60 * 1000, 10 * SEND_WAIT);

//used for debugging to convert states to strings
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

//Peer states were to allow for connections to be marked dead, this wasn't used. We instead currently use very long retry intervals.
//This is still here in case we want to use it in the future again.

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
  Commit: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(Commit.verify)),
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


//a connection to a peer
class Connection implements ConnectionListNode{
  parent: PropServer; //the server we belong to
  address: string | null; //where we're connected to, if we know
  socket: Socket | null; //the socket this connection is using
  state: Connection_state; //the state

  reconnectWait: number; //how long to wait until our next reconnect

  prev: ConnectionListNode; //prev connection in the linked list
  next: ConnectionListNode; //next connection in the linked list

  differing: number; //where our two blockchains differ
  lastBlockHash: string; //hash of the last block we've sent

  queue: ConnectionQueue; //what we're waiting to send
  timer: NodeJS.Timeout | null; //timer for reconnection/send pooling
  sub: {
    txs: boolean //are we subscribed to transactions. Miners care, other clients may not
  };

  logName: string; //name to prefix to console prints
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

  //When this connection was started via acceptance
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

  //Start this connection via connection
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

  //TODO:
  retryDead(_address: string) {
    //We currently don't 'dead' connections, we just retry with really long wait indefinitely
  }

  //when the connection misbehaves
  onError(message: string) {
    console.error(this.logName + " ERROR: " + message);

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

  //on successful connection
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

  //when the timer says we should send now
  onSendTimer() {
    this.timer = null;
    this.send();
  }
  //when the timer says we should have recved by now
  onRecvTimer() {
    this.timer = null;
    this.onError("Recv timeout");
  }

  //handle a new chain from our peer
  handleChain(chain: SendingChain) {
    console.log(`${this.logName}: handleChain, this.differing: ${this.differing}, our startI: ${this.parent.blockchain.getCachedStartIndex()}, our length: ${this.parent.blockchain.links.length}, their start: ${chain.start}, their length ${chain.blocks.length}`);
    const validationRes = ChainUtil.validateObject(chain, chainValidation);
    if (isFailure(validationRes)) {
      //console.log(JSON.stringify(chain));
      this.onError("Couldn't validate chain message: " + validationRes.reason);
      return false;
    }

    const ourChain = this.parent.blockchain.getCachedBlocks();

    if (chain.start < this.parent.blockchain.getCachedStartIndex()) {
      this.onError(`Recved start that's out of bounds of our current cached chain. start: ${chain.start}, ourStart: ${this.parent.blockchain.getCachedStartIndex()}`);
      return false;
    }

    if (chain.start < this.differing) {
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
      this.parent.blockchain.replaceChain(chain.blocks, chain.start).then(() => {
        this.differing = this.parent.blockchain.length();
        if (this.state === CONNECTION_STATE.WAITING_FOR_BLOCKCHAIN) {
          this.state = CONNECTION_STATE.READY;
          if (this.timer === null) {
            this.send();
          }
        }
      }).catch((err: Error) => {
        this.onError(err.message);
      });
    }

    return true;
  }

  //handle new txs from our peer
  handleTxs(txs: SendingTransactions) {
    console.log("Recved msg with txs:");
    const validationRes = ChainUtil.validateObject(txs, txsValidation);
    if (isFailure(validationRes)) {
      this.onError("Couldn't validate txs message: " + validationRes.reason);
      return false;
    }

    for (const type of ALL_TYPES) {
      const key = type.txName();
      if (Object.hasOwn(txs, key)) {
        console.log(`${key} txs found`);
        for (const tx of txs[key]) {
          if (!this.parent.txsSeen.has(ChainUtil.hash((type as TransactionClass<Transaction>).toHash(tx)))) {
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

  //handle a new message from our peer
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

  //whenever our own chain changes, we need to check if the point at which we differ with our peer has changed
  newChain(_newBlocks: Block[], _changes: UpdaterChanges, difference: number) {
    if (difference < this.differing) {
      this.differing = difference;
    }
  }

  //send a tx
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

  //set timer to send
  setSendTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    } 

    this.timer = setTimeout(() => {
      this.onSendTimer();
    }, SEND_WAIT);
  }
  //set timer to recv
  setRecvTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.onRecvTimer();
    }, RECV_WAIT);
  }

  //send our message if we are in a state to
  send() {
    if (this.state !== CONNECTION_STATE.READY) {
      return;
    }

    const cachedBlocks = this.parent.blockchain.getCachedBlocks();

    const slicing = Math.max(cachedBlocks.blocks.length - MAX_BLOCKS_SENDING, 0);

    cachedBlocks.start += slicing;
    cachedBlocks.blocks = cachedBlocks.blocks.slice(slicing);

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

//handler for blockchain change events
function updateBlocksImpl(server: PropServer, newBlocks: Block[], changes: UpdaterChanges, difference: number) {
  for (let connection = server.connected.next; connection !== server.connected; connection = connection.next) {
    (connection as Connection).newChain(newBlocks, changes, difference);
  }
}

//this acts as a publisher, and subscriber
class PropServer {
  logName: string; //prefix for console prints
  blockchain: Blockchain; //the blockchain we are propagating
  peerState: Map<string, Peer_state>; //the states of our peers
  connected: { //an empty node to act as a head for a linked list of connections
    next: ConnectionListNode;
    prev: ConnectionListNode;
  };
  txsSeen: Set<string>; //the txs we've seen, so we don't resend them
  port: number | null; //what port are we listening on
  myAddress: string | null; //what is our address (if we know)
  server: Listener | null; //the listening socket
  connectionCounter: number; //number of connections we've had, used for IDing
  txsCallback: null | ((tx: AnyTransaction) => void); //callback for new transactions
  //the following allows for plugging different transports in
  socketConstructor: SocketConstructor; //to construct sockets with
  listenerConstructor: ListenerConstructor; //to construct listeners with

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

  //start the propagation server, on a port, with optional address and peers to start to connection to
  start(port: number, myAddress: string | null, peers: string[]) {
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
      this.server = new this.listenerConstructor({ port: port });
      this.server.on('connection', socket => {
        const connection = new Connection(this);
        connection.accepted(socket);
      });
    }
  }

  //connect to a new peer
  connect(peer: string) {
    if (!this.peerState.has(peer)) {
      this.peerState.set(peer, PEER_STATE.OK);

      const connection = new Connection(this);
      connection.connect(peer);
    }
  }

  //add a tx to be sent to peers
  sendTx(transaction: AnyTransaction) {
    const hash = ChainUtil.hash(transaction.type.toHash(transaction.tx));

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
