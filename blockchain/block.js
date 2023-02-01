const ChainUtil = require('../chain-util');
const { DIFFICULTY, MINE_RATE } = require('../constants');

function concatIfNotUndefined(concatTo, prefix, concatting) {
  if (typeof concatting !== "undefined" && concatting.length !== 0) {
    return concatTo + `${prefix}${concatting}`;
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

class Block {
  constructor(timestamp, lastHash, hash, reward, payments, sensorRegistrations, brokerRegistrations, integrations, nonce, difficulty) {
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

  static hash(timestamp, lastHash, reward, payments, sensorRegistrations, brokerRegistrations, integrations, nonce, difficulty) {
    //backwards compatible hashing:
    //if we add a new type of thing to the chain, the hash of previous blocks won't change as it will be undefined
    let hashing = `${timestamp}${lastHash}${nonce}${difficulty}${reward}`;
    hashing = concatIfNotUndefined(hashing, 'payments', payments);
    hashing = concatIfNotUndefined(hashing, 'sensorRegistrations', sensorRegistrations);
    hashing = concatIfNotUndefined(hashing, 'brokerRegistrations', brokerRegistrations);
    hashing = concatIfNotUndefined(hashing, 'integrations', integrations);

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

  static debugMine(lastBlock, reward, payments, sensorRegistrations,brokerRegistrations,integrations) {
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
      nonce,
      difficulty);
  }
}

module.exports = Block;