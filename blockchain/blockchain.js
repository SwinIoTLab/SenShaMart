const Block = require('./block');
const N3 = require('n3');
const DataFactory = require('n3').DataFactory;
const Payment = require('./payment');
const SensorRegistration = require('./sensor-registration');
const BrokerRegistration = require('./broker-registration');
const Integration = require('./integration');
const fs = require('fs');
const ChainUtil = require('../chain-util');
const {
  MINING_REWARD} = require('../constants');

function addRDF(store, metadata) {
  for (const triple of metadata) {
    store.addQuad(DataFactory.quad(
      DataFactory.namedNode(triple.s),
      DataFactory.namedNode(triple.p),
      DataFactory.namedNode(triple.o)));
  }
}

function getBalanceCopyGeneric(publicKey, maps) {
  for (const map of maps) {
    if (map.hasOwnProperty(publicKey)) {
      const found = map[publicKey];
      return {
        balance: found.balance,
        counter: found.counter
      };
    }
  }

  return {
    balance: 0,
    counter: 0
  };
}

function verifyPayment(changedBalances, prevBalances, reward, payment) {
  const verifyRes = Payment.verify(payment);
  if (!verifyRes.result) {
    return {
      result: false,
      reason: "couldn't verify a payment: " + verifyRes.reason
    };
  }

  const inputBalance = getBalanceCopyGeneric(payment.input, [changedBalances, prevBalances]);

  if (payment.counter <= inputBalance.counter) {
    return {
      result: false,
      reason: "payment has invalid counter"
    };
  }
  inputBalance.counter = payment.counter;

  //first loop is to check it can be payed, second loop does the paying
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
  changedBalances[payment.input] = inputBalance;

  for (const output of payment.outputs) {
    const outputBalance = getBalanceCopyGeneric(output.publicKey, [changedBalances, prevBalances]);
    outputBalance.balance += output.amount;
    changedBalances[output.publicKey] = outputBalance;
  }
  const rewardBalance = getBalanceCopyGeneric(reward, [changedBalances, prevBalances]);
  rewardBalance.balance += payment.rewardAmount;
  changedBalances[reward] = rewardBalance;

  return {
    result: true
  };
}

function verifyIntegration(changedBalances, prevBalances, reward, integration) {
  const verifyRes = Integration.verify(integration);
  if (!verifyRes.result) {
    return {
      result: false,
      reason: "couldn't verify a integration: " + verifyRes.reason
    };
  }

  const inputBalance = getBalanceCopyGeneric(integration.input, [changedBalances, prevBalances]);

  if (integration.counter <= inputBalance.counter) {
    return {
      result: false,
      reason: "integration has invalid counter"
    };
  }
  inputBalance.counter = integration.counter;

  //first loop is to check it can be payed, second loop does the paying
  if (inputBalance.balance < integration.rewardAmount) {
    return {
      result: false,
      reason: "integration rewarding more than they have"
    };
  }
  inputBalance.balance -= integration.rewardAmount;

  for (const output of integration.outputs) {
    if (inputBalance.balance < output.amount) {
      return {
        result: false,
        reason: "integration spending more than they have"
      };
    }
    inputBalance.balance -= output.amount;
  }
  changedBalances[integration.input] = inputBalance;

  for (const output of integration.outputs) {
    const outputBalance = getBalanceCopyGeneric(output.publicKey, [changedBalances, prevBalances]);
    outputBalance.balance += output.amount;
    changedBalances[output.publicKey] = outputBalance;
  }
  const rewardBalance = getBalanceCopyGeneric(reward, [changedBalances, prevBalances]);
  rewardBalance.balance += integration.rewardAmount;
  changedBalances[reward] = rewardBalance;

  return {
    result: true
  };
}

function verifySensorRegistration(changedBalances, prevBalances, reward, sensorRegistration, brokers) {
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
      reason: "Couldn't get sensor registration ext information: " + extMetadata.reason
    };
  }

  if (!(extInfo.metadata.integrationBroker in brokers)) {
    console.log(brokers);
    console.log(extInfo.metadata.integrationBroker);
    return {
      result: false,
      reason: "Couldn't find sensor registration's nominated broker in the broker list"
    };
  }

  const inputBalance = getBalanceCopyGeneric(sensorRegistration.input, [changedBalances, prevBalances]);

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

  changedBalances[sensorRegistration.input] = inputBalance;

  const rewardBalance = getBalanceCopyGeneric(reward, [changedBalances, prevBalances]);
  rewardBalance.balance += sensorRegistration.rewardAmount;
  changedBalances[reward] = rewardBalance;

  return {
    result: true
  };
}

function verifyBrokerRegistration(changedBalances, prevBalances, reward, brokerRegistration) {
  const verifyRes = BrokerRegistration.verify(brokerRegistration);
  if (!verifyRes.result) {
    return {
      result: false,
      reason: "Couldn't verify a broker registration: " + verifyRes.reason
    };
  }

  const inputBalance = getBalanceCopyGeneric(brokerRegistration.input, [changedBalances, prevBalances]);

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

  changedBalances[brokerRegistration.input] = inputBalance;

  const rewardBalance = getBalanceCopyGeneric(reward, [changedBalances, prevBalances]);
  rewardBalance.balance += brokerRegistration.rewardAmount;
  changedBalances[reward] = rewardBalance;

  return {
    result: true
  };
}

function verifyTxs(prevBalances, reward, brokers, payments, sensorRegistrations, brokerRegistrations, integrations) {
  const changedBalances = {};

  const rewardBalanceCopy = getBalanceCopyGeneric(reward, [prevBalances]);

  changedBalances[reward] = {
    balance: rewardBalanceCopy.balance + MINING_REWARD,
    counter: rewardBalanceCopy.counter
  };

  for (const payment of payments) {
    const res = verifyPayment(changedBalances, prevBalances, reward, payment);
    if (!res.result) {
      return res;
    }
  }

  for (const integration of integrations) {
    const res = verifyIntegration(changedBalances, prevBalances, reward, integration);
    if (!res.result) {
      return res;
    }
  }

  for (const brokerRegistration of brokerRegistrations) {
    const res = verifyBrokerRegistration(changedBalances, prevBalances, reward, brokerRegistration);
    if (!res.result) {
      return res;
    }
  }

  for (const sensorRegistration of sensorRegistrations) {
    const res = verifySensorRegistration(changedBalances, prevBalances, reward, sensorRegistration, brokers);
    if (!res.result) {
      return res;
    }
  }

  return {
    result: true,
    changedBalances: changedBalances
  };
}

function verifyBlock(prevBalances, prevBlock, verifyingBlock, brokers) {
  if (verifyingBlock.lastHash !== prevBlock.hash) {
    return {
      result: false,
      reason: "last hash didn't match our last hash"
    };
  }
  //TODO how to check if new block's timestamp is believable
  if (verifyingBlock.difficulty !== Block.adjustDifficulty(prevBlock, verifyingBlock.timestamp)) {
    return {
      result: false,
      reason: "difficulty is incorrect"
    };
  }
  if (!Block.checkHash(verifyingBlock)) {
    return {
      result: false,
      reason: "hash is invalid failed"
    };
  }

  return verifyTxs(prevBalances, verifyingBlock.reward, brokers,
    Block.getPayments(verifyingBlock),
    Block.getSensorRegistrations(verifyingBlock),
    Block.getBrokerRegistrations(verifyingBlock),
    Block.getIntegrations(verifyingBlock));
}

function verifyChain(chain) {
  if (chain.length === 0) {
    return {
      result: false,
      reason: "zero length"
    };
  }
  if (ChainUtil.stableStringify(chain[0]) !== ChainUtil.stableStringify(Block.genesis())) {
    return {
      result: false,
      reason: "initial block isn't genesis"
    };
  }

  const balances = {};
  const brokers = {};

  for (let i = 1; i < chain.length; i++) {
    const block = chain[i];
    const lastBlock = chain[i - 1];

    const verifyResult = verifyBlock(balances, lastBlock, block, brokers);

    if (verifyResult.result === false) {
      return {
        result: false,
        reason: `Chain is invalid on block ${i}: ${verifyResult.reason}`
      };
    }

    for (const publicKey in verifyResult.changedBalances) {
      balances[publicKey] = verifyResult.changedBalances[publicKey];
    }

    const blockMetadata = getBlockMetadata(chain[i]);
    addBlockMetadata(brokers, blockMetadata.brokers);
  }

  return {
    result: true,
    balances: balances
  };
}

//returns the first index where the two chains differ
function findChainDifference(oldChain, newChain) {
  for (let i = 1; i < oldChain.length; ++i) {
    if (oldChain[i].hash !== newChain[i].hash) {
      return i;
    }
  }
  return oldChain.length;
}

function getBlockMetadata(block) {

  const returning = {
    sensors: {},
    brokers: {},
    store: new N3.Store()
  };

  returning.store.addQuad(
    DataFactory.namedNode(block.hash),
    DataFactory.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
    DataFactory.namedNode("http://SSM/Block"));
  returning.store.addQuad(
    DataFactory.namedNode(block.hash),
    DataFactory.namedNode("http://SSM/lastBlock"),
    DataFactory.namedNode(block.lastHash));

  for (const tx of Block.getSensorRegistrations(block)) {
    addRDF(returning.store, tx.metadata);

    const extData = SensorRegistration.getExtInformation(tx).metadata;
    returning.store.addQuad(
      DataFactory.namedNode(block.hash),
      DataFactory.namedNode("http://SSM/Transaction"),
      DataFactory.namedNode(extData.sensorName));
    returning.store.addQuad(
      DataFactory.namedNode(block.hash),
      DataFactory.namedNode("http://SSM/SensorRegistration"),
      DataFactory.namedNode(extData.sensorName));

    returning.sensors[extData.sensorName] = extData;
  }
  for (const tx of Block.getBrokerRegistrations(block)) {
    addRDF(returning.store, tx.metadata);

    const extData = BrokerRegistration.getExtInformation(tx).metadata;
    returning.store.addQuad(
      DataFactory.namedNode(block.hash),
      DataFactory.namedNode("http://SSM/Transaction"),
      DataFactory.namedNode(extData.brokerName));
    returning.store.addQuad(
      DataFactory.namedNode(block.hash),
      DataFactory.namedNode("http://SSM/SBrokerRegistration"),
      DataFactory.namedNode(extData.brokerName));

    returning.brokers[extData.brokerName] = extData;
  }

  return returning;
}

//returns the undoing object
function addBlockMetadata(map, metadatas) {

  const returning = {};

  for (const key in metadatas) {
    const value = metadatas[key];

    if (key in map) {
      returning[key] = map[key];
    } else {
      returning[key] = null;
    }

    map[key] = value;
  }
}

function undoBlockMetadata(map, undoer) {
  for (const key in undoer) {
    const value = undoer[key];

    if (value === null) {
      delete map[key];
    } else {
      map[key] = value;
    }
  }
}

class Blockchain {
  constructor() {
    this.chain = [Block.genesis()];
    this.balances = {};
    this.stores = [];
    this.sensors = {};
    this.sensorUndos = [];
    this.brokers = {};
    this.brokerUndos = [];
  }

  getBalanceCopy(publicKey) {
    return getBalanceCopyGeneric(publicKey, [this.balances]);
  }

  getSensorInfo(sensorName) {
    if (sensorName in this.sensors) {
      return this.sensors[sensorName];
    } else {
      return null;
    }
  }

  getBrokerInfo(brokerName) {
    if (brokerName in this.brokers) {
      return this.brokers[brokerName];
    } else {
      return null;
    }
  }

  lastBlock() {
    return this.chain[this.chain.length - 1];
  }

  serialize() {
    return JSON.stringify(this.chain);
  }

  static deserialize(serialized) {
    return JSON.parse(serialized);
  }

  saveToDisk(location) {
    try {
      fs.writeFileSync(
        location,
        this.serialize());
    } catch (err) {
      console.log(`Couldn't save blockchain to disk: ${err}`);
      return false;
    }
    return true;
  }

  static loadFromDisk(location) {
    //possible race if deleted after check, but we live with it I guess
    if (fs.existsSync(location)) {
      const rawPersistedChain = fs.readFileSync(location, 'utf8');
      const deserialized = Blockchain.deserialize(rawPersistedChain);
      const returning = new Blockchain();
      const replaceResult = returning.replaceChain(deserialized);
      if (!replaceResult.result) {
        console.log(`Couldn't deserialize chain at '${location}', starting from genesis`);
      }
      return returning;
    } else {
      console.log("Didn't find a persisted chain, starting from genesis");
      return new Blockchain();
    }
  }

  //adds an existing block to the blockchain, returns false if the block can't be added, true if it was added
  addBlock(newBlock) {
    const verifyResult = verifyBlock(this.balances, this.lastBlock(), newBlock, this.brokers);

    if (!verifyResult.result) {
      console.log(`Couldn't add block: ${verifyResult.reason}`);
      return false;
    }

    //all seems to be good, persist
    this.chain.push(newBlock);

    for (const publicKey in verifyResult.changedBalances) {
      this.balances[publicKey] = verifyResult.changedBalances[publicKey];
    }

    const metadata = getBlockMetadata(newBlock);

    this.stores.push(metadata.store);
    this.sensorUndos.push(addBlockMetadata(this.sensors, metadata.sensors));
    this.brokerUndos.push(addBlockMetadata(this.brokers, metadata.brokers));

    //console.log("Added new block");
    //console.log(newBlock);

    return true;
  }

  wouldBeValidBlock(rewardee, payments, sensorRegistrations, brokerRegistrations, integrations) {
    return verifyTxs(this.balances, rewardee, this.brokers, payments, sensorRegistrations, brokerRegistrations, integrations).result;
  }

  static isValidChain(chain) {
    const res = verifyChain(chain);

    return res.result;
  }

  //return result: false on fail, result: true on success
  //TODO: faster verification of the new chain by only verifying from divergence, would require saving some historical balance state
  replaceChain(newChain) {
    if (newChain.length <= this.chain.length) {
      return {
        result: false,
        reason: "Received chain is not longer than the current chain."
      };
    }
    const verifyResult = verifyChain(newChain);
    if (!verifyResult.result) {
      return {
        result: false,
        reason: `The received chain is not valid: ${verifyResult.reason}`
      };
    }

    //Replacing blockchain with the new chain

    const oldChain = this.chain;
    this.chain = newChain;

    //find where they differ
    const chainDifference = findChainDifference(oldChain, newChain);

    //fix metadata
    for (let i = oldChain.length - 1; i >= chainDifference; i--) {
      this.stores.pop();
      undoBlockMetadata(this.sensors, this.sensorUndos[i]);
      this.sensorUndos.pop();
      undoBlockMetadata(this.brokers, this.brokerUndos[i]);
      this.brokerUndos.pop();
    }
    for (let i = chainDifference; i < newChain.length; ++i) {
      const metadata = getBlockMetadata(newChain[i]);

      this.stores.push(metadata.store);
      this.sensorUndos.push(addBlockMetadata(this.sensors, metadata.sensors));
      this.brokerUndos.push(addBlockMetadata(this.brokers, metadata.brokers));
    }

    //fix balance
    this.balances = verifyResult.balances;

    return {
      result: true,
      chainDifference: chainDifference,
      oldChain: oldChain
    };
  }
}

module.exports = Blockchain;