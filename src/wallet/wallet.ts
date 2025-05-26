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
 */

import { Payment, type Output as PaymentOutput }  from '../blockchain/payment.js';
import { Integration, type OutputConstructor as IntegrationOutputConstructor } from '../blockchain/integration.js';
import SensorRegistration from '../blockchain/sensor-registration.js';
import BrokerRegistration from '../blockchain/broker-registration.js';
import { type Blockchain } from '../blockchain/blockchain.js';
import { ChainUtil, type KeyPair, type RdfTriple } from '../util/chain-util.js';

//TODO: keep track of issued transactions, so we don't accidently try and double spend
//TODO: since creating is now async, some kind of mutex/queue might be needed to stop a race
class Wallet {
  counter: Map<string,number>
  constructor() {
    this.counter = new Map<string,number>();
  }

  sign(keyPair: KeyPair, dataHash: string) {
    return ChainUtil.createSignature(keyPair.priv, dataHash);
  }

  getCounter(keyPair: KeyPair): number {
    const found = this.counter.get(keyPair.pubSerialized);
    if (found !== undefined) {
      return found;
    } else {
      return 0;
    }
  }

  //returns Transaction
  async createPayment(keyPair: KeyPair, blockchain: Blockchain, rewardAmount: number, outputs: PaymentOutput[]): Promise<Payment> {
    console.log(`${outputs}`);
    console.log(`${rewardAmount}`);

    const wallet = await blockchain.getWallet(keyPair.pubSerialized);
    let counter = wallet.val.counter;
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

    const balance = wallet.val.balance;

    if (totalAmount + rewardAmount > balance) {
      throw new Error(`Total amount: ${totalAmount} + reward amount: ${rewardAmount} exceeds current balance: ${balance}`);
    }

    return new Payment(keyPair, counter, outputs, rewardAmount);
  }

  //returns Transaction
  async createIntegration(keyPair: KeyPair, blockchain: Blockchain, rewardAmount: number, witnessCount: number, outputs: IntegrationOutputConstructor[]): Promise<Integration> {
    const wallet = (await blockchain.getWallet(keyPair.pubSerialized)).val;

    let counter = wallet.counter;
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

    if (totalAmount + rewardAmount > wallet.balance) {
      throw new Error(`Total amount: ${totalAmount} + reward amount: ${rewardAmount} exceeds current known balance: ${wallet.balance}`);
    }

    return new Integration(keyPair, counter, outputs, witnessCount, rewardAmount);
  }

  //returns Transaction
  async createBrokerRegistration(keyPair: KeyPair, blockchain: Blockchain, rewardAmount: number, brokerName: string, endpoint: string, extraNodeMetadata?: RdfTriple[], extraLiteralMetadata?: RdfTriple[]): Promise<BrokerRegistration> {
    const wallet = (await blockchain.getWallet(keyPair.pubSerialized)).val;

    let counter = wallet.counter;
    const gotCounter = this.getCounter(keyPair);
    if (gotCounter > counter) {
      counter = gotCounter;
    }

    counter++;
    this.counter.set(keyPair.pubSerialized, counter);

    if (rewardAmount > wallet.balance) {
      throw new Error(`Reward amount: ${rewardAmount} exceeds current balance: ${wallet.balance}`);
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

  //return Transaction
  async createSensorRegistration(
    keyPair: KeyPair,
    blockchain: Blockchain,
    rewardAmount: number,
    sensorName: string,
    costPerMinute: number,
    costPerKB: number,
    interval: number | null,
    integrationBroker: string,
    extraNodeMetadata: RdfTriple[] | undefined,
    extraLiteralMetadata: RdfTriple[] | undefined): Promise<SensorRegistration> {

    const wallet = (await blockchain.getWallet(keyPair.pubSerialized)).val;

    let counter = wallet.counter;
    const gotCounter = this.getCounter(keyPair);
    if (gotCounter > counter) {
      counter = gotCounter;
    }

    counter++;
    this.counter.set(keyPair.pubSerialized, counter);

    if (rewardAmount > wallet.balance) {
      throw new Error(`Reward amount: ${rewardAmount} exceeds current balance: ${wallet.balance}`);
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
}

export default Wallet;

