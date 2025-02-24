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
 *         Josip Milovac
 */
import { ChainUtil, type KeyPair, type ResultFailure } from '../util/chain-util.js';
import { type RepeatableTransaction, type TransactionWrapper } from './transaction_base.js';
import SeedRandom from 'seedrandom';

const outputValidation = {
  sensorName: ChainUtil.validateIsString,
  amount: ChainUtil.createValidateIsIntegerWithMin(1),
  sensorHash: ChainUtil.validateIsString,
  brokerHash: ChainUtil.validateIsString
};

type Output = {
  amount: number,
  sensorName: string,
  sensorHash: string,
  brokerHash: string
}

function validateOutputs(t: unknown, fail: ResultFailure): t is Output[] {
  if (!ChainUtil.validateArray<Output>(t, (output, fail) => { return ChainUtil.validateObject(output, outputValidation, fail); }, fail)) {
    return false;
  }

  if (t.length <= 0) {
    fail.reason = "Length must be at least 1";
    return false;
  }

  return true;
}

const baseValidation = {
  input: ChainUtil.validateIsSerializedPublicKey,
  counter: ChainUtil.createValidateIsIntegerWithMin(1),
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  outputs: validateOutputs,
  witnessCount: ChainUtil.createValidateIsIntegerWithMin(0),
  signature: ChainUtil.validateIsSignature
};

type ResultWitnesses = {
  result: true;
  witnesses: string[];
}

class Integration implements RepeatableTransaction {
  input: string;
  counter: number;
  rewardAmount: number;
  outputs: Output[];
  witnessCount: number;
  signature: string;
  constructor(senderKeyPair: KeyPair, counter: number, outputs: Output[], witnessCount: number, rewardAmount: number) {
    this.input = ChainUtil.serializePublicKey(senderKeyPair.pub);
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.outputs = outputs;
    this.witnessCount = witnessCount;

    this.signature = ChainUtil.createSignature(senderKeyPair.priv, Integration.toHash(this));

    const fail: ResultFailure = { result: false, reason: "" };
    if (!Integration.verify(this, fail)) {
      throw new Error(fail.reason);
    }
  }

  static createOutput(amount: number, sensorName: string, sensorRegistrationHash: string, brokerRegistrationHash: string): Output {
    return {
      amount: amount,
      sensorName: sensorName,
      sensorHash: sensorRegistrationHash,
      brokerHash: brokerRegistrationHash
    };
  }

  static toHash(integration: Integration): string {
    return ChainUtil.stableStringify([
      integration.counter,
      integration.rewardAmount,
      integration.witnessCount,
      integration.outputs]);
  }
  static mqttTopic(integration: Integration): string {
    // TODO : think of a smarter way to get valid mqtt topics from this
    return ChainUtil.hash(Integration.toHash(integration)).replaceAll('+', '-');//need to change + to - for MQTT topics
  }

  static wrap(tx: Integration): TransactionWrapper<Integration> {
    return {
      tx: tx,
      type: this
    };
  }

  static verify(t:unknown, fail: ResultFailure): t is Integration {
    if (!ChainUtil.validateObject<Integration>(t, baseValidation, fail)) {
      fail.reason = "Is not an integration\n" + fail.reason;
      return false;
    }

    const verifyRes = ChainUtil.verifySignature(
      ChainUtil.deserializePublicKey(t.input),
      t.signature,
      Integration.toHash(t));
    if (!verifyRes.result) {
      fail.reason = "Is not an integration\n" + verifyRes.reason;
      return false;
    }

    return true;
  }

  static chooseWitnesses(integration: Integration, brokerList: string[]): ResultWitnesses | ResultFailure{
    const brokerListCopy = [...brokerList];
    brokerListCopy.sort();

    const witnessCount = integration.witnessCount;

    if (witnessCount > brokerList.length) {
      return {
        result: false,
        reason: "Not enough brokers for the number of witnesses requested"
      };
    }

    if (witnessCount === brokerList.length) {
      return {
        result: true,
        witnesses: brokerListCopy
      };
    }

    const rng = SeedRandom.alea(integration.signature + ChainUtil.hash(Integration.toHash(integration))) as SeedRandom.PRNG;

    const witnesses = [];

    for (let i = 0; i < witnessCount; ++i) {
      const chosen = Math.floor(rng() * brokerListCopy.length);

      witnesses.push(brokerListCopy[chosen]);
      brokerListCopy[chosen] = brokerListCopy[brokerListCopy.length - 1];
      brokerListCopy.pop();
    }


    return {
      result: true,
      witnesses: witnesses
    };
  }

  static txName(): string {
    return "Integration";
  }
}
export { Integration, type Output };
export default Integration;
