const Block = require('./block');
const N3 = require('n3');
const DataFactory = require('n3').DataFactory;
const Payment = require('./payment');
const SensorRegistration = require('./sensor-registration');
const BrokerRegistration = require('./broker-registration');
const Integration = require('./integration');
const Compensation = require('./compensation');
const fs = require('fs');
const ChainUtil = require('../chain-util');
const {
  MINING_REWARD} = require('../constants');

function makeIntegrationKey(publicKey, counter) {
  return `${publicKey}/${counter}`;
}

class PropertyHistory {
  constructor(backing) {
    this.undos = [];
    this.current = {};
    if (typeof backing === "undefined") {
      this.backing = null;
    } else {
      this.backing = backing;
    }
  }

  getClone(key, fallback) {
    if (key in this.current) {
      return this.current[key];
    } else if (this.backing !== null) {
      return this.backing.getClone(key);
    } else {
      if (typeof fallback === "undefined" || fallback === null) {
        return null;
      } else {
        return fallback;
      }
    }
  }

  undo() {
    if (this.undos.length === 0) {
      return;
    }

    const undoing = this.undos[this.undos.length - 1];

    for (const key in undoing) {
      const value = undoing[key];

      if (value === null) {
        delete this.current[key];
      } else {
        this.current[key] = value;
      }
    }

    this.undos.pop();
  }

  add(adding) {
    const undoer = {};

    for (const key in adding) {
      const value = adding[key];

      //if doesn't exist, is null
      const existing = this.getClone(key);
      undoer[key] = existing;
      this.current[key] = value;
    }

    this.undos.push(undoer);
  }

  finish() {
    if (this.backing === null) {
      throw new Error("Finishing Property History with null backing");
    }

    this.backing.undos.push(...this.undos);
    Object.assign(this.backing.current, this.current);

    this.backing = null;
  }

  clone() {
    const returning = new PropertyHistory();
    returning.undos = [...this.undos];
    returning.current = Object.assign({}, this.current);

    return returning;
  }
}

const FALLBACK_BALANCE = {
  balance: 0,
  counter: 0
};

function getPropertyClone(propertyHistory, key, fallback) {
  const found = propertyHistory.getClone(key);
  if (found !== null) {
    return Object.assign({}, found);
  } else {
    if (typeof fallback === "undefined" || fallback === null) {
      return null;
    } else {
      return Object.assign({}, fallback);
    }
  }
}

class Updater {
  constructor(parent, block) {
    this.parent = parent;
    this.block = block;
    this.balances = {};
    this.sensors = {};
    this.brokers = {};
    this.integrations = {};
    this.store = new N3.Store();

    if (block !== null) {
      this.store.addQuad(
        DataFactory.namedNode(this.block.hash),
        DataFactory.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
        DataFactory.namedNode("http://SSM/Block"));

      this.store.addQuad(
        DataFactory.namedNode(this.block.hash),
        DataFactory.namedNode("http://SSM/lastBlock"),
        DataFactory.namedNode(this.parent.getBlockFromTop(0).hash));
    }
  }

  getBalanceCopy(publicKey) {
    if (publicKey in this.balances) {
      return Object.assign({}, this.balances[publicKey]);
    } else {
      return this.parent.getBalanceCopy(publicKey);
    }
  }

  setBalance(publicKey, balance) {
    this.balances[publicKey] = balance;
  }

  getSensorCopy(key) {
    if (key in this.sensors) {
      return Object.assign({}, this.sensors[key]);
    } else {
      return this.parent.getSensorCopy(key);
    }
  }

  setSensor(key, sensor) {
    this.sensors[key] = sensor;
  }

  getBrokerCopy(key) {
    if (key in this.brokers) {
      return Object.assign({}, this.brokers[key]);
    } else {
      return this.parent.getBrokerCopy(key);
    }
  }

  setBroker(key, broker) {
    this.brokers[key] = broker;
  }

  getBrokerPublicKeys() {
    const keys = this.parent.getBrokerPublicKeysSet();

    for (const [key, value] of this.brokers) {
      keys.add(value.input);
    }

    return Array.from(keys);
  }

  getIntegrationCopy(key) {
    if (key in this.integrations) {
      return Object.assign({}, this.integrations[key]);
    } else {
      return this.parent.getIntegrationCopy(key);
    }
  }

  setIntegration(key, integration) {
    this.integrations[key] = integration;
  }

  finish() {
    if (this.parent === null) {
      throw new Error("Finishing Blockchain Metadata with null parent");
    }
    if (this.block === null) {
      throw new Error("Finish Blockchain Metadata with a null block");
    }

    this.parent.blocks.push(this.block);
    this.parent.balances.add(this.balances);
    this.parent.sensors.add(this.sensors);
    this.parent.brokers.add(this.brokers);
    this.parent.integrations.add(this.integrations);
    this.parent.stores.push(this.store);

    this.parent = null;
  }
}

class Chain {
  constructor(parent) {
    if (typeof parent === "undefined" || parent === null) {
      this.parent = null;
      this.blocks = [Block.genesis()];
      this.balances = new PropertyHistory();
      this.sensors = new PropertyHistory();
      this.brokers = new PropertyHistory();
      this.integrations = new PropertyHistory();
    } else {
      this.parent = parent;
      this.blocks = [];
      this.balances = new PropertyHistory(parent.balances);
      this.sensors = new PropertyHistory(parent.sensors);
      this.brokers = new PropertyHistory(parent.brokers);
      this.integrations = new PropertyHistory(parent.integrations);
    }
    this.stores = [];
  }

  getBlockFromTop(i) {
    //block is in our list
    if (i < this.blocks.length) {
      return this.blocks[this.blocks.length - i - 1];
    }

    //block is in parent, if we have a parent
    if (this.parent !== null) {
      //shift the index so it's relative to parent
      return this.parent.getBlockFromTop(i - this.blocks.length);
    } else {
      return null;
    }
  }

  length() {
    if (this.parent !== null) {
      return this.parent.length() + this.blocks.length;
    } else {
      return this.blocks.length;
    }
  }

  getBalanceCopy(publicKey) {
    return getPropertyClone(this.balances, publicKey, FALLBACK_BALANCE);
  }

  getSensorCopy(key) {
    return getPropertyClone(this.sensors, key);
  }

  getSensorsMap() {
    let returning;
    if (this.parent !== null) {
      returning = this.parent.getSensorsMap();
    } else {
      returning = new Map();
    }

    for (const [key, value] of Object.entries(this.sensors.current)) {
      returning.set(key, value);
    }

    return returning;
  }

  getBrokerCopy(key) {
    return getPropertyClone(this.brokers, key);
  }

  getBrokerKeysSet() {
    let returning;
    if (this.parent !== null) {
      returning = this.parent.getBrokerKeysSet();
    } else {
      returning = new Set();
    }

    for (const key of Object.keys(this.brokers.current)) {
      returning.add(key);
    }

    return returning;
  }

  getIntegrationCopy(key) {
    return getPropertyClone(this.integrations, key);
  }

  createUpdater(block) {
    return new Updater(this, block);
  }

  undo() {
    if (this.blocks.length === 0) {
      throw new Error("Cannot undo chain, no blocks");
    }

    this.blocks.pop();
    this.balances.undo();
    this.sensors.undo();
    this.brokers.undo();
    this.integrations.undo();
    this.stores.pop();
  }

  clone() {
    const cloned = new Chain(this.parent);
    cloned.blocks = [...this.blocks];
    cloned.balances = this.balances.clone();
    cloned.sensors = this.sensors.clone();
    cloned.brokers = this.brokers.clone();
    cloned.integrations = this.integrations.clone();
    cloned.stores = [...this.stores];
    return cloned;
  }

  finish() {
    if (this.parent === null) {
      throw new Error("Finishing Blockchain Metadata with null parent");
    }

    this.parent.blocks.push(...this.blocks);
    this.balances.finish();
    this.sensors.finish();
    this.brokers.finish();
    this.integrations.finish();
    this.parent.stores.push(...this.stores);

    this.parent = null;
  }
}

function addRDF(store, metadata) {
  for (const triple of metadata) {
    store.addQuad(DataFactory.quad(
      DataFactory.namedNode(triple.s),
      DataFactory.namedNode(triple.p),
      DataFactory.namedNode(triple.o)));
  }
}

function stepPayment(updater, reward, payment) {
  const verifyRes = Payment.verify(payment);
  if (!verifyRes.result) {
    return {
      result: false,
      reason: "couldn't verify a payment: " + verifyRes.reason
    };
  }

  const inputBalance = updater.getBalanceCopy(payment.input);

  if (payment.counter <= inputBalance.counter) {
    return {
      result: false,
      reason: "payment has invalid counter"
    };
  }
  inputBalance.counter = payment.counter;

  //first loop is to check it can be payed, and spends, second loop does the paying
  if (inputBalance.balance < payment.rewardAmount) {
    return {
      result: false,
      reason: "payment rewarding more than they have"
    };
  }
  inputBalance.balance -= payment.rewardAmount;

  for (const output of payment.outputs) {
    if (inputBalance.balance < output.amount) {
      return {
        result: false,
        reason: "payment spending more than they have"
      };
    }
    inputBalance.balance -= output.amount;
  }

  updater.setBalance(payment.input, inputBalance);

  for (const output of payment.outputs) {
    const outputBalance = updater.getBalanceCopy(output.publicKey);
    outputBalance.balance += output.amount;
    updater.setBalance(output.publicKey, outputBalance);
  }
  const rewardBalance = updater.getBalanceCopy(reward);
  rewardBalance.balance += payment.rewardAmount;
  updater.setBalance(rewardBalance);

  return {
    result: true
  };
}

function stepIntegration(updater, reward, integration) {
  const verifyRes = Integration.verify(integration);
  if (!verifyRes.result) {
    return {
      result: false,
      reason: "couldn't verify a integration: " + verifyRes.reason
    };
  }

  const inputBalance = updater.getBalanceCopy(integration.input);

  if (integration.counter <= inputBalance.counter) {
    return {
      result: false,
      reason: "integration has invalid counter"
    };
  }
  inputBalance.counter = integration.counter;

  //first loop is to check it can be payed, and spends, second loop does the paying
  if (inputBalance.balance < integration.rewardAmount) {
    return {
      result: false,
      reason: "integration rewarding more than they have"
    };
  }
  inputBalance.balance -= integration.rewardAmount;

  for (const output of integration.outputs) {
    const foundSensor = updater.getSensorCopy(output.sensor);

    if (foundSensor === null) {
      return {
        result: false,
        reason: `Integration references non-existant sensor: ${output.sensor}`
      };
    }
    if (foundSensor.counter !== output.counter) {
      return {
        result: false,
        reason: "Integration references non-current version of sensor"
      };
    }
    if (inputBalance.balance < output.amount) {
      return {
        result: false,
        reason: "integration spending more than they have"
      };
    }
    inputBalance.balance -= output.amount;
  }
  updater.setBalance(integration.input, inputBalance);

  const rewardBalance = updater.getBalanceCopy(reward);
  rewardBalance.balance += integration.rewardAmount;
  updater.setBalance(reward, rewardBalance);

  const integrationCopy = Object.assign({}, integration);
  const brokers = updater.getBrokerKeys();

  const witnesses = Integration.chooseWitnesses(integration, brokers);

  integrationCopy.witnesses = {};
  integrationCopy.compensationCount = 0;

  for (const witness of witnesses) {
    integrationCopy.witnesses[witness] = false;
  }

  updater.setIntegration(makeIntegrationKey(integration.input, integration.counter), integrationCopy);

  return {
    result: true
  };
}

function stepCompensation(updater, reward, compensation) {
  const verifyRes = Compensation.verify(compensation);

  if (!verifyRes.result) {
    return {
      result: false,
      reason: "Couldn't verify a compensation: " + verifyRes.reason
    };
  }

  const integrationKey = makeIntegrationKey(compensation.integration.input, compensation.integration.counter);

  const foundIntegration = updater.getIntegrationCopy(integrationKey);

  if (foundIntegration === null) {
    return {
      result: false,
      reason: `Couldn't find integration '${integrationKey}' referenced by compensation`
    };
  }

  const foundBroker = updater.getBrokerCopy(compensation.brokerName);

  if (foundBroker === null) {
    return {
      result: false,
      reason: `Couldn't find broker '${compensation.brokerName}' referenced by compensation`
    };
  }

  if (foundBroker.input !== compensation.input) {
    return {
      result: false,
      reason: "Broker's owner doesn't match compensation's input"
    };
  }

  if (!(compensation.brokerName in foundIntegration.witnesses)) {
    return {
      result: false,
      reason: "Broker that is compensating isn't a witness for the integration"
    };
  }

  if (foundIntegration.witnesses[compensation.brokerName]) {
    return {
      result: false,
      reason: "Broker that is compensating has already compensated"
    };
  }

  foundIntegration.witnesses[compensation.brokerName] = true;
  ++foundIntegration.compensationCount;

  if (foundIntegration.compensationCount === Math.ceil(foundIntegration.witnessCount / 2)) {
    const integrateeBalance = updater.getBalanceCopy(foundIntegration.input);
    for (const output of foundIntegration.outputs) {
      integrateeBalance.balance += output.amount;
    }
    updater.setBalance(foundIntegration.input, integrateeBalance);
  }

  updater.setIntegration(integrationKey, foundIntegration);

  return {
    result: true
  };
}

function stepSensorRegistration(updater, reward, sensorRegistration) {
  const verifyRes = SensorRegistration.verify(sensorRegistration);
  if (!verifyRes.result) {
    return {
      result: false,
      reason: "Couldn't verify a sensor registration: " + verifyRes.reason
    };
  }

  const extInfo = SensorRegistration.getExtInformation(sensorRegistration);

  if (!extInfo.result) {
    return {
      result: false,
      reason: "Couldn't get sensor registration ext information: " + extInfo.reason
    };
  }

  const foundBroker = updater.getBrokerCopy(extInfo.metadata.integrationBroker);

  if (foundBroker === null) {
    return {
      result: false,
      reason: "Couldn't find sensor registration's nominated broker in the broker list"
    };
  }

  const inputBalance = updater.getBalanceCopy(sensorRegistration.input);

  if (sensorRegistration.counter <= inputBalance.counter) {
    return {
      result: false,
      reason: "Sensor registration has invalid counter"
    };
  }
  inputBalance.counter = sensorRegistration.counter;

  if (inputBalance.balance < sensorRegistration.rewardAmount) {
    return {
      result: false,
      reason: "Sensor registration rewarding more than they have"
    };
  }
  inputBalance.balance -= sensorRegistration.rewardAmount;

  updater.setBalance(sensorRegistration.input, inputBalance);

  const rewardBalance = updater.getBalanceCopy(reward);
  rewardBalance.balance += sensorRegistration.rewardAmount;
  updater.setBalance(reward, rewardBalance);

  addRDF(updater.store, sensorRegistration.metadata);

  const newSensor = extInfo.metadata;
  updater.store.addQuad(
    DataFactory.namedNode(newSensor.sensorName),
    DataFactory.namedNode("http://SSM/transactionCounter"),
    DataFactory.literal(sensorRegistration.counter));
  updater.store.addQuad(
    DataFactory.namedNode(newSensor.sensorName),
    DataFactory.namedNode("http://SSM/OwnedBy"),
    DataFactory.namedNode("http://SSM/Wallet/" + sensorRegistration.input));
  updater.store.addQuad(
    DataFactory.namedNode(updater.block.hash),
    DataFactory.namedNode("http://SSM/Transaction"),
    DataFactory.namedNode(newSensor.sensorName));
  updater.store.addQuad(
    DataFactory.namedNode(updater.block.hash),
    DataFactory.namedNode("http://SSM/SensorRegistration"),
    DataFactory.namedNode(newSensor.sensorName));

  newSensor.counter = sensorRegistration.counter;
  updater.setSensor(newSensor.sensorName, newSensor);

  return {
    result: true
  };
}

function stepBrokerRegistration(updater, reward, brokerRegistration) {
  const verifyRes = BrokerRegistration.verify(brokerRegistration);
  if (!verifyRes.result) {
    return {
      result: false,
      reason: "Couldn't verify a broker registration: " + verifyRes.reason
    };
  }

  const extInfo = BrokerRegistration.getExtInformation(brokerRegistration);

  if (!extInfo.result) {
    return {
      result: false,
      reason: "Couldn't get broker registration ext information: " + extInfo.reason
    };
  }

  const inputBalance = updater.getBalanceCopy(brokerRegistration.input);

  if (brokerRegistration.counter <= inputBalance.counter) {
    return {
      result: false,
      reason: "Broker registration has invalid counter"
    };
  }
  inputBalance.counter = brokerRegistration.counter;

  if (inputBalance.balance < brokerRegistration.rewardAmount) {
    return {
      result: false,
      reason: "Broker registration rewarding more than they have"
    };
  }
  inputBalance.balance -= brokerRegistration.rewardAmount;

  updater.setBalance(brokerRegistration.input, inputBalance);

  const rewardBalance = updater.getBalanceCopy(reward);
  rewardBalance.balance += brokerRegistration.rewardAmount;
  updater.setBalance(reward, rewardBalance);

  addRDF(updater.store, brokerRegistration.metadata);

  const newBroker = extInfo.metadata;
  newBroker.input = brokerRegistration.input;
  updater.store.addQuad(
    DataFactory.namedNode(newBroker.brokerName),
    DataFactory.namedNode("http://SSM/transactionCounter"),
    DataFactory.literal(brokerRegistration.counter));
  updater.store.addQuad(
    DataFactory.namedNode(newBroker.brokerName),
    DataFactory.namedNode("http://SSM/OwnedBy"),
    DataFactory.namedNode("http://SSM/Wallet/" + brokerRegistration.input));
  updater.store.addQuad(
    DataFactory.namedNode(updater.block.hash),
    DataFactory.namedNode("http://SSM/Transaction"),
    DataFactory.namedNode(newBroker.brokerName));
  updater.store.addQuad(
    DataFactory.namedNode(updater.block.hash),
    DataFactory.namedNode("http://SSM/BrokerRegistration"),
    DataFactory.namedNode(newBroker.brokerName));

  newBroker.counter = brokerRegistration.counter;
  updater.setBroker(newBroker.brokerName, newBroker);

  return {
    result: true
  };
}

function verifyTxs(updater, reward, payments, sensorRegistrations, brokerRegistrations, integrations, compensations) {
  const rewardBalanceCopy = updater.getBalanceCopy(reward);

  rewardBalanceCopy.balance += MINING_REWARD;

  updater.setBalance(reward, rewardBalanceCopy);

  for (const payment of payments) {
    const res = stepPayment(updater, reward, payment);
    if (!res.result) {
      return res;
    }
  }

  for (const integration of integrations) {
    const res = stepIntegration(updater, reward, integration);
    if (!res.result) {
      return res;
    }
  }

  for (const compensation of compensations) {
    const res = stepCompensation(updater, reward, compensation);
    if (!res.result) {
      return res;
    }
  }

  for (const brokerRegistration of brokerRegistrations) {
    const res = stepBrokerRegistration(updater, reward, brokerRegistration);
    if (!res.result) {
      return res;
    }
  }

  for (const sensorRegistration of sensorRegistrations) {
    const res = stepSensorRegistration(updater, reward, sensorRegistration);
    if (!res.result) {
      return res;
    }
  }

  return {
    result: true,
  };
}

function verifyBlockHash(prevBlock, block) {
  if (block.lastHash !== prevBlock.hash) {
    return {
      result: false,
      reason: "last hash didn't match our last hash"
    };
  }
  //TODO how to check if new block's timestamp is believable
  if (block.difficulty !== Block.adjustDifficulty(prevBlock, block.timestamp)) {
    return {
      result: false,
      reason: "difficulty is incorrect"
    };
  }
  if (!Block.checkHash(block)) {
    return {
      result: false,
      reason: "hash is invalid failed"
    };
  }

  return {
    result: true
  };
}

function verifyBlock(updater, prevBlock, verifyingBlock) {
  const verifyHashRes = verifyBlockHash(prevBlock, verifyingBlock);

  if (!verifyHashRes.result) {
    return verifyHashRes;
  }

  return verifyTxs(updater, verifyingBlock.reward,
    Block.getPayments(verifyingBlock),
    Block.getSensorRegistrations(verifyingBlock),
    Block.getBrokerRegistrations(verifyingBlock),
    Block.getIntegrations(verifyingBlock),
    Block.getCompensations(verifyingBlock));
}

function verifyBlocks(blocks, start_index, parentChain) {
  if (blocks.length === 0) {
    return {
      result: false,
      reason: "zero length"
    };
  }
  if (ChainUtil.stableStringify(blocks[0]) !== ChainUtil.stableStringify(Block.genesis())) {
    return {
      result: false,
      reason: "initial block isn't genesis"
    };
  }

  const newChain = new Chain(parentChain);

  for (let i = start_index; i < blocks.length; i++) {
    const block = blocks[i];
    const prevBlock = blocks[i - 1];

    const updater = newChain.createUpdater(block);

    const verifyResult = verifyBlock(updater, prevBlock, block);

    if (verifyResult.result === false) {
      return {
        result: false,
        reason: `Chain is invalid on block ${i}: ${verifyResult.reason}`
      };
    }

    updater.finish();
  }

  return {
    result: true,
    newChain: newChain
  };
}

//returns the first index where the two chains differ, checking the new chain for correct hashes
function findBlocksDifference(oldBlocks, newBlocks) {
  for (let i = 1; i < oldBlocks.length; ++i) {
    const verifyRes = verifyBlockHash(newBlocks[i - 1], newBlocks[i]);

    if (!verifyRes.result) {
      return {
        result: false,
        reason: `Couldn't verify hashes for block ${i}: ${verifyRes.reason}`
      };
    }

    if (oldBlocks[i].hash !== newBlocks[i].hash) {
      return {
        result: true,
        difference: i
      }
    }
  }
  return {
    result: true,
    difference: oldBlocks.length
  };
}


function saveToDisk(blockchain, location) {
  try {
    fs.writeFileSync(
      location,
      blockchain.serialize());
  } catch (err) {
    console.log(`Couldn't save blockchain to disk: ${err}`);
    return false;
  }
  return true;
}

function onChange(blockchain, newBlocks, oldBlocks, difference) {
  if (blockchain.persisting !== null) {
    saveToDisk(blockchain, blockchain.persisting);
  }
  for (const listener of blockchain.listeners) {
    listener(newBlocks, oldBlocks, difference);
  }
}

class Blockchain {
  constructor() {
    this.chain = new Chain();
    this.listeners = [];
    this.persisting = null;
  }

  getBalanceCopy(publicKey) {
    return this.chain.getBalanceCopy(publicKey);
  }

  getSensorInfo(sensorName) {
    return this.chain.getSensorCopy(sensorName);
  }

  getSensors() {
    const sensorsMap = this.chain.getSensorsMap();

    const returning = {};

    for (const [key, value] of sensorsMap) {
      returning[key] = value;
    }

    return returning;
  }

  getBrokerInfo(brokerName) {
    return this.chain.getBrokerCopy(brokerName);
  }

  blocks() {
    return this.chain.blocks;
  }

  lastBlock() {
    return this.chain.getBlockFromTop(0);
  }

  serialize() {
    return JSON.stringify(this.chain.blocks);
  }

  static deserialize(serialized) {
    return JSON.parse(serialized);
  }

  static loadFromDisk(location) {
    //possible race if deleted after check, but we live with it I guess

    const returning = new Blockchain();
    returning.persisting = location;

    if (fs.existsSync(location)) {
      const rawPersistedChain = fs.readFileSync(location, 'utf8');
      const deserialized = Blockchain.deserialize(rawPersistedChain);
      const replaceResult = returning.replaceChain(deserialized);
      if (!replaceResult.result) {
        console.log(`Couldn't deserialize chain at '${location}', starting from genesis: ${replaceResult.reason}`);
      }
    } else {
      console.log("Didn't find a persisted chain, starting from genesis");
    }

    return returning;
  }

  //adds an existing block to the blockchain, returns false if the block can't be added, true if it was added
  addBlock(newBlock) {

    const updater = this.chain.createUpdater(newBlock);

    const verifyResult = verifyBlock(updater, this.lastBlock(), newBlock);

    if (!verifyResult.result) {
      console.log(`Couldn't add block: ${verifyResult.reason}`);
      return false;
    }

    updater.finish();

    onChange(this, this.blocks(), this.blocks().slice(0,-1), this.blocks().length - 1);

    return true;
  }

  wouldBeValidBlock(rewardee, payments, sensorRegistrations, brokerRegistrations, integrations) {
    const updater = this.chain.createUpdater(null);
    return verifyTxs(updater, rewardee, payments, sensorRegistrations, brokerRegistrations, integrations).result;
  }

  static isValidChain(blocks) {
    const res = verifyBlocks(blocks, 1, new Chain());

    return res.result;
  }

  //return result: false on fail, result: true on success
  //TODO: faster verification of the new chain by only verifying from divergence, would require saving some historical balance state
  replaceChain(newChain) {
    if (newChain.length <= this.chain.length()) {
      return {
        result: false,
        reason: "Received chain is not longer than the current chain."
      };
    }

    //find where they differ
    const chainDifferenceRes = findBlocksDifference(this.chain.blocks, newChain);

    if (!chainDifferenceRes.result) {
      return chainDifferenceRes;
    }

    const baseChain = this.chain.clone();
    const baseChainLength = baseChain.length();

    for (let i = baseChainLength - 1; i >= chainDifferenceRes.difference; i--) {
      baseChain.undo();
    }

    const verifyResult = verifyBlocks(newChain, chainDifferenceRes.difference, baseChain);
    if (!verifyResult.result) {
      return {
        result: false,
        reason: `The received chain is not valid: ${verifyResult.reason}`
      };
    }

    //Replacing blockchain with the new chain

    const oldChain = this.chain;
    this.chain = baseChain;
    verifyResult.newChain.finish();

    onChange(this, this.blocks(), oldChain, chainDifferenceRes.difference);

    return {
      result: true,
      chainDifference: chainDifferenceRes.difference,
    };
  }

  addListener(listener) {
    this.listeners.push(listener);
  }
}

module.exports = Blockchain;