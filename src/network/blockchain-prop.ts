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
import { ChainUtil, isFailure, type ResultFailure } from '../util/chain-util.js';
import Block from '../blockchain/block.js';
import { type AnyTransaction, type Transaction, type TransactionClass } from '../blockchain/transaction_base.js';
import BrokerRegistration from '../blockchain/broker-registration.js';
import SensorRegistration from '../blockchain/sensor-registration.js';
import Integration from '../blockchain/integration.js';
import Payment from '../blockchain/payment.js';
import Commit from '../blockchain/commit.js';
//import Transaction from '../blockchain/transaction_base.mjs';
import { MINE_RATE } from '../util/constants.js';
import Blockchain, { type Listener as BlockchainListener } from '../blockchain/blockchain.js';
import assert from 'node:assert/strict';

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
  addEventListener(method: "error", listener: (this: Socket, event: SocketErrorEvent) => void): void;
  addEventListener(method: "message", listener: (this: Socket, event: SocketMessageEvent) => void): void;
  addEventListener(method: "open", cb: (this: Socket, event: SocketEvent) => void): void;
  addEventListener(method: "close", cb: (this: Socket, event: SocketCloseEvent) => void): void;
  send(data: string): void;
  close(): void;
}
interface Listener {
  on(event: "connection", cb: (this: Listener, socket: Socket) => void): this;
  close(cb: (err?: Error) => void): void;
}

interface SocketProvider {
  connect(address: string): Socket;
  listen(port: number): Listener;
}

enum CONNECTION_STATE {
  INIT,
  CONNECTING,
  HANDSHAKING,
  WAITING_FOR_PEER,
  READY,
  WORKING_WRITE,
  WORKING_READ,
  DEAD,
  CLOSED
}

const MAX_BLOCKS_SENDING = 1000;
const PROTOCOL_VERSION = 1;
const SEND_WAIT_MAX = MINE_RATE / 2;
const RECV_WAIT = Math.max(5 * 60 * 1000, 10 * SEND_WAIT_MAX);

//used for debugging to convert states to strings
function stateToString(state: CONNECTION_STATE): string {
  switch (state) {
    case CONNECTION_STATE.INIT: return "INIT";
    case CONNECTION_STATE.CONNECTING: return "CONNECTING";
    case CONNECTION_STATE.WAITING_FOR_PEER: return "WAITING_FOR_PEER";
    case CONNECTION_STATE.HANDSHAKING: return "HANDSHAKING";
    case CONNECTION_STATE.READY: return "READY";
    case CONNECTION_STATE.WORKING_WRITE: return "WORKING_WRITE";
    case CONNECTION_STATE.WORKING_READ: return "WORKING_READ";
    case CONNECTION_STATE.DEAD: return "DEAD";
    case CONNECTION_STATE.CLOSED: return "CLOSED";
    default: throw new Error(`Unknown state: ${state}`);
  }
}

//Peer states were to allow for connections to be marked dead, this wasn't used. We instead currently use very long retry intervals.
//This is still here in case we want to use it in the future again.

enum PEER_STATE {
  OK,
  DEAD
}

type Handshake = {
  version: number;
  representative_hashes: string[];
  depth: number;
  sub_txs: boolean;
  address: string | null;
};

const validateHandshake = ChainUtil.createValidateObject<Handshake>({
  version: ChainUtil.validateIsInteger,
  representative_hashes: ChainUtil.createValidateArray(ChainUtil.validateIsString),
  depth: ChainUtil.createValidateIsIntegerWithMin(0),
  sub_txs: ChainUtil.validateBoolean,
  address: ChainUtil.createValidateIsEither(ChainUtil.validateIsString, ChainUtil.validateIsNull)
});

type SendingTransactions = {
  payment: Payment[],
  sensorRegistration: SensorRegistration[],
  brokerRegistration: BrokerRegistration[],
  integration: Integration[],
  commit: Commit[]
};

const validateSendingTransactions = ChainUtil.createValidateObject<SendingTransactions>({
  payment: ChainUtil.createValidateArray(Payment.verify),
  sensorRegistration: ChainUtil.createValidateArray(SensorRegistration.verify),
  brokerRegistration: ChainUtil.createValidateArray(BrokerRegistration.verify),
  integration: ChainUtil.createValidateArray(Integration.verify),
  commit: ChainUtil.createValidateArray(Commit.verify)
});

type DataMessage = {
  txs: SendingTransactions | null;
  blocks: Block[];
};

const validateDataMessage = ChainUtil.createValidateObject<DataMessage>({
  txs: ChainUtil.createValidateIsEither(validateSendingTransactions, ChainUtil.validateIsNull),
  blocks: ChainUtil.createValidateArray(Block.validate)
});


//a connection to a peer
class Connection {
  parent: PropServer; //the server we belong to
  address: string | null; //where we're connected to, if we know
  socket: Socket | null; //the socket this connection is using
  state: CONNECTION_STATE; //the state
  sentHandshake: boolean; //whether we've sent our handshake
  recvedHandshake: boolean; //whether we've recved our peers handshake
  initiated: boolean; //did we start this conenction

  reconnectWait: number; //how long to wait until our next reconnect

  differing: number; //where our two blockchains differ

  txQueue: SendingTransactions | null; //what we're waiting to send
  timer: NodeJS.Timeout | null; //timer for reconnection/send pooling
  subTx: boolean; //does our peer want txs

  lastRecvedHash: string;

  logName: string; //name to prefix to console prints
  constructor(parent: PropServer) {
    this.parent = parent;
    this.address = null;
    this.state = CONNECTION_STATE.INIT;
    this.sentHandshake = false;
    this.recvedHandshake = false;
    this.initiated = false;
    this.socket = null;

    this.reconnectWait = 0;

    this.differing = 0;

    this.txQueue = null;
    this.timer = null;

    this.subTx = false;
    this.lastRecvedHash = Block.genesis().hash;

    this.logName = `${parent.logName}:${parent.connectionCounter}`;
    parent.connectionCounter++;
    parent.connections.push(this);
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

    this.initiated = false;
    this.onConnection();
  }

  //Start this connection via connection
  connect(address: string) {
    this.address = address;
    this.state = CONNECTION_STATE.CONNECTING;

    this.reconnectWait = 1;
    this.reconnect();
  }

  reconnect() {
    assert(this.address!== null);
    //console.log(`${this.logName} connecting`);
    this.socket = this.parent.socketProvider.connect(this.address);
    this.socket.addEventListener("error", (err) => {
      this.onError("Error event: " + err.message);
    });

    this.socket.addEventListener("open", () => {
      this.initiated = true;
      this.onConnection();
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
        assert(this.socket !== null);
        this.socket.close();
        this.socket = null;
        this.state = CONNECTION_STATE.DEAD;
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
  onConnection() {
    assert(this.socket !== null);
    //console.log(`${this.logName} connected, initiated: ${this.initiated}`);
    this.sentHandshake = false;
    this.recvedHandshake = false;
    this.state = CONNECTION_STATE.HANDSHAKING;

    this.differing = 0;

    this.parent.blockchain.getRepresentativeHashes().then((hashes) => {
      if (this.socket === null) {
        return; //socket is now null, 'cancel' this promise
      }
      const handshake: Handshake = {
        version: PROTOCOL_VERSION,
        depth: this.parent.blockchain.length(),
        sub_txs: this.parent.txsCallback !== null,
        representative_hashes: hashes,
        address: this.parent.myAddress
      };

      this.socket.send(JSON.stringify(handshake));
      this.sentHandshake = true;
      if (this.recvedHandshake && this.state === CONNECTION_STATE.HANDSHAKING) {
        if (this.initiated) {
          //console.log(this.logName + ": Moving to WAITING_FOR_PEER after sending handshake");
          this.state = CONNECTION_STATE.WAITING_FOR_PEER;
        } else {
          this.state = CONNECTION_STATE.READY;
        }
        this.send();
      }
    });
  }

  //when the timer says we should send now
  onSendTimer() {
    this.timer = null;
    if (this.state === CONNECTION_STATE.READY) {
      this.send();
    }
  }
  //when the timer says we should have recved by now
  onRecvTimer() {
    this.timer = null;
    if (this.state === CONNECTION_STATE.WAITING_FOR_PEER) {
      this.onError("Recv timeout");
    }
  }

  //handle a new chain from our peer
  async handleChain(chain: Block[]): Promise<boolean> {
    assert(chain.length !== 0);

    for (let i = 1; i < chain.length; ++i) {
      if (chain[i - 1].hash !== chain[i].lastHash) {
        this.onError(`Recved new chain which was no contiguous. chain[${i - 1}].hash !== chain[${i}].lastHash`);
        return false;
      }
    }

    const depthStart = await this.parent.blockchain.getBlockByHash(chain[0].lastHash);

    if (depthStart === null) {
      this.onError(`${this.logName}: depthStart === null`);
      return false;
    }

    //console.log(`${this.logName}: handleChain, this.differing: ${this.differing}, their start: ${depthStart.depth}, their length ${chain.length}`);

    for (const block of chain) {
      this.lastRecvedHash = block.hash;
      const res = await this.parent.blockchain.addBlock(block);
      if (isFailure(res)) {
        this.onError("Failed to add block: " + res.reason);
        return false;
      }
      //if this block already existed on our head path, we can increase differing
    }
    return true;
  }

  handleTxArray(txArray: Transaction[], type: TransactionClass<Transaction>) {
    //console.log(`  ${txArray.length} ${type.txName()}`);
    for (const tx of txArray) {
      if (!this.parent.txsSeen.has(ChainUtil.hash(type.toHash(tx)))) {
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

  //handle new txs from our peer
  handleTxs(txs: SendingTransactions) {
    //console.log(this.logName + ": Recved msg with txs:");

    if (this.parent.txsCallback === null) {
      //we shouldn't be subbed, we shouldn't recv this
      this.onError("Recved txs although this.parent.txsCallback === null");
      return;
    }

    this.handleTxArray(txs.payment, Payment);
    this.handleTxArray(txs.sensorRegistration, SensorRegistration);
    this.handleTxArray(txs.brokerRegistration, BrokerRegistration);
    this.handleTxArray(txs.integration, Integration);
    this.handleTxArray(txs.commit, Commit);

    return true;
  }

  handleData(data: SocketData) {
    assert(this.socket !== null);

    if (this.socket.bufferedAmount !== 0) {
      this.onError(`Partner isn't following simplex protocol, this.socket.bufferedAmount=${this.socket.bufferedAmount}`);
      return;
    }

    this.state = CONNECTION_STATE.READY;
    this.setSendTimer();
    let recved: DataMessage | null = null;
    try {
      recved = JSON.parse(data as string);
    } catch (err) {
      if (err instanceof Error) {
        this.onError("Bad message, not a json parseable: " + err.message);
      } else {
        this.onError("Bad message, not json parseable, err was not of type Error");
      }
    }

    const fail: ResultFailure = { result: false, reason: "" };
    if (!validateDataMessage(recved, fail)) {
      this.onError("Couldn't validate data message: " + fail.reason);
      return;
    }

    if (recved.txs !== null) {
      this.handleTxs(recved.txs);
    }

    if (recved.blocks.length !== 0) {
      this.state = CONNECTION_STATE.WORKING_WRITE;
      const cachedSocket = this.socket;

      this.handleChain(recved.blocks).then((res) => {
        //console.log(`${this.logName}: handleChain res: ${res}, state: ${stateToString(this.state)}`);
        if (res && this.state === CONNECTION_STATE.WORKING_WRITE && this.socket === cachedSocket) {
          this.state = CONNECTION_STATE.READY;
          //if timer is null, send timer has expired while we were working, so we try and send straight away
          if (this.timer === null) {
            //console.log("Sending immedilately as send timer has expired");
            this.send();
          }
        }
      });
    }
  }

  async handleHandshake(data: SocketData) {
    if (this.recvedHandshake) {
      this.onError("Recved handshake twice");
      return;
    }
    this.recvedHandshake = true;

    let recved: Handshake | null = null;
    try {
      recved = JSON.parse(data as string);
    } catch (err) {
      if (err instanceof Error) {
        this.onError("Bad message, not a json parseable: " + err.message);
      } else {
        this.onError("Bad message, not json parseable, err was not of type Error");
      }
    }

    const fail: ResultFailure = { result: false, reason: "" };
    if (!validateHandshake(recved, fail)) {
      this.onError("Couldn't validate handshake message: " + fail.reason);
      return;
    }

    if (recved.version !== PROTOCOL_VERSION) {
      this.onError(`Invalid protocol version in handshake, expected ${PROTOCOL_VERSION}, but recved ${recved.version}`);
      return;
    }

    for (const hash of recved.representative_hashes) {
      const found = await this.parent.blockchain.getBlockOnMainPathByHash(hash);
      if (found !== null) {
        this.differing = found.depth;
        break;
      }
    }

    //do nothing with depth atm

    this.subTx = recved.sub_txs;

    //do nothing with address atm

    if (this.sentHandshake && this.state === CONNECTION_STATE.HANDSHAKING) {
      if (this.initiated) {
        //console.log(this.logName + ": Moving to WAITING_FOR_PEER after handling handshake");
        this.state = CONNECTION_STATE.WAITING_FOR_PEER;
      } else {
        this.state = CONNECTION_STATE.READY;
      }
      this.send();
    }
  }

  //handle a new message from our peer
  onMessage(event: SocketMessageEvent) {
    switch (this.state) {
      case CONNECTION_STATE.INIT:
      case CONNECTION_STATE.CONNECTING:
        this.onError(`In '${stateToString(this.state)}', we should not be recving messages`);
        return;
      case CONNECTION_STATE.WAITING_FOR_PEER:
        this.handleData(event.data);
        return;
      case CONNECTION_STATE.HANDSHAKING:
        this.handleHandshake(event.data);
        return;
      case CONNECTION_STATE.READY:
      case CONNECTION_STATE.WORKING_WRITE:
      case CONNECTION_STATE.WORKING_READ:
        this.onError(`Partner sin't following simplex protocol`);
        return;
      default:
        this.onError("In unknown state, can't recv message");
        return;
    }
  }

  //whenever our own chain changes, we need to check if the point at which we differ with our peer has changed
  newChain(newDepth: number, commonDepth: number) {
    if (commonDepth < this.differing) {
      this.differing = commonDepth;
    }
    if (this.lastRecvedHash === this.parent.blockchain.getHeadInfo().block.hash) {
      this.differing = newDepth;
    }
  }

  checkAndMakeTxQueue() {
    if (this.txQueue === null) {
      this.txQueue = {
        payment: [],
        sensorRegistration: [],
        brokerRegistration: [],
        integration: [],
        commit: []
      };
    }
  }

  sendPaymentTx(tx: Payment) {
    if (!this.subTx) {
      return;
    }

    this.checkAndMakeTxQueue();
    assert(this.txQueue !== null);

    this.txQueue.payment.push(tx);
  }
  sendSensorRegistrationTx(tx: SensorRegistration) {
    if (!this.subTx) {
      return;
    }

    this.checkAndMakeTxQueue();
    assert(this.txQueue !== null);

    this.txQueue.sensorRegistration.push(tx);
  }
  sendBrokerRegistrationTx(tx: BrokerRegistration) {
    if (!this.subTx) {
      return;
    }

    this.checkAndMakeTxQueue();
    assert(this.txQueue !== null);

    this.txQueue.brokerRegistration.push(tx);
  }
  sendIntegrationTx(tx: Integration) {
    if (!this.subTx) {
      return;
    }

    this.checkAndMakeTxQueue();
    assert(this.txQueue !== null);

    this.txQueue.integration.push(tx);
  }
  sendCommitTx(tx: Commit) {
    if (!this.subTx) {
      return;
    }

    this.checkAndMakeTxQueue();
    assert(this.txQueue !== null);

    this.txQueue.commit.push(tx);
  }

  //set timer to send
  setSendTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    } 

    if (this.parent.sendWait === 0) {
      this.onSendTimer();
    } else {
      this.timer = setTimeout(() => {
        this.onSendTimer();
      }, this.parent.sendWait);
    }
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

    assert(this.socket !== null);

    this.state = CONNECTION_STATE.WORKING_READ;

    //we store this here, so we can check to see if nothing has changed
    const socketCache = this.socket;

    this.parent.blockchain.getBlocksOnMainStringByDepth(this.differing, MAX_BLOCKS_SENDING).then((blocks: Block[]) => {
      if (this.state !== CONNECTION_STATE.WORKING_READ || this.socket !== socketCache) {
        return;
      }
      this.differing += blocks.length;

      const sending: DataMessage = {
        blocks: blocks,
        txs: this.txQueue
      };
      this.txQueue = null;

      this.socket.send(JSON.stringify(sending));
      this.setRecvTimer();
      //console.log(this.logName + "Moving to state WAITING_FOR_PEER after send");
      this.state = CONNECTION_STATE.WAITING_FOR_PEER;
    });
  }

  close() {
    assert(this.socket !== null);
    this.socket.close();
    this.socket = null;
    this.state = CONNECTION_STATE.CLOSED;
  }
}

//this acts as a publisher, and subscriber
class PropServer {
  logName: string; //prefix for console prints
  blockchain: Blockchain; //the blockchain we are propagating
  peerState: Map<string, PEER_STATE>; //the states of our peers
  txsSeen: Set<string>; //the txs we've seen, so we don't resend them
  port: number | null; //what port are we listening on
  myAddress: string | null; //what is our address (if we know)
  server: Listener | null; //the listening socket
  connectionCounter: number; //number of connections we've had, used for IDing
  txsCallback: null | ((tx: AnyTransaction) => void); //callback for new transactions
  //the following allows for plugging different transports in
  socketProvider: SocketProvider; //to construct sockets with
  sendWait: number; //the time to wait until we send. The longer we wait the more efficient we are but the longer it takes to synch everything
  connections: Connection[];
  listener: BlockchainListener;

  constructor(logName: string, blockchain: Blockchain, socketProvider: SocketProvider, txsCallback?: (tx: AnyTransaction) => void | null, sendWait = SEND_WAIT_MAX) {
    this.logName = logName;
    this.peerState = new Map<string, PEER_STATE>();
    this.connections = [];
    this.blockchain = blockchain;
    this.listener = this.blockchain.addListener((_newDepth: number, commonDepth: number) => {
      this.forConnection((con) => con.newChain(_newDepth, commonDepth));
    });
    this.txsSeen = new Set<string>();
    this.port = null;
    this.myAddress = null;
    this.server = null;
    this.connectionCounter = 0;
    if (txsCallback === undefined) {
      this.txsCallback = null;
    } else {
      this.txsCallback = txsCallback;
    }

    this.socketProvider = socketProvider;
    if (sendWait < 0) {
      sendWait = 0;
    }
    if (sendWait > SEND_WAIT_MAX) {
      sendWait = SEND_WAIT_MAX;
    }
    this.sendWait = sendWait;
  }

  //start the propagation server, on a port, with optional address and peers to start to connection to
  start(port: number, myAddress: string | null, peers: string[]) {
    if (this.port !== null) {
      throw new Error(`Couldn't start PropServer '${this.logName}', already started`);
    }

    this.port = port;
    this.myAddress = myAddress;
    for (const peer of peers) {
      this.connect(peer);
    }

    this.server = this.socketProvider.listen(port);
    this.server.on('connection', socket => {
      const connection = new Connection(this);
      connection.accepted(socket);
    });
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
  sendPaymentTx(tx: Payment) {
    const hash = ChainUtil.hash(Payment.toHash(tx));

    if (this.txsSeen.has(hash)) {
      return;
    }
    this.txsSeen.add(hash);

    this.forConnection((c) => c.sendPaymentTx(tx));
  }
  sendSensorRegistrationTx(tx: SensorRegistration) {
    const hash = ChainUtil.hash(SensorRegistration.toHash(tx));

    if (this.txsSeen.has(hash)) {
      return;
    }
    this.txsSeen.add(hash);

    this.forConnection((c) => c.sendSensorRegistrationTx(tx));
  }
  sendBrokerRegistrationTx(tx: BrokerRegistration) {
    const hash = ChainUtil.hash(BrokerRegistration.toHash(tx));

    if (this.txsSeen.has(hash)) {
      return;
    }
    this.txsSeen.add(hash);

    this.forConnection((c) => c.sendBrokerRegistrationTx(tx));
  }
  sendIntegrationTx(tx: Integration) {
    const hash = ChainUtil.hash(Integration.toHash(tx));

    if (this.txsSeen.has(hash)) {
      return;
    }
    this.txsSeen.add(hash);

    this.forConnection((c) => c.sendIntegrationTx(tx));
  }
  sendCommitTx(tx: Commit) {
    const hash = ChainUtil.hash(Commit.toHash(tx));

    if (this.txsSeen.has(hash)) {
      return;
    }
    this.txsSeen.add(hash);

    this.forConnection((c) => c.sendCommitTx(tx));
  }

  connectionCount(): number {
    return this.connections.length;
  }

  async close(): Promise<void> {
    this.port = null;
    this.myAddress = null;

    await new Promise<void>((resolve, reject) => {
      assert(this.server !== null);
      this.server.close((err) => {
        if (err !== undefined) {
          reject(err);
        } else {
          resolve();
        }
      });

    });
    this.server = null;
    for (const connection of this.connections) {
      connection.close();
    }
    this.connections = [];
  }

  private forConnection(func: (c: Connection) => void) {
    for (const connection of this.connections) {
      func(connection);
    }
  }
}

export {
  PropServer, type SocketProvider, type Socket, type SocketErrorEvent, type SocketMessageEvent, type SocketEvent,
  type SocketCloseEvent, type Listener
};
export default PropServer;
