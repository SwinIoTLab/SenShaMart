import { ChainUtil, type Result } from '../util/chain-util.js';
import { MINE_DIFFICULTY, MINE_RATE } from '../util/constants.js';
import { type Transaction } from './transaction_base.js';
import BrokerRegistration from './broker-registration.js';
import SensorRegistration from './sensor-registration.js';
import Integration from './integration.js';
import Payment from './payment.js';
import Compensation from './compensation.js';

function concatIfNotUndefined(concatTo: string, prefix: string, concatting: Transaction[] | null): string {
  if (typeof concatting !== "undefined" && concatting !== null && concatting.length > 0) {
    concatTo += prefix;
    for (const tx of concatting) {
      concatTo += tx.signature;
    }
  }
  return concatTo;
}

function getData<T>(map?:T[]): T[] {
  if (typeof map !== "undefined" && map !== null) {
    return map;
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
  timestamp: number;
  lastHash: string;
  hash: string;
  reward: string;
  nonce: number;
  difficulty: number;
  payments?: Payment[];
  sensorRegistrations?: SensorRegistration[];
  brokerRegistrations?: BrokerRegistration[];
  integrations?: Integration[];
  compensations?: Compensation[];

  constructor(timestamp: number, lastHash: string, hash: string, reward: string, payments: Payment[] | null, sensorRegistrations: SensorRegistration[] | null, brokerRegistrations: BrokerRegistration[] | null, integrations: Integration[] | null, compensations: Compensation[] | null, nonce: number, difficulty: number) {
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
      this.difficulty = MINE_DIFFICULTY;
    } else {
      this.difficulty = difficulty;
    }
  }

  static getPayments(block: Block): Payment[] {
    return getData(block.payments);
  }

  static getSensorRegistrations(block: Block): SensorRegistration[] {
    return getData(block.sensorRegistrations);
  }

  static getBrokerRegistrations(block: Block): BrokerRegistration[] {
    return getData(block.brokerRegistrations);
  }

  static getIntegrations(block: Block): Integration[] {
    return getData(block.integrations);
  }

  static getCompensations(block: Block): Compensation[] {
    return getData(block.compensations);
  }

  static genesis(): Block {
    return new this(0, '-----', 'f1r57-h45h', '', null, null, null, null, null, 0, MINE_DIFFICULTY);
  }

  static hash(timestamp: number, lastHash: string, reward: string, payments: Payment[]|null, sensorRegistrations: SensorRegistration[], brokerRegistrations: BrokerRegistration[], integrations:Integration[], compensations:Compensation[] | null, nonce: number, difficulty: number): string {
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

  static blockHash(block: Block): string {
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
  static checkHash(block: Block): Result {
    const computedHash = Block.blockHash(block);

    if (computedHash !== block.hash) {
      return {
        result: false,
        reason: "Computed hash doesn't match stored hash"
      };
    }

    if (block.hash.substring(0, block.difficulty) !== '0'.repeat(block.difficulty)) {
      return {
        result: false,
        reason: "Stored hash doesn't match stored difficulty"
      }
    }

    return {
      result: true
    };
  }

  static adjustDifficulty(lastBlock: Block, currentTime: number): number {
    let prevDifficulty = lastBlock.difficulty;
    if (lastBlock.timestamp + MINE_RATE > currentTime) {
      return prevDifficulty + 1;
    } else {
      return Math.max(0, prevDifficulty - 1);
    }
  }

  static debugMine(lastBlock: Block, reward: string, payments: Payment[] | null, sensorRegistrations: SensorRegistration[] | null, brokerRegistrations: BrokerRegistration[] | null, integrations: Integration[] | null, compensations: Compensation[] | null): Block {
    const timestamp = lastBlock.timestamp + MINE_RATE;
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

  static verify(block: Block): Result {
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

export default Block;