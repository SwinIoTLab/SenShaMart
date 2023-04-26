const Block = require('../blockchain/block');

const Payment = require('../blockchain/payment');
const Integration = require('../blockchain/integration');
const SensorRegistration = require('../blockchain/sensor-registration');
const BrokerRegistration = require('../blockchain/broker-registration');
const Compensation = require('../blockchain/compensation');

const ITERATIONS = 1;

const STATE_RUNNING = 0;
const STATE_INTERRUPTED = 1;

function mine(miner) {
  if (miner.state !== STATE_RUNNING) {
    this.startMine();
    return;
  }
  const timestamp = Date.now();
  const difficulty = Block.adjustDifficulty(miner.lastBlock, timestamp);

  for (let i = 0; i < ITERATIONS; ++i) {
    const hash = Block.hash(
      timestamp,
      miner.lastBlock.hash,
      miner.reward,
      miner.txs.payments.mining,
      miner.txs.sensorRegistrations.mining,
      miner.txs.brokerRegistrations.mining,
      miner.txs.integrations.mining,
      miner.txs.compensations.mining,
      miner.nonce,
      difficulty);

    if (hash.substring(0, difficulty) === '0'.repeat(difficulty)) {
      //success
      const endTime = process.hrtime.bigint();
      console.log(`Mined a block of difficulty ${difficulty} in ${Number(endTime - miner.minedStartTime) / 1000000}ms`);
      miner.blockchain.addBlock(new Block(
        timestamp,
        miner.lastBlock.hash,
        hash,
        miner.reward,
        miner.txs.payments.mining,
        miner.txs.sensorRegistrations.mining,
        miner.txs.brokerRegistrations.mining,
        miner.txs.integrations.mining,
        miner.txs.compensations.mining,
        miner.nonce,
        difficulty));
      miner.state = STATE_INTERRUPTED;
      setImmediate(() => { startMine(miner) });
      return;
    } else {
      //failure
      miner.nonce++;
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
  miner.txs.payments.mining = [...miner.txs.payments.pool];
  miner.txs.integrations.mining = [...miner.txs.integrations.pool];
  miner.txs.sensorRegistrations.mining = [...miner.txs.sensorRegistrations.pool];
  miner.txs.brokerRegistrations.mining = [...miner.txs.brokerRegistrations.pool];
  miner.txs.compensations.mining = [...miner.txs.compensations.pool];

  miner.nonce = 0;
  miner.state = STATE_RUNNING;

  mine(miner);
}

function findTx(tx) {
  return t => t.input === tx.input && t.counter === tx.counter;
}

function clearFromBlock(miner, txs, blockTxs) {
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

    this.txs = {
      payments: {
        pool: [],
        mining: []
      },
      integrations: {
        pool: [],
        mining: []
      },
      sensorRegistrations: {
        pool: [],
        mining: []
      },
      brokerRegistrations: {
        pool: [],
        mining: []
      },
      compensations: {
        pool: [],
        mining: []
      }
    };

    startMine(this);
  }

  addTransaction(tx) {
    const verifyRes = tx.type.verify(tx.transaction);
    if (!verifyRes.result) {
      console.log("Couldn't add tx to miner, tx couldn't be verified: " + verifyRes.reason);
      return;
    }

    let txs = null;

    switch (tx.type) {
      case Payment: txs = this.txs.payments; break;
      case Integration: txs = this.txs.integrations; break;
      case SensorRegistration: txs = this.txs.sensorRegistrations; break;
      case BrokerRegistration: txs = this.txs.brokerRegistrations; break;
      case Compensation: txs = this.txs.compensations; break;
      default: throw new Error(`unknown tx type: ${tx.type.name()}`);
    }

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
    clearFromBlock(this, this.txs.payments, Block.getPayments(block));
    clearFromBlock(this, this.txs.integrations, Block.getIntegrations(block));
    clearFromBlock(this, this.txs.sensorRegistrations, Block.getSensorRegistrations(block));
    clearFromBlock(this, this.txs.brokerRegistrations, Block.getBrokerRegistrations(block));
    clearFromBlock(this, this.txs.compensations, Block.getCompensations(block));

    this.state = STATE_INTERRUPTED;

    this.lastBlock = block;
  }
}

module.exports = Miner;

