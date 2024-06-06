import { Payment, type Output as PaymentOutput }  from '../blockchain/payment.js';
import { Integration, type Output as IntegrationOutput } from '../blockchain/integration.js';
import SensorRegistration from '../blockchain/sensor-registration.js';
import BrokerRegistration from '../blockchain/broker-registration.js';
import { type Blockchain } from '../blockchain/blockchain.js';
import { ChainUtil, type KeyPair, type LiteralMetadata, type NodeMetadata } from '../util/chain-util.js';
import { type AnyTransaction } from '../blockchain/transaction_base.js';

//TODO: keep track of issued transactions, so we don't accidently try and double spend
class Wallet {
  counter: Map<string,number>
  constructor() {
    this.counter = new Map<string,number>();
  }

  sign(keyPair: KeyPair, dataHash: string) {
    return ChainUtil.createSignature(keyPair.priv, dataHash);
  }

  getCounter(keyPair: KeyPair): number {
    if (this.counter.has(keyPair.pubSerialized)) {
      return this.counter.get(keyPair.pubSerialized);
    } else {
      return 0;
    }
  }

  //TODO: API for multiple outputs
  //returns Transaction
  createPayment(keyPair: KeyPair, blockchain: Blockchain, rewardAmount: number, outputs: PaymentOutput[]) {
    console.log(`${outputs}`);
    console.log(`${rewardAmount}`);

    let counter = blockchain.getCounterCopy(keyPair.pubSerialized);
    const gotCounter = this.getCounter(keyPair);
    if (gotCounter > counter) {
      counter = gotCounter;
    }

    counter++;
    this.counter.set(keyPair.pubSerialized, counter);

    let totalAmount = 0;
    for (const output of outputs) {
      totalAmount += output.amount;
    }

    const balance = blockchain.getBalanceCopy(keyPair.pubSerialized);

    if (totalAmount + rewardAmount > balance) {
      throw new Error(`Total amount: ${totalAmount} + reward amount: ${rewardAmount} exceeds current balance: ${balance}`);
    }

    return new Payment(keyPair, counter, outputs, rewardAmount);
  }

  createPaymentAsTransaction(keyPair: KeyPair, blockchain: Blockchain, rewardAmount: number, outputs: PaymentOutput[]): AnyTransaction {
    return {
      tx: this.createPayment(keyPair, blockchain, rewardAmount, outputs),
      type: Payment
    };
  }

  //TODO: API for multiple sensors
  //returns Transaction
  createIntegration(keyPair: KeyPair, blockchain: Blockchain, rewardAmount: number, witnessCount: number, outputs: IntegrationOutput[]) {
    const balance = blockchain.getBalanceCopy(keyPair.pubSerialized);

    let counter = blockchain.getCounterCopy(keyPair.pubSerialized);
    const gotCounter = this.getCounter(keyPair);
    if (gotCounter > counter) {
      counter = gotCounter;
    }

    counter++;
    this.counter.set(keyPair.pubSerialized, counter);

    let totalAmount = 0;
    for (const output of outputs) {
      totalAmount += output.amount;
    }

    if (totalAmount + rewardAmount > balance) {
      throw new Error(`Total amount: ${totalAmount} + reward amount: ${rewardAmount} exceeds current known balance: ${balance}`);
    }

    return new Integration(keyPair, counter, outputs, witnessCount, rewardAmount);
  }

  createIntegrationAsTransaction(keyPair: KeyPair, blockchain: Blockchain, rewardAmount: number, witnessCount: number, outputs: IntegrationOutput[]): AnyTransaction {
    return {
      tx: this.createIntegration(keyPair, blockchain, rewardAmount, witnessCount, outputs),
      type: Integration
    };
  }

  //returns Transaction
  createBrokerRegistration(keyPair: KeyPair, blockchain: Blockchain, rewardAmount: number, brokerName: string, endpoint: string, extraNodeMetadata: NodeMetadata[], extraLiteralMetadata: LiteralMetadata[]) {
    const balance = blockchain.getBalanceCopy(keyPair.pubSerialized);

    let counter = blockchain.getCounterCopy(keyPair.pubSerialized);
    const gotCounter = this.getCounter(keyPair);
    if (gotCounter > counter) {
      counter = gotCounter;
    }

    counter++;
    this.counter.set(keyPair.pubSerialized, counter);

    if (rewardAmount > balance) {
      throw new Error(`Reward amount: ${rewardAmount} exceeds current balance: ${balance}`);
    }

    return new BrokerRegistration(
      keyPair,
      counter,
      brokerName,
      endpoint,
      rewardAmount,
      extraNodeMetadata,
      extraLiteralMetadata);
  }

  createBrokerRegistrationAsTransaction(keyPair: KeyPair, blockchain: Blockchain, rewardAmount: number, brokerName: string, endpoint: string, extraNodeMetadata: NodeMetadata[], extraLiteralMetadata: LiteralMetadata[]): AnyTransaction {
    return {
      tx: this.createBrokerRegistration(keyPair, blockchain, rewardAmount, brokerName, endpoint, extraNodeMetadata, extraLiteralMetadata),
      type: BrokerRegistration
    };
  }

  //return Transaction
  createSensorRegistration(
    keyPair: KeyPair,
    blockchain: Blockchain,
    rewardAmount: number,
    sensorName: string,
    costPerMinute: number,
    costPerKB: number,
    interval: number | null,
    integrationBroker: string,
    extraNodeMetadata: NodeMetadata[],
    extraLiteralMetadata: LiteralMetadata[]) {

    const balance = blockchain.getBalanceCopy(keyPair.pubSerialized);

    let counter = blockchain.getCounterCopy(keyPair.pubSerialized);
    const gotCounter = this.getCounter(keyPair);
    if (gotCounter > counter) {
      counter = gotCounter;
    }

    counter++;
    this.counter.set(keyPair.pubSerialized, counter);

    if (rewardAmount > balance) {
      throw new Error(`Reward amount: ${rewardAmount} exceeds current balance: ${balance}`);
    }

    return new SensorRegistration(
      keyPair,
      counter,
      sensorName,
      costPerMinute,
      costPerKB,
      integrationBroker,
      interval,
      rewardAmount,
      extraNodeMetadata,
      extraLiteralMetadata);
  }

  createSensorRegistrationAsTransaction(
    keyPair: KeyPair,
    blockchain: Blockchain,
    rewardAmount: number,
    sensorName: string,
    costPerMinute: number,
    costPerKB: number,
    interval: number | null,
    integrationBroker: string,
    extraNodeMetadata: NodeMetadata[],
    extraLiteralMetadata: LiteralMetadata[]): AnyTransaction {
    return {
      tx: this.createSensorRegistration(keyPair, blockchain, rewardAmount, sensorName, costPerMinute, costPerKB, interval, integrationBroker, extraNodeMetadata, extraLiteralMetadata),
      type: SensorRegistration
    };
  }
}

export default Wallet;

