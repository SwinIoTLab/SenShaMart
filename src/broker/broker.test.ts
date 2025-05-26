import { Blockchain, INTEGRATION_STATE } from '../blockchain/blockchain.js'
import Block from '../blockchain/block.js'
import Broker from './broker.js'
import IntegrationCache from './integration-cache.js'
import { ChainUtil } from '../util/chain-util.js'
import BrokerTx from '../blockchain/broker-registration.js'
import SensorTx from '../blockchain/sensor-registration.js'
import IntegrationTx from '../blockchain/integration.js'
import CommitTx from '../blockchain/commit.js'
import assert from 'assert/strict'

type Published = {
  topic: string;
  data: string | Buffer;
};

describe('Broker', () => {

  const kp = ChainUtil.genKeyPair();
  const kp2 = ChainUtil.genKeyPair();
  const brokerName = 'b';

  it('Construct', async () => {
    const bc = await Blockchain.create(":memory:", null);
    const ic = await IntegrationCache.create(":memory:");
    new Broker(kp, false, brokerName, bc, {
      publish: (_topic: string, _payload: string | Buffer) => { }
    }, ic, {
      commit: (_tx: CommitTx) => { }
    }, false);
  });

  it('passthrough on', async () => {
    const bc = await Blockchain.create(":memory:", null);
    const ic = await IntegrationCache.create(":memory:");

    const published: Published[] = [];

    const broker = new Broker(kp, true, brokerName, bc, {
      publish: (topic: string, data: string | Buffer) => {
        published.push({ topic, data });
      }
    }, ic, {
      commit: (_tx: CommitTx) => { }
    }, false);

    expect(published.length).toBe(0);

    await broker.onNewPacket('s1', 'test');

    expect(published.length).toBe(1);
    expect(published[0].topic).toBe('out/s1');
    expect(published[0].data).toBe('test');

    await broker.onNewPacket('s2', 'hello world');

    expect(published.length).toBe(2);
    expect(published[1].topic).toBe('out/s2');
    expect(published[1].data).toBe('hello world');
  });

  it('passthrough off', async () => {
    const bc = await Blockchain.create(":memory:", null);
    const ic = await IntegrationCache.create(":memory:");

    const published: Published[] = [];

    const broker = new Broker(kp, false, brokerName, bc, {
      publish: (topic: string, data: string | Buffer) => {
        published.push({ topic, data });
      }
    }, ic, {
      commit: (_tx: CommitTx) => { }
    }, false);

    expect(published.length).toBe(0);

    await broker.onNewPacket('s1', 'test');

    expect(published.length).toBe(0);

    await broker.onNewPacket('s2', 'hello world');

    expect(published.length).toBe(0);
  });

  it('single integration', async () => {
    const bc = await Blockchain.create(":memory:", null);
    const ic = await IntegrationCache.create(":memory:");

    const br0 = new BrokerTx(kp, 1, brokerName, "", 0);
    const cpm = 1;
    const s0 = new SensorTx(kp, 2, "sensor", cpm, 1, brokerName, null, 0);
    const integrationAmount = 10;
    const i0 = new IntegrationTx(kp2, 1, [IntegrationTx.createOutput(integrationAmount, "sensor", ChainUtil.hash(SensorTx.toHash(s0)), ChainUtil.hash(BrokerTx.toHash(br0)))], 0, 0);

    const bl0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {
      brokerRegistrations: [br0]
    });
    expect((await bc.addBlock(bl0.block)).result).toBe(true);

    const bl1 = Block.debugMine(bl0, kp.pubSerialized, {
      sensorRegistrations: [s0]
    });
    expect((await bc.addBlock(bl1.block)).result).toBe(true);

    const bl2 = Block.debugMine(bl1, kp.pubSerialized, {
      integrations: [i0]
    });
    expect((await bc.addBlock(bl2.block)).result).toBe(true);

    const published: Published[] = [];
    const committed: CommitTx[] = [];

    const broker = new Broker(kp, false, brokerName, bc, {
      publish: (topic: string, data: string | Buffer) => { published.push({ topic, data }); }
    }, ic, {
      commit: (tx: CommitTx) => { committed.push(tx); }
    }, false);

    //<= for loop count as we need to hit the limit to trigger out of coins and a commit
    for (let i = 0; i <= integrationAmount / cpm; ++i) {
      expect(published.length).toBe(i);
      expect(committed.length).toBe(0);
      //send data with no length, at i minutes past integration
      await broker.onNewPacket('sensor', '', bl2.block.timestamp + 60 * 1000 * i);
    }
    expect(published.length).toBe(1 + integrationAmount / cpm); //1+ since we <= in the loop
    expect(committed.length).toBe(1);

    for (const pub of published) {
      expect(pub.data).toBe('');
      expect(pub.topic).toBe('out/' + i0.input + '/' + i0.counter + '/' + s0.metadata.name);
    }

    //new packet past where the integration should be over
    await broker.onNewPacket('sensor', '', bl2.block.timestamp + 60 * 1000 * (1 + integrationAmount / cpm));
    expect(published.length).toBe(1 + integrationAmount / cpm); //1+ since we <= in the loop
    expect(committed.length).toBe(1);
  });

  it('timedout integration', async () => {
    const bc = await Blockchain.create(":memory:", null);
    const ic = await IntegrationCache.create(":memory:");

    const br0 = new BrokerTx(kp, 1, brokerName, "", 0);
    const cpm = 1;
    const s0 = new SensorTx(kp, 2, "sensor", cpm, 1, brokerName, null, 0);
    const integrationAmount = 10;
    const i0 = new IntegrationTx(kp2, 1, [IntegrationTx.createOutput(integrationAmount, "sensor", ChainUtil.hash(SensorTx.toHash(s0)), ChainUtil.hash(BrokerTx.toHash(br0)))], 0, 0);

    const bl0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {
      brokerRegistrations: [br0]
    });
    expect((await bc.addBlock(bl0.block)).result).toBe(true);

    const bl1 = Block.debugMine(bl0, kp.pubSerialized, {
      sensorRegistrations: [s0]
    });
    expect((await bc.addBlock(bl1.block)).result).toBe(true);

    const bl2 = Block.debugMine(bl1, kp.pubSerialized, {
      integrations: [i0]
    });
    expect((await bc.addBlock(bl2.block)).result).toBe(true);

    const published: Published[] = [];
    const committed: CommitTx[] = [];

    const broker = new Broker(kp, false, brokerName, bc, {
      publish: (topic: string, data: string | Buffer) => { published.push({ topic, data }); }
    }, ic, {
      commit: (tx: CommitTx) => { committed.push(tx); }
    }, false);

    //<= for loop count as we need to not hit the limit so we can timeout later
    for (let i = 0; i < integrationAmount / cpm; ++i) {
      expect(published.length).toBe(i);
      expect(committed.length).toBe(0);
      //send data with no length, at i minutes past integration
      await broker.onNewPacket('sensor', '', bl2.block.timestamp + 60 * 1000 * i);
    }
    expect(published.length).toBe(integrationAmount / cpm);
    expect(committed.length).toBe(0);

    for (const pub of published) {
      expect(pub.data).toBe('');
      expect(pub.topic).toBe('out/' + i0.input + '/' + i0.counter + '/' + s0.metadata.name);
    }

    const integrationPreFound = await bc.getIntegration(IntegrationTx.makeKey(i0));

    expect(integrationPreFound.val).not.toBeNull();
    assert(integrationPreFound.val !== null);

    const bl3 = Block.debugMine(bl2, kp.pubSerialized, {}, integrationPreFound.val.timeoutTime + 1);
    expect((await bc.addBlock(bl3.block)).result).toBe(true);

    const integrationPostFound = await bc.getIntegration(IntegrationTx.makeKey(i0));

    expect(integrationPostFound.val).not.toBeNull();
    assert(integrationPostFound.val !== null);
    expect(integrationPostFound.val.state).toBe(INTEGRATION_STATE.TIMED_OUT);

    //new packet past where the integration should be timed out
    await broker.onNewPacket('sensor', '', bl3.block.timestamp);
    expect(published.length).toBe(integrationAmount / cpm);
    expect(committed.length).toBe(0);
  });
});