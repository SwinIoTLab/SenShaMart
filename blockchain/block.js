const ChainUtil = require('../chain-util');
const { DIFFICULTY, MINE_RATE } = require('../config');

class Block {
  constructor(timestamp, lastHash, hash, data, nonce, difficulty) {
    this.timestamp = timestamp;
    this.lastHash = lastHash;
    this.hash = hash;
    this.data = data;
    this.nonce = nonce;
    if (difficulty === undefined) {
      this.difficulty = DIFFICULTY;
    } else {
      this.difficulty = difficulty;
    }
  }

  toString() {
    return `Block -
      Timestamp : ${this.timestamp}
      Last Hash : ${this.lastHash.substring(0, 10)}
      Hash      : ${this.hash.substring(0, 10)}
      Nonce     : ${this.nonce}
      Difficulty: ${this.difficulty}
      Data      : ${this.data}`;
  }

  static genesis() {
    return new this('Genesis time', '-----', 'f1r57-h45h', [], 0, DIFFICULTY);
  }

  //returns false if hash doesn't match
  static checkHash(hash, timestamp, lastHash, data, nonce, difficulty) {
    const computedHash = Block.hash(timestamp, lastHash, data, nonce, difficulty);

    if (computedHash !== hash) {
      return false;
    }

    if (hash.substring(0, difficulty) !== '0'.repeat(difficulty)) {
      return false;
    }

    return true;
  }

  static hash(timestamp, lastHash, data, nonce, difficulty) {
    return ChainUtil.hash(`${timestamp}${lastHash}${data}${nonce}${difficulty}`).toString();
  }

  static blockHash(block) {
    const { timestamp, lastHash, data, nonce, difficulty } = block;
    return Block.hash(timestamp, lastHash, data, nonce, difficulty);
  }

  //returns false if block's hash doesn't match internals
  static checkBlock(block) {
    return Block.checkHash(block.hash, block.timestamp, block.lastHash, block.data, block.nonce, block.difficulty);
  }

  static adjustDifficulty(lastBlock, currentTime) {
    let { difficulty } = lastBlock;
    difficulty = lastBlock.timestamp + MINE_RATE > currentTime ?
      difficulty + 1 : difficulty - 1;
    return Math.max(0, difficulty);
  }
}

module.exports = Block;