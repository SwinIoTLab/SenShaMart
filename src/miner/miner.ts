/**
 *    Copyright (c) 2022-2024, SenShaMart
 *
 *    This file is part of SenShaMart.
 *
 *    SenShaMart is free software: you can redistribute it and/or modify
 *    it under the terms of the GNU Lesser General Public License.
 *
 *    SenShaMart is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Lesser General Public License for more details.
 *
 *    You should have received a copy of the GNU Lesser General Public License
 *    along with SenShaMart.  If not, see <http://www.gnu.org/licenses/>.
 **/

/**
 * @author Anas Dawod e-mail: adawod@swin.edu.au
 */
import { Block, BlockTxs } from '../blockchain/block.js';

import { ChainUtil, isFailure, type Result, type ResultFailure } from '../util/chain-util.js';
import Payment from '../blockchain/payment.js';
import Integration from '../blockchain/integration.js';
import SensorRegistration from '../blockchain/sensor-registration.js';
import BrokerRegistration from '../blockchain/broker-registration.js';
import Commit from '../blockchain/commit.js';
import { type Transaction, type TransactionClass } from '../blockchain/transaction_base.js';
import type Blockchain from '../blockchain/blockchain.js';

const ITERATIONS = 1;

enum MinerState {
  RUNNING,
  INTERRUPTED
}

//this is called to try ITERATIONS worth of nonces, and then yield once it's done
function mine(miner: Miner) {
  if (miner.state !== MinerState.RUNNING) {
    startMine(miner);
    return;
  }
  const lastBlock = miner.blockchain.getHeadInfo();

  const timestamp = Date.now();
  const difficulty = Block.adjustDifficulty(lastBlock.block.timestamp, lastBlock.difficulty, timestamp);

  const txCount =
    BlockTxs.getPayments(miner.txs.mining).length +
    BlockTxs.getSensorRegistrations(miner.txs.mining).length +
    BlockTxs.getBrokerRegistrations(miner.txs.mining).length +
    BlockTxs.getIntegrations(miner.txs.mining).length +
    BlockTxs.getCommits(miner.txs.mining).length;

  for (let i = 0; i < ITERATIONS; ++i) {
    const hash = Block.hash(
      timestamp,
      lastBlock.block.hash,
      miner.reward,
      miner.txs.mining,
      miner.nonce);

    if (hash.substring(0, difficulty) === '0'.repeat(difficulty)) {
      //success
      const endTime = process.hrtime.bigint();
      console.log(`Mined a block of depth ${lastBlock.depth + 1} difficulty ${difficulty} in ${Number(endTime - miner.minedStartTime) / 1000000}ms with ${txCount} txs`);
      miner.state = MinerState.INTERRUPTED;
      miner.blockchain.addBlock(new Block(
        timestamp,
        lastBlock.block.hash,
        hash,
        miner.reward,
        miner.txs.mining,
        miner.nonce)).catch((err: Error) => {
          console.log(`Couldn't add mined block: ${err.message}`);
        }).finally(() =>
          //even on error we try again
          startMine(miner)
        );
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

//for every tx, if we added it to the new block, would the block be valid? If so, add it
async function moveValidTxsToMining<Tx extends Transaction>(miner: Miner, pool: Tx[], mining: Tx[]) {

  for (const tx of pool) {
    mining.push(tx);
    const res = await miner.blockchain.wouldBeValidBlock(miner.reward, Date.now(), miner.txs.mining);

      if(isFailure(res)) {
      console.log(`Tx wouldn't lead to a valid block: ${res.reason}`);
      mining.pop();
    }
  }
}

//set up state so we can start using mine() to mine nonces
async function startMine(miner: Miner) {
  //only continue if state is waiting or restarting
  if (miner.state !== MinerState.INTERRUPTED) {
    return;
  }

  miner.minedStartTime = process.hrtime.bigint();

  miner.txs.mining.payments = [];
  miner.txs.mining.brokerRegistrations = [];
  miner.txs.mining.sensorRegistrations = [];
  miner.txs.mining.integrations = [];
  miner.txs.mining.commits = [];

  await moveValidTxsToMining(miner, miner.txs.pool.payments, miner.txs.mining.payments);
  await moveValidTxsToMining(miner, miner.txs.pool.sensorRegistrations, miner.txs.mining.sensorRegistrations);
  await moveValidTxsToMining(miner, miner.txs.pool.brokerRegistrations, miner.txs.mining.brokerRegistrations);
  await moveValidTxsToMining(miner, miner.txs.pool.integrations, miner.txs.mining.integrations);
  await moveValidTxsToMining(miner, miner.txs.pool.commits, miner.txs.mining.commits);

  if (miner.txs.mining.payments.length === 0) { miner.txs.mining.payments = undefined }
  if (miner.txs.mining.sensorRegistrations.length === 0) { miner.txs.mining.sensorRegistrations = undefined }
  if (miner.txs.mining.brokerRegistrations.length === 0) { miner.txs.mining.brokerRegistrations = undefined }
  if (miner.txs.mining.integrations.length === 0) { miner.txs.mining.integrations = undefined }
  //console.log(`Started mining ${miner.txs.mining.commits.length} commits`);
  if (miner.txs.mining.commits.length === 0) { miner.txs.mining.commits = undefined }

  miner.nonce = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  miner.state = MinerState.RUNNING;

  mine(miner);
}

//used for Array.findIndex
function findTx<Tx extends Transaction>(tx: Tx) {
  return (t:Tx) => t.signature === tx.signature;
}

//remove any txs from txs we're trying to mine
function clearFromBlock<Tx extends Transaction>(pool: Tx[], blockTxs: Tx[] | undefined) {
  if (blockTxs === undefined) {
    return;
  }
  for (const tx of blockTxs) {
    const foundIndex = pool.findIndex(findTx(tx));

    if (foundIndex !== -1) {
      pool.splice(foundIndex, 1);
    }
  }
}

type Txs = {
  pool: {
    payments: Payment[],
    brokerRegistrations: BrokerRegistration[],
    sensorRegistrations: SensorRegistration[],
    integrations: Integration[],
    commits: Commit[]
  }
  mining: BlockTxs
};

//add a tx to the pool
function addImpl<Tx extends Transaction>(miner: Miner, tx: Tx, txClass: TransactionClass<Tx>, pool: Tx[], mining: Tx[] | undefined): Result {
  const fail: ResultFailure = { result: false, reason: "" };
  if (!txClass.verify(tx, fail)) {
    fail.reason = "Couldn't add tx to miner, tx couldn't be verified: " + fail.reason;
    return fail;
  }

  const foundIndex = pool.findIndex(findTx(tx));

  if (foundIndex !== -1) {
    pool[foundIndex] = tx;
    if (mining !== undefined && mining.some(findTx(tx))) {
      miner.state = MinerState.INTERRUPTED;
    }
  } else {
    pool.push(tx);
  }

  return {
    result: true
  };
}

class Miner {
  state: MinerState; //what are we doing/what should we do on next mine() call
  reward: string; //who we want rewards for blocks we've mined to go to
  minedStartTime: bigint; //when we started mining our block, used for metrics
  blockchain: Blockchain; //the blockchain we're mining into
  txs: Txs; //txs we want to mine/are mining
  nonce: number; //what nonce we're currently on

  constructor(blockchain: Blockchain, reward: string) {
    this.state = MinerState.INTERRUPTED;

    const fail: ResultFailure = { result: false, reason: "" };
    if (!ChainUtil.validateIsSerializedPublicKey(reward, fail)) {
      throw new Error("Tried to start a miner with invalid reward public key '" + reward + "': " + fail.reason);
    }

    this.reward = reward;

    this.minedStartTime = process.hrtime.bigint();

    this.blockchain = blockchain;
    blockchain.addListener((newDepth, commonDepth) => {

      //I think we need to get all blocks from commonDepth to newDepth and onNewBlock them

      blockchain.getBlocksOnMainStringByDepth(commonDepth + 1, newDepth - commonDepth).then((blocks) => {
        for (const block of blocks) {
          this.onNewBlock(block);
        }
      });
    });

    this.txs = {
      pool: {
        payments: [],
        brokerRegistrations: [],
        sensorRegistrations: [],
        integrations: [],
        commits: []
      },
      mining: {
      }
    };

    this.nonce = 0;
    startMine(this);
  }

  //add the appropriate tx to the pool
  addPayment(tx: Payment): Result {
    return addImpl(this, tx, Payment, this.txs.pool.payments, this.txs.mining.payments);
  }
  addSensorRegistration(tx: SensorRegistration): Result {
    return addImpl(this, tx, SensorRegistration, this.txs.pool.sensorRegistrations, this.txs.mining.sensorRegistrations);
  }
  addBrokerRegistration(tx: BrokerRegistration): Result {
    return addImpl(this, tx, BrokerRegistration, this.txs.pool.brokerRegistrations, this.txs.mining.brokerRegistrations);
  }
  addIntegration(tx: Integration): Result {
    return addImpl(this, tx, Integration, this.txs.pool.integrations, this.txs.mining.integrations);
  }
  addCommit(tx: Commit): Result {
    return addImpl(this, tx, Commit, this.txs.pool.commits, this.txs.mining.commits);
  }

  //when a new block is mined
  onNewBlock(block: Block) {
    clearFromBlock(this.txs.pool.payments, block.txs.payments);
    clearFromBlock(this.txs.pool.sensorRegistrations, block.txs.sensorRegistrations);
    clearFromBlock(this.txs.pool.brokerRegistrations, block.txs.brokerRegistrations);
    clearFromBlock(this.txs.pool.integrations, block.txs.integrations);
    clearFromBlock(this.txs.pool.commits, block.txs.commits);

    this.state = MinerState.INTERRUPTED;
  }
}

export default Miner;

