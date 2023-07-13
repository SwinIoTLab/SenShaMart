const Block = require('../blockchain/block');

const Payment = require('../blockchain/payment');
const Integration = require('../blockchain/integration');
const SensorRegistration = require('../blockchain/sensor-registration');
const BrokerRegistration = require('../blockchain/broker-registration');
const Compensation = require('../blockchain/compensation');
const Transaction = require('../blockchain/transaction');

const ITERATIONS = 1;

const STATE_RUNNING = 0;
const STATE_INTERRUPTED = 1;

function mine(miner) {
  if (miner.state !== STATE_RUNNING) {
    startMine(miner);
    return;
  }
  const timestamp = Date.now();
  const difficulty = Block.adjustDifficulty(miner.lastBlock, timestamp);

  const txCount = miner.txs[Payment.name()].mining.length +
    miner.txs[SensorRegistration.name()].mining.length +
    miner.txs[BrokerRegistration.name()].mining.length +
    miner.txs[Integration.name()].mining.length +
    miner.txs[Compensation.name()].mining.length;

  for (let i = 0; i < ITERATIONS; ++i) {
    const hash = Block.hash(
      timestamp,
      miner.lastBlock.hash,
      miner.reward,
      miner.txs[Payment.name()].mining,
      miner.txs[SensorRegistration.name()].mining,
      miner.txs[BrokerRegistration.name()].mining,
      miner.txs[Integration.name()].mining,
      miner.txs[Compensation.name()].mining,
      miner.nonce,
      difficulty);

    if (hash.substring(0, difficulty) === '0'.repeat(difficulty)) {
      //success
      const endTime = process.hrtime.bigint();
      console.log(`Mined a block of difficulty ${difficulty} in ${Number(endTime - miner.minedStartTime) / 1000000}ms with ${txCount} txs`);
      miner.blockchain.addBlock(new Block(
        timestamp,
        miner.lastBlock.hash,
        hash,
        miner.reward,
        miner.txs[Payment.name()].mining,
        miner.txs[SensorRegistration.name()].mining,
        miner.txs[BrokerRegistration.name()].mining,
        miner.txs[Integration.name()].mining,
        miner.txs[Compensation.name()].mining,
        miner.nonce,
        difficulty));
      miner.state = STATE_INTERRUPTED;
      setImmediate(() => { startMine(miner) });
      return;
    } else {
      //failure
      if (miner.nonce === Number.MAX_SAFE_INTEGER) {
        miner.nonce = Number.MIN_SAFE_INTEGER;
      } else {
        miner.nonce++;
      }
    }
  }
  setImmediate(() => { mine(miner) });
}

function startMine(miner) {
  //only continue if state is waiting or restarting
  if (miner.state !== STATE_INTERRUPTED) {
    return;
  }

  miner.minedStartTime = process.hrtime.bigint();

  //TODO make sure these transactions actually work as a collective instead of individually
  for (const type of Transaction.ALL_TYPES) {
    const key = type.name();
    miner.txs[key].mining = [];
    for (const tx of miner.txs[key].pool) {
      miner.txs[key].mining.push(tx);
      if (!miner.blockchain.wouldBeValidBlock(miner.reward,
        miner.txs[Payment.name()].mining,
        miner.txs[SensorRegistration.name()].mining,
        miner.txs[BrokerRegistration.name()].mining,
        miner.txs[Integration.name()].mining,
        miner.txs[Compensation.name()].mining)) {
        miner.txs[key].mining.pop();
      }
    }
  }

  miner.nonce = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  miner.state = STATE_RUNNING;

  mine(miner);
}

function findTx(tx) {
  return t => t.input === tx.input && t.counter === tx.counter;
}

function clearFromBlock(txs, blockTxs) {
  for (const tx of blockTxs) {
    const foundIndex = txs.pool.findIndex(findTx(tx));

    if (foundIndex !== -1) {
      txs.pool.splice(foundIndex, 1);
    }
  }
}

class Miner {
  constructor(blockchain, reward) {
    this.lastBlock = blockchain.lastBlock();
    this.state = STATE_INTERRUPTED;
    this.reward = reward;

    this.minedStartTime = null;

    this.blockchain = blockchain;
    blockchain.addListener((newBlocks, oldBlocks, difference) => {
      for (var i = difference; i < newBlocks.length; i++) {
        this.onNewBlock(newBlocks[i]);
      }
    });

    this.txs = {};
    for (const type of Transaction.ALL_TYPES) {
      this.txs[type.name()] = {
        pool: [],
        mining: []
      };
    }

    startMine(this);
  }

  addTransaction(tx) {
    const verifyRes = tx.type.verify(tx.transaction);
    if (!verifyRes.result) {
      console.log("Couldn't add tx to miner, tx couldn't be verified: " + verifyRes.reason);
      return;
    }

    let txs = this.txs[tx.type.name()];

    const foundIndex = txs.pool.findIndex(findTx(tx.transaction));

    if (foundIndex !== -1) {
      txs.pool[foundIndex] = tx.transaction;
      if (txs.mining.some(findTx(tx.transaction))) {
        this.state = STATE_INTERRUPTED;
      }
    } else {
      txs.pool.push(tx.transaction);
    }
  }

  onNewBlock(block) {
    clearFromBlock(this.txs[Payment.name()], Block.getPayments(block));
    clearFromBlock(this.txs[Integration.name()], Block.getIntegrations(block));
    clearFromBlock(this.txs[SensorRegistration.name()], Block.getSensorRegistrations(block));
    clearFromBlock(this.txs[BrokerRegistration.name()], Block.getBrokerRegistrations(block));
    clearFromBlock(this.txs[Compensation.name()], Block.getCompensations(block));

    this.state = STATE_INTERRUPTED;

    this.lastBlock = block;
  }
}

module.exports = Miner;

