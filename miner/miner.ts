import Block from '../blockchain/block.js';

import { isFailure, type Result } from '../util/chain-util.js';
import Payment from '../blockchain/payment.js';
import Integration from '../blockchain/integration.js';
import SensorRegistration from '../blockchain/sensor-registration.js';
import BrokerRegistration from '../blockchain/broker-registration.js';
import Compensation from '../blockchain/compensation.js';
import { type Transaction, type TransactionClass } from '../blockchain/transaction_base.js';
import type Blockchain from '../blockchain/blockchain.js';

const ITERATIONS = 1;

const MINER_STATE = {
  RUNNING: 0,
  INTERRUPTED: 1
} as const;

type Miner_state = typeof MINER_STATE[keyof typeof MINER_STATE]

function mine(miner: Miner) {
  if (miner.state !== MINER_STATE.RUNNING) {
    startMine(miner);
    return;
  }
  const lastBlock = miner.blockchain.lastBlock();

  const timestamp = Date.now();
  const difficulty = Block.adjustDifficulty(lastBlock, timestamp);

  const txCount = miner.txs.payment.mining.length +
    miner.txs.sensorRegistration.mining.length +
    miner.txs.brokerRegistration.mining.length +
    miner.txs.integration.mining.length +
    miner.txs.compensation.mining.length;

  for (let i = 0; i < ITERATIONS; ++i) {
    const hash = Block.hash(
      timestamp,
      lastBlock.hash,
      miner.reward,
      miner.txs.payment.mining,
      miner.txs.sensorRegistration.mining,
      miner.txs.brokerRegistration.mining,
      miner.txs.integration.mining,
      miner.txs.compensation.mining,
      miner.nonce,
      difficulty);

    if (hash.substring(0, difficulty) === '0'.repeat(difficulty)) {
      //success
      const endTime = process.hrtime.bigint();
      console.log(`Mined a block of difficulty ${difficulty} in ${Number(endTime - miner.minedStartTime) / 1000000}ms with ${txCount} txs`);
      miner.state = MINER_STATE.INTERRUPTED;
      miner.blockchain.addBlock(new Block(
        timestamp,
        lastBlock.hash,
        hash,
        miner.reward,
        miner.txs.payment.mining,
        miner.txs.sensorRegistration.mining,
        miner.txs.brokerRegistration.mining,
        miner.txs.integration.mining,
        miner.txs.compensation.mining,
        miner.nonce,
        difficulty),
        (err) => {
          if (isFailure(err)) {
            console.log(`Couldn't add mined block: ${err.reason}`);
          }
          //even on error we try again
          startMine(miner);
        });
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

function moveValidTxsToMining<Tx extends Transaction>(miner: Miner, txInfo: TxInfo<Tx>) {
  txInfo.mining = [];
  for (const tx of txInfo.pool) {
    txInfo.mining.push(tx);
    if (!miner.blockchain.wouldBeValidBlock(miner.reward,
      miner.txs.payment.mining,
      miner.txs.sensorRegistration.mining,
      miner.txs.brokerRegistration.mining,
      miner.txs.integration.mining,
      miner.txs.compensation.mining)) {

      txInfo.mining.pop();
    }
  }
}

function startMine(miner: Miner) {
  //only continue if state is waiting or restarting
  if (miner.state !== MINER_STATE.INTERRUPTED) {
    return;
  }

  miner.minedStartTime = process.hrtime.bigint();

  //TODO make sure these transactions actually work as a collective instead of individually
  moveValidTxsToMining(miner, miner.txs.payment);
  moveValidTxsToMining(miner, miner.txs.sensorRegistration);
  moveValidTxsToMining(miner, miner.txs.brokerRegistration);
  moveValidTxsToMining(miner, miner.txs.integration);
  moveValidTxsToMining(miner, miner.txs.compensation);

  miner.nonce = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  miner.state = MINER_STATE.RUNNING;

  mine(miner);
}

function findTx<Tx extends Transaction>(tx: Tx) {
  return (t:Tx) => t.signature === tx.signature;
}

function clearFromBlock<Tx extends Transaction>(txs: TxInfo<Tx>, blockTxs: Tx[]) {
  for (const tx of blockTxs) {
    const foundIndex = txs.pool.findIndex(findTx(tx));

    if (foundIndex !== -1) {
      txs.pool.splice(foundIndex, 1);
    }
  }
}


type TxInfo<Tx extends Transaction> = {
  pool: Tx[];
  mining: Tx[];
}

type Txs = {
  payment: TxInfo<Payment>,
  sensorRegistration: TxInfo<SensorRegistration>,
  brokerRegistration: TxInfo<BrokerRegistration>,
  integration: TxInfo<Integration>,
  compensation: TxInfo<Compensation>
};

function addImpl<Tx extends Transaction>(miner: Miner, tx: Tx, txClass: TransactionClass<Tx>, txInfo: TxInfo<Tx>): Result {
  const verifyRes = txClass.verify(tx);
  if (isFailure(verifyRes)) {
    return {
      result: false,
      reason: "Couldn't add tx to miner, tx couldn't be verified: " + verifyRes.reason
    };
  }

  const foundIndex = txInfo.pool.findIndex(findTx(tx));

  if (foundIndex !== -1) {
    txInfo.pool[foundIndex] = tx;
    if (txInfo.mining.some(findTx(tx))) {
      this.state = MINER_STATE.INTERRUPTED;
    }
  } else {
    txInfo.pool.push(tx);
  }

  return {
    result: true
  };
}

class Miner {
  state: Miner_state;
  reward: string;
  minedStartTime: bigint;
  blockchain: Blockchain;
  txs: Txs;
  nonce: number;

  constructor(blockchain: Blockchain, reward: string) {
    this.state = MINER_STATE.INTERRUPTED;
    this.reward = reward;

    this.minedStartTime = null;

    this.blockchain = blockchain;
    blockchain.addListener((newBlocks, undos, difference) => {
      for (const block of newBlocks) {
        this.onNewBlock(block);
      }
    });

    this.txs = {
      payment: { pool: [], mining: [] },
      sensorRegistration: { pool: [], mining: [] },
      brokerRegistration: { pool: [], mining: [] },
      integration: { pool: [], mining: [] },
      compensation: { pool: [], mining: [] },
    };

    this.nonce = 0;
    startMine(this);
  }

  addPayment(tx: Payment): Result {
    return addImpl(this, tx, Payment, this.txs.payment);
  }
  addSensorRegistration(tx: SensorRegistration): Result {
    return addImpl(this, tx, SensorRegistration, this.txs.sensorRegistration);
  }
  addBrokerRegistration(tx: BrokerRegistration): Result {
    return addImpl(this, tx, BrokerRegistration, this.txs.brokerRegistration);
  }
  addIntegration(tx: Integration): Result {
    return addImpl(this, tx, Integration, this.txs.integration);
  }
  addCompensation(tx: Compensation): Result {
    return addImpl(this, tx, Compensation, this.txs.compensation);
  }


  onNewBlock(block: Block) {
    clearFromBlock(this.txs.payment, Block.getPayments(block));
    clearFromBlock(this.txs.sensorRegistration, Block.getSensorRegistrations(block));
    clearFromBlock(this.txs.brokerRegistration, Block.getBrokerRegistrations(block));
    clearFromBlock(this.txs.integration, Block.getIntegrations(block));
    clearFromBlock(this.txs.compensation, Block.getCompensations(block));

    this.state = MINER_STATE.INTERRUPTED;
  }
}

export default Miner;

