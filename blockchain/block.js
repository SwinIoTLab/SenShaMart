const ChainUtil = require('../chain-util');
const { DIFFICULTY, MINE_RATE } = require('../config');

function concatIfNotUndefined(concatTo, concatting) {
  if (typeof concatting !== "undefined") {
    concatTo += `${concatting}`;
  }
}

class Block {
  constructor(timestamp, lastHash, hash, reward, transactions, metadatas, nonce, difficulty) {
    this.timestamp = timestamp;
    this.lastHash = lastHash;
    this.hash = hash;
    this.reward = reward;
    this.transactions = transactions;
    this.metadatas = metadatas;
    this.nonce = nonce;
    if (difficulty === undefined) {
      this.difficulty = DIFFICULTY;
    } else {
      this.difficulty = difficulty;
    }
  }

  static getTransactions(block) {
    if (typeof block.transactions !== "undefined" && block.transactions !== null) {
      return block.transactions;
    } else {
      return [];
    }
  }

  static getMetadatas(block) {
    if (typeof block.metadatas !== "undefined" && block.metadatas !== null) {
      return block.metadatas;
    } else {
      return [];
    }
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
    return new this('Genesis time', '-----', 'f1r57-h45h', null, null, null, 0, DIFFICULTY);
  }

  static hash(timestamp, lastHash, reward, transactions, metadatas, nonce, difficulty) {
    //backwards compatible hashing:
    //if we add a new type of thing to the chain, the hash of previous blocks won't change as if will be undefined
    let hashing = `${timestamp}${lastHash}${nonce}${difficulty}`;
    concatIfNotUndefined(hashing, reward);
    concatIfNotUndefined(hashing, transactions);
    concatIfNotUndefined(hashing, metadatas);

    return ChainUtil.hash(hashing).toString();
  }

  static blockHash(block) {
    return Block.hash(
      block.timestamp,
      block.lastHash,
      block.reward,
      block.transactions,
      block.metadatas,
      block.nonce,
      block.difficulty);
  }

  //returns false if block's hash doesn't match internals
  static checkHash(block) {

    const computedHash = Block.hash(
      block.timestamp,
      block.lastHash,
      block.reward,
      block.transactions,
      block.metadatas,
      block.nonce,
      block.difficulty);

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
}

module.exports = Block;