const ChainUtil = require('../util/chain-util');
const { DIFFICULTY, MINE_RATE } = require('../util/constants');
const BrokerRegistration = require('./broker-registration');
const SensorRegistration = require('./sensor-registration');
const Integration = require('./integration');
const Payment = require('./payment');
const Compensation = require('./compensation');

function concatIfNotUndefined(concatTo, prefix, concatting) {
  if (typeof concatting !== "undefined" && concatting.length !== 0) {
    return concatTo + `${prefix}${concatting.signature}`;
  } else {
    return concatTo;
  }
}

function getData(block, key) {

  const got = block[key];

  if (typeof got !== "undefined" && got !== null) {
    return got;
  } else {
    return [];
  }
}

const baseValidation = {
  timestamp: ChainUtil.createValidateIsIntegerWithMin(0),
  lastHash: ChainUtil.validateIsString,
  hash: ChainUtil.validateIsString,
  reward: ChainUtil.validateIsPublicKey,
  nonce: ChainUtil.createValidateIsIntegerWithMin(0),
  difficulty: ChainUtil.createValidateIsIntegerWithMin(0),
  sensorRegistrations: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(SensorRegistration.verify)),
  brokerRegistrations: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(BrokerRegistration.verify)),
  integrations: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(Integration.verify)),
  compensations: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(Compensation.verify)),
  payments: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(Payment.verify))
}

class Block {
  constructor(timestamp, lastHash, hash, reward, payments, sensorRegistrations, brokerRegistrations, integrations, compensations, nonce, difficulty) {
    this.timestamp = timestamp;
    this.lastHash = lastHash;
    this.hash = hash;
    this.reward = reward;
    if (payments !== null && payments.length !== 0) {
      this.payments = payments;
    }
    if (sensorRegistrations !== null && sensorRegistrations.length !== 0) {
      this.sensorRegistrations = sensorRegistrations;
    }
    if (brokerRegistrations !== null && brokerRegistrations.length !== 0) {
      this.brokerRegistrations = brokerRegistrations;
    }
    if (integrations !== null && integrations.length !== 0) {
      this.integrations = integrations;
    }
    if (compensations !== null && compensations.length !== 0) {
      this.compensations = compensations;
    }
    this.nonce = nonce;
    if (difficulty === undefined) {
      this.difficulty = DIFFICULTY;
    } else {
      this.difficulty = difficulty;
    }
  }

  static getPayments(block) {
    return getData(block, "payments");
  }

  static getSensorRegistrations(block) {
    return getData(block, "sensorRegistrations");
  }

  static getBrokerRegistrations(block) {
    return getData(block, "brokerRegistrations");
  }

  static getIntegrations(block) {
    return getData(block, "integrations");
  }

  static getCompensations(block) {
    return getData(block, "compensations");
  }

  toString() {
    return `Block -
      Timestamp    : ${this.timestamp}
      Last Hash    : ${this.lastHash.substring(0, 10)}
      Hash         : ${this.hash.substring(0, 10)}
      Nonce        : ${this.nonce}
      Difficulty   : ${this.difficulty}
      Reward       : ${this.reward}
      Transactions : ${this.transactions}
      Metadatas    : ${this.metadatas}`;
  }

  static genesis() {
    return new this('Genesis time', '-----', 'f1r57-h45h', null, null, null, null, null, 0, DIFFICULTY);
  }

  static hash(timestamp, lastHash, reward, payments, sensorRegistrations, brokerRegistrations, integrations, compensations, nonce, difficulty) {
    //backwards compatible hashing:
    //if we add a new type of thing to the chain, the hash of previous blocks won't change as it will be undefined
    let hashing = `${timestamp}${lastHash}${nonce}${difficulty}${reward}`;
    hashing = concatIfNotUndefined(hashing, 'payments', payments);
    hashing = concatIfNotUndefined(hashing, 'sensorRegistrations', sensorRegistrations);
    hashing = concatIfNotUndefined(hashing, 'brokerRegistrations', brokerRegistrations);
    hashing = concatIfNotUndefined(hashing, 'integrations', integrations);
    hashing = concatIfNotUndefined(hashing, 'compensations', compensations);

    return ChainUtil.hash(hashing).toString();
  }

  static blockHash(block) {
    return Block.hash(
      block.timestamp,
      block.lastHash,
      block.reward,
      block.payments,
      block.sensorRegistrations,
      block.brokerRegistrations,
      block.integrations,
      block.compensations,
      block.nonce,
      block.difficulty);
  }

  //returns false if block's hash doesn't match internals
  static checkHash(block) {
    const computedHash = Block.blockHash(block);

    if (computedHash !== block.hash) {
      return false;
    }

    if (block.hash.substring(0, block.difficulty) !== '0'.repeat(block.difficulty)) {
      return false;
    }

    return true;
  }

  static adjustDifficulty(lastBlock, currentTime) {
    let prevDifficulty = lastBlock.difficulty;
    if (lastBlock.timestamp + MINE_RATE > currentTime) {
      return prevDifficulty + 1;
    } else {
      return Math.max(0, prevDifficulty - 1);
    }
  }

  static debugMine(lastBlock, reward, payments, sensorRegistrations,brokerRegistrations,integrations,compensations) {
    const timestamp = Date.now();
    const difficulty = Block.adjustDifficulty(lastBlock, timestamp);

    let nonce = 0;
    let hash = '';

    do {
      nonce++;
      hash = Block.hash(
        timestamp,
        lastBlock.hash,
        reward,
        payments,
        sensorRegistrations,
        brokerRegistrations,
        integrations,
        compensations,
        nonce,
        difficulty);
    } while (hash.substring(0, difficulty) !== '0'.repeat(difficulty));

    return new Block(
      timestamp,
      lastBlock.hash,
      hash,
      reward,
      payments,
      sensorRegistrations,
      brokerRegistrations,
      integrations,
      compensations,
      nonce,
      difficulty);
  }

  static verify(block) {
    const validationRes = ChainUtil.validateObject(block, baseValidation);

    if (!validationRes.result) {
      return validationRes;
    } 

    if (!Block.checkHash(block)) {
      return {
        result: false,
        reason: "Couldn't verify hash"
      };
    }

    return {
      result: true
    };
  }
}

module.exports = Block;