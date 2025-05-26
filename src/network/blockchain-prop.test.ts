import { Blockchain } from '../blockchain/blockchain.js'
import { Block } from '../blockchain/block.js';
import { ChainUtil } from '../util/chain-util.js';
import { Payment as PaymentTx } from '../blockchain/payment.js';
import { SensorRegistration as SensorRegistrationTx } from '../blockchain/sensor-registration.js';
import { BrokerRegistration as BrokerRegistrationTx } from '../blockchain/broker-registration.js';
import { Integration as IntegrationTx } from '../blockchain/integration.js';
import { Commit as CommitTx } from '../blockchain/commit.js';
import assert from 'node:assert/strict';
import { PropServer, type Socket, type SocketErrorEvent, type SocketMessageEvent, type SocketEvent, type SocketCloseEvent, type Listener, type SocketProvider } from './blockchain-prop.js';

type Network = {
  connectors: Map<string, DummySocket[]>;
  listeners: Map<string, DummyListener>;
};

type UpdateWaiterChild = {
  waitingFor: number;
  cb: (res: boolean) => void;
  completed: boolean;
};

class UpdateWaiter {
  private length: number;
  private waiters: UpdateWaiterChild[];

  constructor(bc: Blockchain) {
    this.length = bc.length();
    bc.addListener((newDepth, _common) => {
      this.length = newDepth;
      //remove all completed waters, and finish the promise on anything with length <= newDepth
      this.waiters = this.waiters.filter((v) => {
        if (v.completed) {
          return false;
        }
        if (v.waitingFor <= this.length) {
          v.cb(true);
          v.completed = true;
          return false;
        }
        return true;
      });
    });
    this.waiters = [];
  }

  //true on success, fail on timeout
  waitUntil(length: number, timeoutMS: number): Promise<boolean> {
    return new Promise<boolean>((resolve, _reject) => {
      if (this.length >= length) {
        return Promise.resolve(true);
      }
      const adding: UpdateWaiterChild = {
        waitingFor: length,
        cb: resolve,
        completed: false
      };

      setTimeout(() => {
        if (!adding.completed) {
          adding.cb(false);
          adding.completed = true;
        }
      }, timeoutMS);

      this.waiters.push(adding);
    });
  }
}

class DummyListener implements Listener {
  onConnection: null | ((this: Listener, socket: Socket) => void);
  network: Network;
  address: string;

  constructor(address: string, network: Network) {
    this.onConnection = null;
    this.network = network;
    this.address = address;

    network.listeners.set(address, this);

    setImmediate(() => {
      const found = this.network.connectors.get(this.address);
      if (found !== undefined) {
        for (const socket of found) {
          const creating = new DummySocket();
          creating.partner = socket;
          socket.partner = creating;
          if (socket.openListener !== null) {
            socket.openListener({
              type: "open",
              target: socket,

            });
          }
          if (this.onConnection !== null) {
            this.onConnection(creating);
          }
        }
        this.network.connectors.set(this.address, []);
      }
    });
  }

  on(event: string, cb: (this: Listener, socket: Socket) => void): this {
    if (event !== "connection") {
      throw new Error(`Invalid event: '${event}'`);
    }

    this.onConnection = cb;

    return this;
  }

  close(cb: (err?: Error) => void) {
    this.network.listeners.delete(this.address);
    setImmediate(cb);
  }
}

class DummySocket implements DummySocket {
  errorListener: null | ((event: SocketErrorEvent) => void);
  messageListener: null | ((event: SocketMessageEvent) => void);
  openListener: null | ((event: SocketEvent) => void);
  closeListener: null | ((event: SocketCloseEvent) => void);
  bufferedAmount: number;
  partner: null | DummySocket;

  constructor() {
    this.errorListener = null;
    this.messageListener = null;
    this.openListener = null;
    this.closeListener = null;
    this.bufferedAmount = 0;
    this.partner = null;
  }

  addEventListener(method: string, listener: ((event: SocketErrorEvent) => void) | ((event: SocketMessageEvent) => void) | ((event: SocketEvent) => void) | ((event: SocketCloseEvent) => void)): this {
    switch (method) {
      case "error": this.errorListener = listener as ((event: SocketErrorEvent) => void); break;
      case "message": this.messageListener = listener as ((event: SocketMessageEvent) => void); break;
      case "open": this.openListener = listener as ((event: SocketEvent) => void); break;
      case "close": this.closeListener = listener as ((event: SocketCloseEvent) => void); break;
      default: throw new Error(`Invalid method: '${method}'`);
    }

    return this;
  }

  send(data: string): void {
    if (this.partner !== null && this.partner.messageListener !== null) {
      this.partner.messageListener({
        target: this.partner,
        type: "message",
        data: data
      });
    }
  }

  close() {
    if (this.partner !== null) {
      this.partner.partner = null;
      if (this.partner.closeListener !== null) {
        this.partner.closeListener({
          target: this.partner,
          code: 0,
          reason: "Other socket shutdown",
          type: "close",
          wasClean: true
        });
      }
      this.partner = null;
      if (this.closeListener !== null) {
        this.closeListener({
          target: this,
          code: 0,
          reason: "Other socket shutdown",
          type: "close",
          wasClean: true
        });
      }
    }
  }
}

class DummySocketProvider implements SocketProvider {
  network: Network;
  thisAddress: string;

  constructor(network: Network, thisAddress: string) {
    this.network = network;
    this.thisAddress = thisAddress;
  }

  connect(address: string): Socket {
    const creating = new DummySocket();
    setImmediate(() => {
      const foundListener = this.network.listeners.get(address);
      if (foundListener !== undefined) {
        const listened = new DummySocket();
        listened.partner = creating;
        creating.partner = listened;
        if (foundListener.onConnection !== null) {
          foundListener.onConnection(listened);
        }
        if (creating.openListener !== null) {
          creating.openListener({
            type: "open",
            target: creating
          });
        }
      } else {
        let foundConnectors = this.network.connectors.get(address);
        if (foundConnectors === undefined) {
          foundConnectors = [];
          this.network.connectors.set(address, foundConnectors);
        }
        foundConnectors.push(creating);
      }
    });
    return creating;
  }
  listen(port: number): Listener {
    return new DummyListener(this.thisAddress + ':' + port.toString(), this.network);
  }


}

function createNetwork(): Network {
  return {
    connectors: new Map<string, DummySocket[]>,
    listeners: new Map<string, DummyListener>
  };
}


describe('Blockchain-propagation', () => {

  const kp = ChainUtil.genKeyPair();
  const kp2 = ChainUtil.genKeyPair();

  it("construct", async () => {
    const bc1 = await Blockchain.create(":memory:", null);
    const bc2 = await Blockchain.create(":memory:", null);

    const network = createNetwork();

    const host1 = new DummySocketProvider(network, "ws://0.0.0.1");
    const host2 = new DummySocketProvider(network, "ws://0.0.0.2");

    const _prop1 = new PropServer("prop0", bc1, host1);
    const _prop2 = new PropServer("prop1", bc2, host2);
  });

  it("move 1 block back and forth", async () => {
    const bc1 = await Blockchain.create(":memory:", null);
    const bc1waiter = new UpdateWaiter(bc1);
    const bc2 = await Blockchain.create(":memory:", null);
    const bc2waiter = new UpdateWaiter(bc2);

    const b0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});

    expect((await bc1.addBlock(b0.block)).result).toBe(true);

    const network = createNetwork();

    const host1 = new DummySocketProvider(network, "ws://0.0.0.1");
    const host2 = new DummySocketProvider(network, "ws://0.0.0.2");

    const prop1 = new PropServer("prop0", bc1, host1, undefined, 0);
    const prop2 = new PropServer("prop1", bc2, host2, undefined, 0);

    prop2.start(0, null, []);
    prop1.start(0, null, ["ws://0.0.0.2:0"]);

    const b1 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});

    expect((await bc1.addBlock(b1.block)).result).toBe(true);
    expect(await bc2waiter.waitUntil(1, 10000)).toBe(true);

    const b2 = Block.debugMine(b1, kp.pubSerialized, {});

    expect((await bc2.addBlock(b2.block)).result).toBe(true);
    expect(await bc1waiter.waitUntil(2, 10000)).toBe(true);

    await prop1.close();
    await prop2.close();
  });

  it("overtake head on 1 from branch on 1", async () => {
    const bc1 = await Blockchain.create(":memory:", null);
    const bc2 = await Blockchain.create(":memory:", null);
    const bc2waiter = new UpdateWaiter(bc2);

    const b0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});

    expect((await bc1.addBlock(b0.block)).result).toBe(true);

    const network = createNetwork();

    const host1 = new DummySocketProvider(network, "ws://0.0.0.1");
    const host2 = new DummySocketProvider(network, "ws://0.0.0.2");

    const prop1 = new PropServer("prop0", bc1, host1, undefined, 0);
    const prop2 = new PropServer("prop1", bc2, host2, undefined, 0);

    prop2.start(0, null, []);
    prop1.start(0, null, ["ws://0.0.0.2:0"]);

    const b11 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});
    expect((await bc1.addBlock(b11.block)).result).toBe(true);
    expect(await bc2waiter.waitUntil(1, 10000)).toBe(true);

    const b12 = Block.debugMine(b11, kp.pubSerialized, {});
    expect((await bc1.addBlock(b12.block)).result).toBe(true);
    expect(await bc2waiter.waitUntil(2, 10000)).toBe(true);

    const b13 = Block.debugMine(b12, kp.pubSerialized, {});
    expect((await bc1.addBlock(b13.block)).result).toBe(true);
    expect(await bc2waiter.waitUntil(3, 10000)).toBe(true);

    const b22 = Block.debugMine(b11, kp2.pubSerialized, {});
    expect((await bc1.addBlock(b22.block)).result).toBe(true);

    const b23 = Block.debugMine(b22, kp2.pubSerialized, {});
    expect((await bc1.addBlock(b23.block)).result).toBe(true);

    const b24 = Block.debugMine(b23, kp2.pubSerialized, {});
    expect((await bc1.addBlock(b24.block)).result).toBe(true);

    expect(await bc2waiter.waitUntil(4, 10000)).toBe(true);

    await prop1.close();
    await prop2.close();
  });

  it("overtake head on 1 from branch on 2", async () => {
    const bc1 = await Blockchain.create(":memory:", null);
    const bc1waiter = new UpdateWaiter(bc1);
    const bc2 = await Blockchain.create(":memory:", null);
    const bc2waiter = new UpdateWaiter(bc2);

    const b0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});

    expect((await bc1.addBlock(b0.block)).result).toBe(true);

    const network = createNetwork();

    const host1 = new DummySocketProvider(network, "ws://0.0.0.1");
    const host2 = new DummySocketProvider(network, "ws://0.0.0.2");

    const prop1 = new PropServer("prop0", bc1, host1, undefined, 0);
    const prop2 = new PropServer("prop1", bc2, host2, undefined, 0);

    prop2.start(0, null, []);
    prop1.start(0, null, ["ws://0.0.0.2:0"]);

    const b11 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});
    expect((await bc1.addBlock(b11.block)).result).toBe(true);
    expect(await bc2waiter.waitUntil(1, 10000)).toBe(true);

    const b12 = Block.debugMine(b11, kp.pubSerialized, {});
    expect((await bc1.addBlock(b12.block)).result).toBe(true);
    expect(await bc2waiter.waitUntil(2, 10000)).toBe(true);

    const b13 = Block.debugMine(b12, kp.pubSerialized, {});
    expect((await bc1.addBlock(b13.block)).result).toBe(true);
    expect(await bc2waiter.waitUntil(3, 10000)).toBe(true);

    const b22 = Block.debugMine(b11, kp2.pubSerialized, {});
    expect((await bc2.addBlock(b22.block)).result).toBe(true);

    const b23 = Block.debugMine(b22, kp2.pubSerialized, {});
    expect((await bc2.addBlock(b23.block)).result).toBe(true);

    const b24 = Block.debugMine(b23, kp2.pubSerialized, {});
    expect((await bc2.addBlock(b24.block)).result).toBe(true);

    expect(await bc1waiter.waitUntil(4, 10000)).toBe(true);

    await prop1.close();
    await prop2.close();
  });
  it('send payment', async () => {
    const bc1 = await Blockchain.create(":memory:", null);
    const bc2 = await Blockchain.create(":memory:", null);

    const b0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});

    expect((await bc1.addBlock(b0.block)).result).toBe(true);

    const network = createNetwork();

    const host1 = new DummySocketProvider(network, "ws://0.0.0.1");
    const host2 = new DummySocketProvider(network, "ws://0.0.0.2");

    let recved: (v: boolean) => void | null;

    const sendingTx = new PaymentTx(kp, 1, [PaymentTx.createOutput(kp2.pubSerialized, 5)], 0);

    const prop1 = new PropServer("prop0", bc1, host1, undefined, 0);
    const prop2 = new PropServer("prop1", bc2, host2, (tx) => {
      if (tx.type === PaymentTx && ChainUtil.hash(tx.type.toHash(tx.tx)) === ChainUtil.hash(PaymentTx.toHash(sendingTx))) {
        assert(recved !== null);
        recved(true);
      }
    }, 0);

    prop2.start(0, null, []);
    prop1.start(0, null, ["ws://0.0.0.2:0"]);

    //need to wait to allow the connections to happen before we add a tx
    setTimeout(() => { prop1.sendPaymentTx(sendingTx) }, 500);

    expect(await new Promise<boolean>((resolve, _reject) => {
      recved = resolve;
    })).toBe(true);

    await prop1.close();
    await prop2.close();
  });
  it('send sensor registration', async () => {
    const bc1 = await Blockchain.create(":memory:", null);
    const bc2 = await Blockchain.create(":memory:", null);

    const b0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});

    expect((await bc1.addBlock(b0.block)).result).toBe(true);

    const network = createNetwork();

    const host1 = new DummySocketProvider(network, "ws://0.0.0.1");
    const host2 = new DummySocketProvider(network, "ws://0.0.0.2");

    let recved: (v: boolean) => void | null;

    const sendingTx = new SensorRegistrationTx(kp, 1, 'some name', 5, 9, 'whatever', null, 0);

    const prop1 = new PropServer("prop0", bc1, host1, undefined, 0);
    const prop2 = new PropServer("prop1", bc2, host2, (tx) => {
      if (tx.type === SensorRegistrationTx && ChainUtil.hash(tx.type.toHash(tx.tx)) === ChainUtil.hash(SensorRegistrationTx.toHash(sendingTx))) {
        assert(recved !== null);
        recved(true);
      }
    }, 0);

    prop2.start(0, null, []);
    prop1.start(0, null, ["ws://0.0.0.2:0"]);

    //need to wait to allow the connections to happen before we add a tx
    setTimeout(() => { prop1.sendSensorRegistrationTx(sendingTx) }, 500);

    expect(await new Promise<boolean>((resolve, _reject) => {
      recved = resolve;
    })).toBe(true);

    await prop1.close();
    await prop2.close();
  });
  it('send broker registration', async () => {
    const bc1 = await Blockchain.create(":memory:", null);
    const bc2 = await Blockchain.create(":memory:", null);

    const b0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});

    expect((await bc1.addBlock(b0.block)).result).toBe(true);

    const network = createNetwork();

    const host1 = new DummySocketProvider(network, "ws://0.0.0.1");
    const host2 = new DummySocketProvider(network, "ws://0.0.0.2");

    let recved: (v: boolean) => void | null;

    const sendingTx = new BrokerRegistrationTx(kp, 1, 'some broker', 'behind you', 5);

    const prop1 = new PropServer("prop0", bc1, host1, undefined, 0);
    const prop2 = new PropServer("prop1", bc2, host2, (tx) => {
      if (tx.type === BrokerRegistrationTx && ChainUtil.hash(tx.type.toHash(tx.tx)) === ChainUtil.hash(BrokerRegistrationTx.toHash(sendingTx))) {
        assert(recved !== null);
        recved(true);
      }
    }, 0);

    prop2.start(0, null, []);
    prop1.start(0, null, ["ws://0.0.0.2:0"]);

    //need to wait to allow the connections to happen before we add a tx
    setTimeout(() => { prop1.sendBrokerRegistrationTx(sendingTx) }, 500);

    expect(await new Promise<boolean>((resolve, _reject) => {
      recved = resolve;
    })).toBe(true);

    await prop1.close();
    await prop2.close();
  });
  it('send integration', async () => {
    const bc1 = await Blockchain.create(":memory:", null);
    const bc2 = await Blockchain.create(":memory:", null);

    const b0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});

    expect((await bc1.addBlock(b0.block)).result).toBe(true);

    const network = createNetwork();

    const host1 = new DummySocketProvider(network, "ws://0.0.0.1");
    const host2 = new DummySocketProvider(network, "ws://0.0.0.2");

    let recved: (v: boolean) => void | null;

    const sendingTx = new IntegrationTx(kp, 1, [IntegrationTx.createOutput(1, 'sensor1', 'a hash?', 'a second hash?'), IntegrationTx.createOutput(2, 'sensor2', 'a third hash!', 'purchance a fourth?')], 3, 5);

    const prop1 = new PropServer("prop0", bc1, host1, undefined, 0);
    const prop2 = new PropServer("prop1", bc2, host2, (tx) => {
      if (tx.type === IntegrationTx && ChainUtil.hash(tx.type.toHash(tx.tx)) === ChainUtil.hash(IntegrationTx.toHash(sendingTx))) {
        assert(recved !== null);
        recved(true);
      }
    }, 0);

    prop2.start(0, null, []);
    prop1.start(0, null, ["ws://0.0.0.2:0"]);

    //need to wait to allow the connections to happen before we add a tx
    setTimeout(() => { prop1.sendIntegrationTx(sendingTx) }, 500);

    expect(await new Promise<boolean>((resolve, _reject) => {
      recved = resolve;
    })).toBe(true);

    await prop1.close();
    await prop2.close();
  });
  it('send commit', async () => {
    const bc1 = await Blockchain.create(":memory:", null);
    const bc2 = await Blockchain.create(":memory:", null);

    const b0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});

    expect((await bc1.addBlock(b0.block)).result).toBe(true);

    const network = createNetwork();

    const host1 = new DummySocketProvider(network, "ws://0.0.0.1");
    const host2 = new DummySocketProvider(network, "ws://0.0.0.2");

    let recved: (v: boolean) => void | null;

    const i0 = new IntegrationTx(kp, 5, [IntegrationTx.createOutput(10, "s1", "abcd", "efgh"), IntegrationTx.createOutput(15, "s2", "ijkl", "mnop")], 0, 0);

    const sendingTx = new CommitTx(kp, IntegrationTx.makeKey(i0), [CommitTx.createOutput("sensor1", 0.2), CommitTx.createOutput("sensor2", 0.6)]);

    const prop1 = new PropServer("prop0", bc1, host1, undefined, 0);
    const prop2 = new PropServer("prop1", bc2, host2, (tx) => {
      if (tx.type === CommitTx && ChainUtil.hash(tx.type.toHash(tx.tx)) === ChainUtil.hash(CommitTx.toHash(sendingTx))) {
        assert(recved !== null);
        recved(true);
      }
    }, 0);

    prop2.start(0, null, []);
    prop1.start(0, null, ["ws://0.0.0.2:0"]);

    //need to wait to allow the connections to happen before we add a tx
    setTimeout(() => { prop1.sendCommitTx(sendingTx) }, 500);

    expect(await new Promise<boolean>((resolve, _reject) => {
      recved = resolve;
    })).toBe(true);

    await prop1.close();
    await prop2.close();
  });
});