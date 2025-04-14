import { Blockchain, INTEGRATION_STATE } from './blockchain.js';
import { Block, type DebugMined } from './block.js';
import { ChainUtil, isFailure } from '../util/chain-util.js';
import { randomInt } from 'crypto';
import Payment from './payment.js';
import BrokerRegistration from './broker-registration.js';
import SensorRegistration from './sensor-registration.js';
import Integration from './integration.js';
import Commit from './commit.js';
import { BROKER_COMMISION, INITIAL_BALANCE, INITIAL_COUNTER, MINING_REWARD, MINE_RATE } from '../util/constants.js';

describe('Blockchain', () => {

  const kp = ChainUtil.genKeyPair();
  const kp2 = ChainUtil.genKeyPair();

  it('Internal head changes', async () => {
    const bc = await Blockchain.create(":memory:", null);
    const b1 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});

    expect(bc.getHeadInfo().block.hash).toBe(Block.genesis().hash);

    expect((await bc.addBlock(b1.block)).result).toBe(true);

    expect(bc.getHeadInfo().block.hash).toBe(b1.block.hash);
  });

  it('Reward', async () => {
    const bc = await Blockchain.create(":memory:", null);

    const foundBefore = await bc.getWallet(kp.pubSerialized);
    expect(foundBefore.val.balance).toBe(INITIAL_BALANCE);

    expect((await bc.addBlock(Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {}).block)).result).toBe(true);

    const foundAfter = await bc.getWallet(kp.pubSerialized);
    expect(foundAfter.val.balance).toBe(INITIAL_BALANCE + MINING_REWARD);
  });

  it('Add 100 random blocks', async () => {
    const b = await Blockchain.create(":memory:", null);
    const blocks: DebugMined[] = [Block.debugGenesis()];
    for (let i = 0; i < 100; ++i) {
      const randomBlock = blocks[randomInt(0, blocks.length)];
      const adding = Block.debugMine(randomBlock, ChainUtil.genKeyPair().pubSerialized, {});
      const res = await b.addBlock(adding.block);
      if (isFailure(res)) {
        console.error(`Failed addBlock on ${i}: ${res.reason}`);
        expect(res.result).toBe(true);
      }
      blocks.push(adding);
    }
  });

  it('Broker add/get', async () => {
    const bc = await Blockchain.create(":memory:", null);
    const br0 = new BrokerRegistration(kp, 1, "broker", "10.0.0.2", 0);

    expect((await bc.addBlock(Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {
      brokerRegistrations: [br0]
    }).block)).result).toBe(true);

    const found = await bc.getBroker("broker");
    expect(found.val).not.toBeNull();
    expect(found.val?.endpoint).toBe("10.0.0.2");
    expect(found.val?.owner).toBe(kp.pubSerialized);
    expect(found.val?.hash).toBe(ChainUtil.hash(BrokerRegistration.toHash(br0)));
  });

  it('Broker on overtaking branch', async () => {
    const bc = await Blockchain.create(":memory:", null);
    const brokerB0 = new BrokerRegistration(kp, 1, "broker", "10.0.0.2", 0);
    const brokerB1 = new BrokerRegistration(kp, 2, "broker", "10.0.0.3", 0);
    const brokerB2 = new BrokerRegistration(kp, 2, "broker", "10.0.0.4", 0);

    const b0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {
      brokerRegistrations: [brokerB0]
    });
    expect((await bc.addBlock(b0.block)).result).toBe(true);
    expect((await bc.addBlock(Block.debugMine(b0, kp.pubSerialized, {
      brokerRegistrations: [brokerB1]
    }).block)).result).toBe(true);
    const b2 = Block.debugMine(b0, kp.pubSerialized, {
      brokerRegistrations: [brokerB2]
    });
    const b2res = await bc.addBlock(b2.block);
    if (isFailure(b2res)) {
      console.error(b2res.reason);
      expect(b2res.result).toBe(true);
    }

    const currentBroker1 = await bc.getBroker("broker");
    expect(currentBroker1.val).not.toBe(null);
    expect(currentBroker1.val?.endpoint).toBe("10.0.0.3");

    expect((await bc.addBlock(Block.debugMine(b2, kp.pubSerialized, {}).block)).result).toBe(true);

    const currentBroker2 = await bc.getBroker("broker");
    expect(currentBroker2.val).not.toBe(null);
    expect(currentBroker2.val?.endpoint).toBe("10.0.0.4");
  });

  it('getBrokers', async () => {
    const bc = await Blockchain.create(":memory:", null);
    const brokers = [
      new BrokerRegistration(kp, 1, "1", "", 0),
      new BrokerRegistration(kp, 2, "2", "", 0),
      new BrokerRegistration(kp, 3, "3", "", 0)];

    let prevBlock = Block.debugGenesis();

    for (const broker of brokers) {
      prevBlock = Block.debugMine(prevBlock, kp.pubSerialized, {
        brokerRegistrations: [broker]
      });
      expect((await bc.addBlock(prevBlock.block)).result).toBe(true);
    }

    let count = 0;

    await bc.getBrokers((_key, _tx) => ++count);

    expect(count).toBe(brokers.length);
  });

  it('Invalid broker counter', async () => {
    const bc = await Blockchain.create(":memory:", null);
    const brokerB0 = new BrokerRegistration(kp, 1, "broker", "10.0.0.2", 0);
    const brokerB1 = new BrokerRegistration(kp, 1, "broker", "10.0.0.3", 0);
    const b0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {
      brokerRegistrations: [brokerB0]
    });
    expect((await bc.addBlock(b0.block)).result).toBe(true);
    const b1 = Block.debugMine(b0, kp.pubSerialized, {
      brokerRegistrations: [brokerB1]
    });
    expect((await bc.addBlock(b1.block)).result).toBe(false);
  });

  it("Sensor add/get", async () => {
    const bc = await Blockchain.create(":memory:", null);

    const br0 = new BrokerRegistration(kp, 1, "broker", "", 0);
    const bl0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {
      brokerRegistrations: [br0]
    });
    expect((await bc.addBlock(bl0.block)).result).toBe(true);

    const s0 = new SensorRegistration(kp, 2, "sensor", 1, 2, "broker", null, 0);
    const bl1 = Block.debugMine(bl0, kp.pubSerialized, {
      sensorRegistrations: [s0]
    });
    expect((await bc.addBlock(bl1.block)).result).toBe(true);

    const found = await bc.getSensor("sensor");
    expect(found.val).not.toBeNull();
    expect(found.val?.broker).toBe("broker");
    expect(found.val?.costPerKB).toBe(2);
    expect(found.val?.costPerMin).toBe(1);
    expect(found.val?.owner).toBe(kp.pubSerialized);
    expect(found.val?.hash).toBe(ChainUtil.hash(SensorRegistration.toHash(s0)));
  });

  it('Sensor no broker', async () => {
    const bc = await Blockchain.create(":memory:", null);
    const s0 = new SensorRegistration(kp, 1, "sensor", 1, 1, "broker", null, 0);
    const b0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {
      sensorRegistrations: [s0]
    });
    expect((await bc.addBlock(b0.block)).result).toBe(false);
  });

  it('Invalid sensor counter', async () => {
    const bc = await Blockchain.create(":memory:", null);

    const br0 = new BrokerRegistration(kp, 1, "broker", "", 0);
    const bl0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {
      brokerRegistrations: [br0]
    });
    expect((await bc.addBlock(bl0.block)).result).toBe(true);

    const s0 = new SensorRegistration(kp, 2, "sensor", 1, 1, "broker", null, 0);
    const bl1 = Block.debugMine(bl0, kp.pubSerialized, {
      sensorRegistrations: [s0]
    });
    expect((await bc.addBlock(bl1.block)).result).toBe(true);

    const s1 = new SensorRegistration(kp, 2, "sensor", 2, 2, "broker", null, 0);
    const bl2 = Block.debugMine(bl1, kp.pubSerialized, {
      sensorRegistrations: [s1]
    });
    expect((await bc.addBlock(bl2.block)).result).toBe(false);
  });

  it('Payment add/get', async () => {
    const bc = await Blockchain.create(":memory:", null);

    const foundSendBefore = await bc.getWallet(kp.pubSerialized);
    expect(foundSendBefore.val.counter).toBe(INITIAL_COUNTER);
    expect(foundSendBefore.val.balance).toBe(INITIAL_BALANCE);

    const foundRecvBefore = await bc.getWallet(kp2.pubSerialized);
    expect(foundRecvBefore.val.counter).toBe(INITIAL_COUNTER);
    expect(foundRecvBefore.val.balance).toBe(INITIAL_BALANCE);

    const p0 = new Payment(kp, 1, [Payment.createOutput(kp2.pubSerialized, INITIAL_BALANCE)], 0);
    const bl0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {
      payments: [p0]
    });
    expect((await bc.addBlock(bl0.block)).result).toBe(true);

    const foundSendAfter = await bc.getWallet(kp.pubSerialized);
    expect(foundSendAfter.val.counter).toBe(1);
    expect(foundSendAfter.val.balance).toBe(MINING_REWARD);

    const foundRecvAfter = await bc.getWallet(kp2.pubSerialized);
    expect(foundRecvAfter.val.counter).toBe(INITIAL_COUNTER);
    expect(foundRecvAfter.val.balance).toBe(2 * INITIAL_BALANCE);
  });

  it('Integration add/get', async () => {
    const bc = await Blockchain.create(":memory:", null);

    const br0 = new BrokerRegistration(kp, 1, "broker", "", 0);
    const s0 = new SensorRegistration(kp, 2, "sensor", 1, 2, "broker", null, 0);
    const i0 = new Integration(kp, 3, [Integration.createOutput(10, "sensor", ChainUtil.hash(SensorRegistration.toHash(s0)), ChainUtil.hash(BrokerRegistration.toHash(br0)))], 0, 0);

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

    const found = await bc.getIntegration(kp.pubSerialized + '/' + String(i0.counter));

    expect(found.val).not.toBeNull();
    if (found.val !== null) {
      expect(found.val.owner).toBe(kp.pubSerialized);
      expect(found.val.outputs.length).toBe(1);
      expect(found.val.outputs[0].amount).toBe(10);
      expect(found.val.outputs[0].broker).toBe("broker");
      expect(found.val.outputs[0].brokerOwner).toBe(kp.pubSerialized);
      expect(found.val.outputs[0].sensorCostPerKB).toBe(2);
      expect(found.val.outputs[0].sensorCostPerMin).toBe(1);
      expect(found.val.outputs[0].sensorOwner).toBe(kp.pubSerialized);
    }
  });
  it('Integration invalid counter', async () => {
    const bc = await Blockchain.create(":memory:", null);

    const br0 = new BrokerRegistration(kp, 1, "broker", "", 0);
    const s0 = new SensorRegistration(kp, 2, "sensor", 1, 2, "broker", null, 0);
    const i0 = new Integration(kp, 2, [Integration.createOutput(10, "sensor", ChainUtil.hash(SensorRegistration.toHash(s0)), ChainUtil.hash(BrokerRegistration.toHash(br0)))], 0, 0);

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
    expect((await bc.addBlock(bl2.block)).result).toBe(false);
  });
  it('Integration invalid output sensor name', async () => {
    const bc = await Blockchain.create(":memory:", null);

    const br0 = new BrokerRegistration(kp, 1, "broker", "", 0);
    const s0 = new SensorRegistration(kp, 2, "sensor", 1, 2, "broker", null, 0);
    const i0 = new Integration(kp, 3, [Integration.createOutput(10, "fake sensor", ChainUtil.hash(SensorRegistration.toHash(s0)), ChainUtil.hash(BrokerRegistration.toHash(br0)))], 0, 0);

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
    expect((await bc.addBlock(bl2.block)).result).toBe(false);
  });
  it('Integration invalid output sensor hash', async () => {
    const bc = await Blockchain.create(":memory:", null);

    const br0 = new BrokerRegistration(kp, 1, "broker", "", 0);
    const s0 = new SensorRegistration(kp, 2, "sensor", 1, 2, "broker", null, 0);
    const fake_sensor = new SensorRegistration(kp, 2, "fake sensor", 1, 2, "broker", null, 0);
    const i0 = new Integration(kp, 3, [Integration.createOutput(10, "sensor", ChainUtil.hash(SensorRegistration.toHash(fake_sensor)), ChainUtil.hash(BrokerRegistration.toHash(br0)))], 0, 0);

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
    expect((await bc.addBlock(bl2.block)).result).toBe(false);
  });
  it('Integration invalid output sensor name', async () => {
    const bc = await Blockchain.create(":memory:", null);

    const br0 = new BrokerRegistration(kp, 1, "broker", "", 0);
    const fake_broker = new BrokerRegistration(kp, 1, "fake broker", "", 0);
    const s0 = new SensorRegistration(kp, 2, "sensor", 1, 2, "broker", null, 0);
    const i0 = new Integration(kp, 3, [Integration.createOutput(10, "sensor", ChainUtil.hash(SensorRegistration.toHash(s0)), ChainUtil.hash(BrokerRegistration.toHash(fake_broker)))], 0, 0);

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
    expect((await bc.addBlock(bl2.block)).result).toBe(false);
  });
  it('Commit add/get 1 full refund', async () => {
    const bc = await Blockchain.create(":memory:", null);

    const br0 = new BrokerRegistration(kp, 1, "broker", "", 0);
    const s0 = new SensorRegistration(kp, 2, "sensor", 1, 2, "broker", null, 0);
    const i0 = new Integration(kp2, 1, [Integration.createOutput(10, "sensor", ChainUtil.hash(SensorRegistration.toHash(s0)), ChainUtil.hash(BrokerRegistration.toHash(br0)))], 0, 0);
    const c0 = new Commit(kp, i0.input, i0.counter, [Commit.createOutput(0, 0)]);

    const bl0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {
      brokerRegistrations: [br0]
    });
    expect((await bc.addBlock(bl0.block)).result).toBe(true);

    const bl1 = Block.debugMine(bl0, kp.pubSerialized, {
      sensorRegistrations: [s0]
    });
    expect((await bc.addBlock(bl1.block)).result).toBe(true);

    const beforeIntegrationKpWallet = await bc.getWallet(kp.pubSerialized);
    expect(beforeIntegrationKpWallet.val.balance).toBe(INITIAL_BALANCE + 2 * MINING_REWARD);
    const beforeIntegrationKp2Wallet = await bc.getWallet(kp2.pubSerialized);
    expect(beforeIntegrationKp2Wallet.val.balance).toBe(INITIAL_BALANCE);

    const bl2 = Block.debugMine(bl1, kp.pubSerialized, {
      integrations: [i0]
    });
    expect((await bc.addBlock(bl2.block)).result).toBe(true);

    const afterIntegrationKpWallet = await bc.getWallet(kp.pubSerialized);
    expect(afterIntegrationKpWallet.val.balance).toBe(INITIAL_BALANCE + 3 * MINING_REWARD);
    const afterIntegrationKp2Wallet = await bc.getWallet(kp2.pubSerialized);
    expect(afterIntegrationKp2Wallet.val.balance).toBe(INITIAL_BALANCE - 10);

    const foundBefore = await bc.getIntegration(kp2.pubSerialized + '/' + String(i0.counter));

    expect(foundBefore.val).not.toBeNull();
    if (foundBefore.val !== null) {
      expect(foundBefore.val.owner).toBe(kp2.pubSerialized);
      expect(foundBefore.val.outputs.length).toBe(1);
      expect(foundBefore.val.state).toBe(INTEGRATION_STATE.RUNNING);
      expect(foundBefore.val.uncommittedCount).toBe(1);
      expect(foundBefore.val.outputs[0].amount).toBe(10);
      expect(foundBefore.val.outputs[0].broker).toBe("broker");
      expect(foundBefore.val.outputs[0].brokerOwner).toBe(kp.pubSerialized);
      expect(foundBefore.val.outputs[0].sensorCostPerKB).toBe(2);
      expect(foundBefore.val.outputs[0].sensorCostPerMin).toBe(1);
      expect(foundBefore.val.outputs[0].sensorOwner).toBe(kp.pubSerialized);
      expect(foundBefore.val.outputs[0].compensationTotal).toBe(0);
      expect(foundBefore.val.outputs[0].witnesses[kp.pubSerialized]).toBe(false);
    }

    const bl3 = Block.debugMine(bl2, kp.pubSerialized, {
      commits: [c0]
    });
    expect((await bc.addBlock(bl3.block)).result).toBe(true);

    const afterCommitKpWallet = await bc.getWallet(kp.pubSerialized);
    expect(afterCommitKpWallet.val.balance).toBe(INITIAL_BALANCE + 4 * MINING_REWARD + BROKER_COMMISION * 10);
    const afterCommitKp2Wallet = await bc.getWallet(kp2.pubSerialized);
    expect(afterCommitKp2Wallet.val.balance).toBe(INITIAL_BALANCE - BROKER_COMMISION * 10);

    const foundAfter = await bc.getIntegration(kp2.pubSerialized + '/' + String(i0.counter));

    expect(foundAfter.val).not.toBeNull();
    if (foundAfter.val !== null) {
      expect(foundAfter.val.owner).toBe(kp2.pubSerialized);
      expect(foundAfter.val.outputs.length).toBe(1);
      expect(foundAfter.val.state).toBe(INTEGRATION_STATE.COMMITTED);
      expect(foundAfter.val.uncommittedCount).toBe(0);
      expect(foundAfter.val.outputs[0].amount).toBe(10);
      expect(foundAfter.val.outputs[0].broker).toBe("broker");
      expect(foundAfter.val.outputs[0].brokerOwner).toBe(kp.pubSerialized);
      expect(foundAfter.val.outputs[0].sensorCostPerKB).toBe(2);
      expect(foundAfter.val.outputs[0].sensorCostPerMin).toBe(1);
      expect(foundAfter.val.outputs[0].sensorOwner).toBe(kp.pubSerialized);
      expect(foundAfter.val.outputs[0].compensationTotal).toBe(0);
      expect(foundAfter.val.outputs[0].witnesses[kp.pubSerialized]).toBe(true);
    }
  });
  it('Commit add/get 1 full commit', async () => {
    const bc = await Blockchain.create(":memory:", null);

    const br0 = new BrokerRegistration(kp, 1, "broker", "", 0);
    const s0 = new SensorRegistration(kp, 2, "sensor", 1, 2, "broker", null, 0);
    const i0 = new Integration(kp2, 1, [Integration.createOutput(10, "sensor", ChainUtil.hash(SensorRegistration.toHash(s0)), ChainUtil.hash(BrokerRegistration.toHash(br0)))], 0, 0);
    const c0 = new Commit(kp, i0.input, i0.counter, [Commit.createOutput(0, 1)]);

    const bl0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {
      brokerRegistrations: [br0]
    });
    expect((await bc.addBlock(bl0.block)).result).toBe(true);

    const bl1 = Block.debugMine(bl0, kp.pubSerialized, {
      sensorRegistrations: [s0]
    });
    expect((await bc.addBlock(bl1.block)).result).toBe(true);

    const beforeIntegrationKpWallet = await bc.getWallet(kp.pubSerialized);
    expect(beforeIntegrationKpWallet.val.balance).toBe(INITIAL_BALANCE + 2 * MINING_REWARD);
    const beforeIntegrationKp2Wallet = await bc.getWallet(kp2.pubSerialized);
    expect(beforeIntegrationKp2Wallet.val.balance).toBe(INITIAL_BALANCE);

    const bl2 = Block.debugMine(bl1, kp.pubSerialized, {
      integrations: [i0]
    });
    expect((await bc.addBlock(bl2.block)).result).toBe(true);

    const afterIntegrationKpWallet = await bc.getWallet(kp.pubSerialized);
    expect(afterIntegrationKpWallet.val.balance).toBe(INITIAL_BALANCE + 3 * MINING_REWARD);
    const afterIntegrationKp2Wallet = await bc.getWallet(kp2.pubSerialized);
    expect(afterIntegrationKp2Wallet.val.balance).toBe(INITIAL_BALANCE - 10);

    const foundBefore = await bc.getIntegration(kp2.pubSerialized + '/' + String(i0.counter));

    expect(foundBefore.val).not.toBeNull();
    if (foundBefore.val !== null) {
      expect(foundBefore.val.owner).toBe(kp2.pubSerialized);
      expect(foundBefore.val.outputs.length).toBe(1);
      expect(foundBefore.val.state).toBe(INTEGRATION_STATE.RUNNING);
      expect(foundBefore.val.uncommittedCount).toBe(1);
      expect(foundBefore.val.outputs[0].amount).toBe(10);
      expect(foundBefore.val.outputs[0].broker).toBe("broker");
      expect(foundBefore.val.outputs[0].brokerOwner).toBe(kp.pubSerialized);
      expect(foundBefore.val.outputs[0].sensorCostPerKB).toBe(2);
      expect(foundBefore.val.outputs[0].sensorCostPerMin).toBe(1);
      expect(foundBefore.val.outputs[0].sensorOwner).toBe(kp.pubSerialized);
      expect(foundBefore.val.outputs[0].compensationTotal).toBe(0);
      expect(foundBefore.val.outputs[0].witnesses[kp.pubSerialized]).toBe(false);
    }

    const bl3 = Block.debugMine(bl2, kp.pubSerialized, {
      commits: [c0]
    });
    expect((await bc.addBlock(bl3.block)).result).toBe(true);

    const afterCommitKpWallet = await bc.getWallet(kp.pubSerialized);
    expect(afterCommitKpWallet.val.balance).toBe(INITIAL_BALANCE + 4 * MINING_REWARD + 10);
    const afterCommitKp2Wallet = await bc.getWallet(kp2.pubSerialized);
    expect(afterCommitKp2Wallet.val.balance).toBe(INITIAL_BALANCE - 10);

    const foundAfter = await bc.getIntegration(kp2.pubSerialized + '/' + String(i0.counter));

    expect(foundAfter.val).not.toBeNull();
    if (foundAfter.val !== null) {
      expect(foundAfter.val.owner).toBe(kp2.pubSerialized);
      expect(foundAfter.val.outputs.length).toBe(1);
      expect(foundAfter.val.state).toBe(INTEGRATION_STATE.COMMITTED);
      expect(foundAfter.val.uncommittedCount).toBe(0);
      expect(foundAfter.val.outputs[0].amount).toBe(10);
      expect(foundAfter.val.outputs[0].broker).toBe("broker");
      expect(foundAfter.val.outputs[0].brokerOwner).toBe(kp.pubSerialized);
      expect(foundAfter.val.outputs[0].sensorCostPerKB).toBe(2);
      expect(foundAfter.val.outputs[0].sensorCostPerMin).toBe(1);
      expect(foundAfter.val.outputs[0].sensorOwner).toBe(kp.pubSerialized);
      expect(foundAfter.val.outputs[0].compensationTotal).toBe(1);
      expect(foundAfter.val.outputs[0].witnesses[kp.pubSerialized]).toBe(true);
    }
  });
  it('Integration timeout', async () => {
    const bc = await Blockchain.create(":memory:", null);

    const br0 = new BrokerRegistration(kp, 1, "broker", "", 0);
    const s0 = new SensorRegistration(kp, 2, "sensor", 1, 2, "broker", null, 0);
    const i0 = new Integration(kp2, 1, [Integration.createOutput(10, "sensor", ChainUtil.hash(SensorRegistration.toHash(s0)), ChainUtil.hash(BrokerRegistration.toHash(br0)))], 0, 0);

    const bl0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {
      brokerRegistrations: [br0]
    });
    expect((await bc.addBlock(bl0.block)).result).toBe(true);

    const bl1 = Block.debugMine(bl0, kp.pubSerialized, {
      sensorRegistrations: [s0]
    });
    expect((await bc.addBlock(bl1.block)).result).toBe(true);

    const beforeIntegrationKpWallet = await bc.getWallet(kp.pubSerialized);
    expect(beforeIntegrationKpWallet.val.balance).toBe(INITIAL_BALANCE + 2 * MINING_REWARD);
    const beforeIntegrationKp2Wallet = await bc.getWallet(kp2.pubSerialized);
    expect(beforeIntegrationKp2Wallet.val.balance).toBe(INITIAL_BALANCE);

    const bl2 = Block.debugMine(bl1, kp.pubSerialized, {
      integrations: [i0]
    });
    expect((await bc.addBlock(bl2.block)).result).toBe(true);

    const afterIntegrationKpWallet = await bc.getWallet(kp.pubSerialized);
    expect(afterIntegrationKpWallet.val.balance).toBe(INITIAL_BALANCE + 3 * MINING_REWARD);
    const afterIntegrationKp2Wallet = await bc.getWallet(kp2.pubSerialized);
    expect(afterIntegrationKp2Wallet.val.balance).toBe(INITIAL_BALANCE - 10);

    const foundBefore = await bc.getIntegration(kp2.pubSerialized + '/' + String(i0.counter));

    expect(foundBefore.val).not.toBeNull();
    if (foundBefore.val !== null) {
      expect(foundBefore.val.owner).toBe(kp2.pubSerialized);
      expect(foundBefore.val.outputs.length).toBe(1);
      expect(foundBefore.val.state).toBe(INTEGRATION_STATE.RUNNING);
      expect(foundBefore.val.uncommittedCount).toBe(1);
      expect(foundBefore.val.outputs[0].amount).toBe(10);
      expect(foundBefore.val.outputs[0].broker).toBe("broker");
      expect(foundBefore.val.outputs[0].brokerOwner).toBe(kp.pubSerialized);
      expect(foundBefore.val.outputs[0].sensorCostPerKB).toBe(2);
      expect(foundBefore.val.outputs[0].sensorCostPerMin).toBe(1);
      expect(foundBefore.val.outputs[0].sensorOwner).toBe(kp.pubSerialized);
      expect(foundBefore.val.outputs[0].compensationTotal).toBe(0);
      expect(foundBefore.val.outputs[0].witnesses[kp.pubSerialized]).toBe(false);
    } else {
      return;
    }

    const bl3 = Block.debugMine(bl2, kp.pubSerialized, {}, foundBefore.val.timeoutTime + 1);
    expect((await bc.addBlock(bl3.block)).result).toBe(true);

    const afterCommitKpWallet = await bc.getWallet(kp.pubSerialized);
    expect(afterCommitKpWallet.val.balance).toBe(INITIAL_BALANCE + 4 * MINING_REWARD);
    const afterCommitKp2Wallet = await bc.getWallet(kp2.pubSerialized);
    expect(afterCommitKp2Wallet.val.balance).toBe(INITIAL_BALANCE);

    const foundAfter = await bc.getIntegration(kp2.pubSerialized + '/' + String(i0.counter));

    expect(foundAfter.val).not.toBeNull();
    if (foundAfter.val !== null) {
      expect(foundAfter.val.owner).toBe(kp2.pubSerialized);
      expect(foundAfter.val.outputs.length).toBe(1);
      expect(foundAfter.val.state).toBe(INTEGRATION_STATE.TIMED_OUT);
      expect(foundAfter.val.uncommittedCount).toBe(1);
      expect(foundAfter.val.outputs[0].amount).toBe(10);
      expect(foundAfter.val.outputs[0].broker).toBe("broker");
      expect(foundAfter.val.outputs[0].brokerOwner).toBe(kp.pubSerialized);
      expect(foundAfter.val.outputs[0].sensorCostPerKB).toBe(2);
      expect(foundAfter.val.outputs[0].sensorCostPerMin).toBe(1);
      expect(foundAfter.val.outputs[0].sensorOwner).toBe(kp.pubSerialized);
      expect(foundAfter.val.outputs[0].compensationTotal).toBe(0);
      expect(foundAfter.val.outputs[0].witnesses[kp.pubSerialized]).toBe(false);
    }
  });

  it('Cull heads1', async () => {
    const bc = await Blockchain.create(":memory:", null);

    //we're going to form a fork, and then cull one side

    const bl0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {}, 2 * MINE_RATE);
    const bl11 = Block.debugMine(bl0, kp.pubSerialized, {}, 4 * MINE_RATE);
    const bl21 = Block.debugMine(bl0, kp.pubSerialized, {}, 5 * MINE_RATE);

    expect((await bc.addBlock(bl0.block)).result).toBe(true);
    expect((await bc.addBlock(bl11.block)).result).toBe(true);
    expect((await bc.addBlock(bl21.block)).result).toBe(true);


    await bc.manualCull(0);
    //now we check which blocks exist, branch 1 should still be there
    expect(await bc.getBlockByHash(bl0.block.hash)).not.toBeNull();
    expect(await bc.getBlockByHash(bl11.block.hash)).not.toBeNull();
    expect(await bc.getBlockByHash(bl21.block.hash)).toBeNull();

    await bc.close();
  });
  it('Cull heads2', async () => {
    const bc = await Blockchain.create(":memory:", null);

    //we're going to form a fork, and then cull one side

    const bl0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {}, 2 * MINE_RATE);
    const bl11 = Block.debugMine(bl0, kp.pubSerialized, {}, 4 * MINE_RATE);
    const bl21 = Block.debugMine(bl0, kp.pubSerialized, {}, 3 * MINE_RATE);

    expect((await bc.addBlock(bl0.block)).result).toBe(true);
    expect((await bc.addBlock(bl11.block)).result).toBe(true);
    expect((await bc.addBlock(bl21.block)).result).toBe(true);

    await bc.manualCull(0);
    //now we check which blocks exist, branch 1 should still be there
    expect(await bc.getBlockByHash(bl0.block.hash)).not.toBeNull();
    expect(await bc.getBlockByHash(bl11.block.hash)).toBeNull();
    expect(await bc.getBlockByHash(bl21.block.hash)).not.toBeNull();

    await bc.close();
  });
  it('Cull double fork', async () => {
    const bc = await Blockchain.create(":memory:", null);

    //we're going to form 2 fork, and then cull 2 heads

    const bl0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {}, 2 * MINE_RATE);
    const bl11 = Block.debugMine(bl0, kp.pubSerialized, {}, 4 * MINE_RATE);
    const bl12 = Block.debugMine(bl11, kp.pubSerialized, {}, 6 * MINE_RATE);
    const bl22 = Block.debugMine(bl11, kp.pubSerialized, {}, 7 * MINE_RATE);
    const bl31 = Block.debugMine(bl0, kp.pubSerialized, {}, 5 * MINE_RATE);
    const bl32 = Block.debugMine(bl31, kp.pubSerialized, {}, 7 * MINE_RATE);
    const bl42 = Block.debugMine(bl31, kp.pubSerialized, {}, 8 * MINE_RATE);

    expect((await bc.addBlock(bl0.block)).result).toBe(true);
    expect((await bc.addBlock(bl11.block)).result).toBe(true);
    expect((await bc.addBlock(bl12.block)).result).toBe(true);
    expect((await bc.addBlock(bl22.block)).result).toBe(true);
    expect((await bc.addBlock(bl31.block)).result).toBe(true);
    expect((await bc.addBlock(bl32.block)).result).toBe(true);
    expect((await bc.addBlock(bl42.block)).result).toBe(true);

    await bc.manualCull(0);

    //now we check which blocks exist, branch 1 should still be there
    expect(await bc.getBlockByHash(bl0.block.hash)).not.toBeNull();
    expect(await bc.getBlockByHash(bl11.block.hash)).not.toBeNull();
    expect(await bc.getBlockByHash(bl12.block.hash)).not.toBeNull();
    expect(await bc.getBlockByHash(bl22.block.hash)).toBeNull();
    expect(await bc.getBlockByHash(bl31.block.hash)).toBeNull();
    expect(await bc.getBlockByHash(bl32.block.hash)).toBeNull();
    expect(await bc.getBlockByHash(bl42.block.hash)).toBeNull();
  });
  it('Cull double fork, different insertion order', async () => {
    const bc = await Blockchain.create(":memory:", null);

    //we're going to form 3 fork, and then cull 3 heads.
    //This different insertion order causes a 'lower' string to be culled before the 'higher' string that branches off the 'lower' one.
    //This caused a bug previously, so now we have regression testing!

    const bl0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {}, 2 * MINE_RATE);
    const bl11 = Block.debugMine(bl0, kp.pubSerialized, {}, 4 * MINE_RATE);
    const bl12 = Block.debugMine(bl11, kp.pubSerialized, {}, 6 * MINE_RATE);
    const bl22 = Block.debugMine(bl11, kp.pubSerialized, {}, 7 * MINE_RATE);
    const bl31 = Block.debugMine(bl0, kp.pubSerialized, {}, 5 * MINE_RATE);
    const bl32 = Block.debugMine(bl31, kp.pubSerialized, {}, 7 * MINE_RATE);
    const bl42 = Block.debugMine(bl31, kp.pubSerialized, {}, 8 * MINE_RATE);

    expect((await bc.addBlock(bl0.block)).result).toBe(true);
    expect((await bc.addBlock(bl31.block)).result).toBe(true);
    expect((await bc.addBlock(bl32.block)).result).toBe(true);
    expect((await bc.addBlock(bl42.block)).result).toBe(true);
    expect((await bc.addBlock(bl11.block)).result).toBe(true);
    expect((await bc.addBlock(bl12.block)).result).toBe(true);
    expect((await bc.addBlock(bl22.block)).result).toBe(true);


    await bc.manualCull(0);

    //now we check which blocks exist, branch 1 should still be there
    expect(await bc.getBlockByHash(bl0.block.hash)).not.toBeNull();
    expect(await bc.getBlockByHash(bl11.block.hash)).not.toBeNull();
    expect(await bc.getBlockByHash(bl12.block.hash)).not.toBeNull();
    expect(await bc.getBlockByHash(bl22.block.hash)).toBeNull();
    expect(await bc.getBlockByHash(bl31.block.hash)).toBeNull();
    expect(await bc.getBlockByHash(bl32.block.hash)).toBeNull();
    expect(await bc.getBlockByHash(bl42.block.hash)).toBeNull();
  });
  it('Representative hashes', async () => {
    const bc = await Blockchain.create(':memory:', null);

    const blocks: DebugMined[] = [];

    for (let i = 0; i < 1000; ++i) {
      const prev = blocks.length === 0 ? Block.debugGenesis() : blocks[blocks.length - 1];
      const block = Block.debugMine(prev, kp.pubSerialized, {});
      expect((await bc.addBlock(block.block)).result).toBe(true);
      blocks.push(block);

      const repHashes = await bc.getRepresentativeHashes();
      for (let j = 0; j <= i && j < 10; ++j) {
        expect(repHashes[j]).toBe(blocks[blocks.length - 1 - j].block.hash);
      }
      for (let j = 2; 7 + (1 << j) <= i; ++j) {
        expect(repHashes[8 + j]).toBe(blocks[blocks.length - 1 - (7 + (1 << j))].block.hash);
      }
    }
  });

  it('Update Listener linear', async () => {
    let updateEpoch = 0;
    let updateLength = 0;
    let updateCommon = 0;

    const bc = await Blockchain.create(":memory:", null);
    bc.addListener((newDepth, commonDepth) => {
      updateEpoch++;
      updateLength = newDepth;
      updateCommon = commonDepth;
    });

    expect(updateEpoch).toBe(0);
    expect(updateLength).toBe(0);
    expect(updateCommon).toBe(0);
    const b0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});
    expect((await bc.addBlock(b0.block)).result).toBe(true);
    expect(updateEpoch).toBe(1);
    expect(updateLength).toBe(1);
    expect(updateCommon).toBe(0);
    const b1 = Block.debugMine(b0, kp.pubSerialized, {});
    expect((await bc.addBlock(b1.block)).result).toBe(true);
    expect(updateEpoch).toBe(2);
    expect(updateLength).toBe(2);
    expect(updateCommon).toBe(1);
  });

  it('Update Listener branched', async () => {
    let updateEpoch = 0;
    let updateLength = 0;
    let updateCommon = 0;

    const bc = await Blockchain.create(":memory:", null);
    bc.addListener((newDepth, commonDepth) => {
      updateEpoch++;
      updateLength = newDepth;
      updateCommon = commonDepth;
    });

    expect(updateEpoch).toBe(0);
    expect(updateLength).toBe(0);
    expect(updateCommon).toBe(0);
    const b0 = Block.debugMine(Block.debugGenesis(), kp.pubSerialized, {});
    expect((await bc.addBlock(b0.block)).result).toBe(true);
    expect(updateEpoch).toBe(1);
    expect(updateLength).toBe(1);
    expect(updateCommon).toBe(0);
    const b11 = Block.debugMine(b0, kp.pubSerialized, {});
    expect((await bc.addBlock(b11.block)).result).toBe(true);
    expect(updateEpoch).toBe(2);
    expect(updateLength).toBe(2);
    expect(updateCommon).toBe(1);
    const b21 = Block.debugMine(b0, kp2.pubSerialized, {});
    expect((await bc.addBlock(b21.block)).result).toBe(true);
    expect(updateEpoch).toBe(2);
    const b22 = Block.debugMine(b21, kp2.pubSerialized, {});
    expect((await bc.addBlock(b22.block)).result).toBe(true);
    expect(updateEpoch).toBe(3);
    expect(updateLength).toBe(3);
    expect(updateCommon).toBe(1);
  });
});