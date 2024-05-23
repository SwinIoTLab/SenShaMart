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
 *
 */

/**
 * @author Anas Dawod e-mail: adawod@swin.edu.au
           Josip Milovac
 */
import { Payment, type Output as PaymentOutput }  from '../blockchain/payment.js';
import { Integration, type Output as IntegrationOutput } from '../blockchain/integration.js';
import SensorRegistration from '../blockchain/sensor-registration.js';
import BrokerRegistration from '../blockchain/broker-registration.js';
import { type Blockchain } from '../blockchain/blockchain.js';
import { ChainUtil, type KeyPair, type LiteralMetadata, type NodeMetadata } from '../util/chain-util.js';
import { type AnyTransaction } from '../blockchain/transaction_base.js';

//TODO: keep track of issued transactions, so we don't accidently try and double spend
class Wallet {
  keyPair: KeyPair;
  publicKey: string;
  counter: number;
  constructor(keyPair: KeyPair) {
    this.keyPair = keyPair;
    this.counter = 0;
    this.publicKey = ChainUtil.serializePublicKey(keyPair.pub);
  }

  sign(dataHash: string) {
    return ChainUtil.createSignature(this.keyPair.priv, dataHash);
  }

  //TODO: API for multiple outputs
  //returns Transaction
  createPayment(blockchain: Blockchain, rewardAmount: number, outputs: PaymentOutput[]) {
    console.log(`${outputs}`);
    console.log(`${rewardAmount}`);

    const counter = blockchain.getCounterCopy(this.publicKey);

    if (counter > this.counter) {
      this.counter = counter;
    }

    let totalAmount = 0;
    for (const output of outputs) {
      totalAmount += output.amount;
    }

    const balance = blockchain.getBalanceCopy(this.publicKey);

    if (totalAmount + rewardAmount > balance) {
      console.log(`Total amount: ${totalAmount} + reward amount: ${rewardAmount} exceeds current balance: ${balance}`);
      return null;
    }

    const counterToUse = this.counter + 1;
    this.counter++;

    return new Payment(this.keyPair, counterToUse, outputs, rewardAmount);
  }

  createPaymentAsTransaction(blockchain: Blockchain, rewardAmount: number, outputs: PaymentOutput[]): AnyTransaction {
    return {
      tx: this.createPayment(blockchain, rewardAmount, outputs),
      type: Payment
    };
  }

  //TODO: API for multiple sensors
  //returns Transaction
  createIntegration(blockchain: Blockchain, rewardAmount: number, witnessCount: number, outputs: IntegrationOutput[]) {
    const counter = blockchain.getCounterCopy(this.publicKey);
    const balance = blockchain.getBalanceCopy(this.publicKey);

    if (counter > this.counter) {
      this.counter = counter;
    }

    let totalAmount = 0;
    for (const output of outputs) {
      totalAmount += output.amount;
    }

    if (totalAmount + rewardAmount > balance) {
      console.log(`Total amount: ${totalAmount} + reward amount: ${rewardAmount} exceeds current known balance: ${balance}`);
      return null;
    }

    const counterToUse = this.counter + 1;
    this.counter++;

    return new Integration(this.keyPair, counterToUse, outputs, witnessCount, rewardAmount);
  }

  createIntegrationAsTransaction(blockchain: Blockchain, rewardAmount: number, witnessCount: number, outputs: IntegrationOutput[]): AnyTransaction {
    return {
      tx: this.createIntegration(blockchain, rewardAmount, witnessCount, outputs),
      type: Integration
    };
  }

  //returns Transaction
  createBrokerRegistration(blockchain: Blockchain, rewardAmount: number, brokerName: string, endpoint: string, extraNodeMetadata: NodeMetadata[], extraLiteralMetadata: LiteralMetadata[]) {
    const balance = blockchain.getBalanceCopy(this.publicKey);
    const counter = blockchain.getCounterCopy(this.publicKey);

    if (counter > this.counter) {
      this.counter = counter;
    }

    if (rewardAmount > balance) {
      console.log(`Reward amount: ${rewardAmount} exceeds current balance: ${balance}`);
      return null;
    }

    const counterToUse = this.counter + 1;
    this.counter++;

    return new BrokerRegistration(
      this.keyPair,
      counterToUse,
      brokerName,
      endpoint,
      rewardAmount,
      extraNodeMetadata,
      extraLiteralMetadata);
  }

  createBrokerRegistrationAsTransaction(blockchain: Blockchain, rewardAmount: number, brokerName: string, endpoint: string, extraNodeMetadata: NodeMetadata[], extraLiteralMetadata: LiteralMetadata[]): AnyTransaction {
    return {
      tx: this.createBrokerRegistration(blockchain, rewardAmount, brokerName, endpoint, extraNodeMetadata, extraLiteralMetadata),
      type: BrokerRegistration
    };
  }

  //return Transaction
  createSensorRegistration(blockchain: Blockchain, rewardAmount: number, sensorName: string, costPerMinute: number, costPerKB: number, integrationBroker: string, extraNodeMetadata: NodeMetadata[], extraLiteralMetadata: LiteralMetadata[]) {
    const balance = blockchain.getBalanceCopy(this.publicKey);
    const counter = blockchain.getCounterCopy(this.publicKey);

    if (counter > this.counter) {
      this.counter = counter;
    }

    if (rewardAmount > balance) {
      console.log(`Reward amount: ${rewardAmount} exceeds current balance: ${balance}`);
      return null;
    }

    const counterToUse = this.counter + 1;
    this.counter++;

    return new SensorRegistration(this.keyPair, counterToUse, sensorName, costPerMinute, costPerKB, integrationBroker, rewardAmount, extraNodeMetadata, extraLiteralMetadata);
  }

  createSensorRegistrationAsTransaction(blockchain: Blockchain, rewardAmount: number, sensorName: string, costPerMinute: number, costPerKB: number, integrationBroker: string, extraNodeMetadata: NodeMetadata[], extraLiteralMetadata: LiteralMetadata[]): AnyTransaction {
    return {
      tx: this.createSensorRegistration(blockchain, rewardAmount, sensorName, costPerMinute, costPerKB, integrationBroker, extraNodeMetadata, extraLiteralMetadata),
      type: SensorRegistration
    };
  }
}

export default Wallet;

