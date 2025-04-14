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

/**
 * @author Anas Dawod e-mail: adawod@swin.edu.au
 */
import { ChainUtil, type Result, type ResultFailure } from '../util/chain-util.js';
import { INITIAL_MINE_DIFFICULTY, MINE_RATE } from '../util/constants.js';
import { type Transaction } from './transaction_base.js';
import BrokerRegistration from './broker-registration.js';
import SensorRegistration from './sensor-registration.js';
import Integration from './integration.js';
import Payment from './payment.js';
import Commit from './commit.js';

/*
  Used to create the string for hashing. We use this for forwards compatibility. 
  Any set of transactions types that doesn't exist isn't included in what is hashed (including not having an empty set).
  This allows the hash of blocks to not change when new transactions types are added
*/
function concatIfNotUndefined(concatTo: string, prefix: string, concatting: Transaction[] | undefined): string {
  if (concatting !== undefined && concatting !== null && concatting.length > 0) {
    concatTo += prefix;
    for (const tx of concatting) {
      concatTo += tx.signature;
    }
  }
  return concatTo;
}

/*
  Helper to get transaction types.
  If undefined or null returns an empty list, otherwise what exists
*/
function getData<T>(map?:T[]): T[] {
  if (map !== undefined && map !== null) {
    return map;
  } else {
    return [];
  }
}

/*
  Used to validate a block
*/
const baseValidation = {
  timestamp: ChainUtil.createValidateIsIntegerWithMin(0),
  lastHash: ChainUtil.validateIsString,
  hash: ChainUtil.validateIsString,
  reward: ChainUtil.validateIsSerializedPublicKey,
  nonce: ChainUtil.createValidateIsIntegerWithMin(0),
  txs: ChainUtil.createValidateObject({
    sensorRegistrations: ChainUtil.createValidateOptional(
      ChainUtil.createValidateArray(SensorRegistration.verify)),
    brokerRegistrations: ChainUtil.createValidateOptional(
      ChainUtil.createValidateArray(BrokerRegistration.verify)),
    integrations: ChainUtil.createValidateOptional(
      ChainUtil.createValidateArray(Integration.verify)),
    payments: ChainUtil.createValidateOptional(
      ChainUtil.createValidateArray(Payment.verify)),
    commits: ChainUtil.createValidateOptional(
      ChainUtil.createValidateArray(Commit.verify))
  })
};

export class BlockTxs {
  //arrays of txs
  payments ?: Payment[];
  sensorRegistrations ?: SensorRegistration[];
  brokerRegistrations ?: BrokerRegistration[];
  integrations ?: Integration[];
  commits?: Commit[];

  static getPayments(txs: BlockTxs): Payment[] {
    return getData(txs.payments);
  }

  static getSensorRegistrations(txs: BlockTxs): SensorRegistration[] {
    return getData(txs.sensorRegistrations);
  }

  static getBrokerRegistrations(txs: BlockTxs): BrokerRegistration[] {
    return getData(txs.brokerRegistrations);
  }

  static getIntegrations(txs: BlockTxs): Integration[] {
    return getData(txs.integrations);
  }

  static getCommits(txs: BlockTxs): Commit[] {
    return getData(txs.commits);
  }
}

const genesis : Block = {
  timestamp: 0,
  lastHash: '-----',
  hash: 'f1r57-h45h',
  reward: '',
  txs: {},
  nonce: 0
} as const;

export type DebugMined = {
  block: Block,
  difficulty: number
};

/*
  A block in the blockchain
*/
export class Block {
  //when this block was mined
  timestamp: number;
  //the hash of the previous block
  lastHash: string;
  //the hash of this block
  hash: string;
  //which public wallet is getting the reward for mining this block
  reward: string;
  //a chosen number to make the hash valid
  nonce: number;
  //txs
  txs: BlockTxs;

  constructor(timestamp: number, lastHash: string, hash: string, reward: string, txs: BlockTxs, nonce: number) {
    this.timestamp = timestamp;
    this.lastHash = lastHash;
    this.hash = hash;
    this.reward = reward;
    this.txs = txs;
    this.nonce = nonce;

    const fail: ResultFailure = { result: false, reason: "" };

    if (!Block.validate(this, fail)) {
      throw new Error("Failed to construct block\n" + fail.reason);
    }
  }

  //the initial block
  static genesis(): Block {
    return structuredClone(genesis);
  }

  //hash the individual components of a block
  static hash(timestamp: number, lastHash: string, reward: string, txs: BlockTxs, nonce: number): string {
    //backwards compatible hashing:
    //if we add a new type of thing to the chain, the hash of previous blocks won't change as it will be undefined
    let hashing = `${timestamp}${lastHash}${nonce}${reward}`;
    hashing = concatIfNotUndefined(hashing, 'payments', txs.payments);
    hashing = concatIfNotUndefined(hashing, 'sensorRegistrations', txs.sensorRegistrations);
    hashing = concatIfNotUndefined(hashing, 'brokerRegistrations', txs.brokerRegistrations);
    hashing = concatIfNotUndefined(hashing, 'integrations', txs.integrations);
    hashing = concatIfNotUndefined(hashing, 'commits', txs.commits);

    return ChainUtil.hash(hashing).toString();
  }

  //hash a block
  static blockHash(block: Block): string {
    return Block.hash(
      block.timestamp,
      block.lastHash,
      block.reward,
      block.txs,
      block.nonce);
  }

  //Check if block's hash doesn't match internals
  static checkHashDifficulty(block: Block, difficulty: number): Result {
    if (block.hash.substring(0, difficulty) !== '0'.repeat(difficulty)) {
      return {
        result: false,
        reason: "Stored hash doesn't match computed difficulty"
      }
    }

    return {
      result: true
    };
  }

  //get the expected difficulty at currentTime with previous block lastBlock
  static adjustDifficulty(lastBlockTimestamp: number, lastBlockDifficulty: number, currentTime: number): number {
    const prevDifficulty = lastBlockDifficulty;
    if (lastBlockTimestamp + MINE_RATE > currentTime) {
      return prevDifficulty + 1;
    } else {
      return Math.max(0, prevDifficulty - 1);
    }
  }

  static debugGenesis(): DebugMined {
    return {
      block: Block.genesis(),
      difficulty: INITIAL_MINE_DIFFICULTY
    };
  }

  //simple blocking implementation of mining a block, used for debugging
  static debugMine(lastBlock: DebugMined, reward: string, txs: BlockTxs, timestamp?: number): DebugMined {
    if (timestamp === undefined) {
      timestamp = lastBlock.block.timestamp + MINE_RATE;
    } else if (timestamp <= lastBlock.block.timestamp) {
      throw new Error(`Trying to debug mine with an invalid timestamp, ${timestamp} <= ${lastBlock.block.timestamp}`);
    }
    const difficulty = Block.adjustDifficulty(lastBlock.block.timestamp, lastBlock.difficulty, timestamp);

    let nonce = 0;
    let hash = '';

    do {
      nonce++;
      hash = Block.hash(
        timestamp,
        lastBlock.block.hash,
        reward,
        txs,
        nonce);
    } while (hash.substring(0, difficulty) !== '0'.repeat(difficulty));

    return {
      block: new Block(
        timestamp,
        lastBlock.block.hash,
        hash,
        reward,
        txs,
        nonce),
      difficulty: difficulty
    };
  }

  //verify an object is a valid block by checking members and hash
  static validate(v: unknown, fail: ResultFailure): boolean {
    if (!ChainUtil.validateObject<Block>(v, baseValidation, fail)) {
      fail.reason = "Failed base validation\n" + fail.reason;
      return false;
    }

    const computedHash = Block.blockHash(v);

    if (computedHash !== v.hash) {
      fail.reason = "Computed hash doesn't match stored hash";
      return false;
    }

    return true;
  }
}

export default Block;
