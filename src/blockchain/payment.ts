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
import { ChainUtil, type ResultFailure, isFailure, type KeyPair } from '../util/chain-util.js';
import type { RepeatableTransaction, TransactionWrapper } from './transaction_base.js';

const outputValidation = {
  publicKey: ChainUtil.validateIsSerializedPublicKey,
  amount: ChainUtil.createValidateIsIntegerWithMin(1)
};

type Output = {
  publicKey: string,
  amount: number
};

function validateOutputs(t:unknown, fail: ResultFailure): boolean {
  if (!ChainUtil.validateArray(t, function (output, fail) { return ChainUtil.validateObject(output, outputValidation, fail); }, fail)) {
    return false;
  }

  if (t.length <= 0) {
    fail.reason = "Output lengths must be greater than 0";
    return false;
  }

  return true;
}

const baseValidation = {
  input: ChainUtil.validateIsSerializedPublicKey,
  counter: ChainUtil.createValidateIsIntegerWithMin(1),
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  outputs: validateOutputs,
  signature: ChainUtil.validateIsSignature
}

class Payment implements RepeatableTransaction {
  input: string;
  counter: number;
  rewardAmount: number;
  outputs: Output[];
  signature: string;
  constructor(senderKeyPair: KeyPair, counter: number, outputs: Output[], rewardAmount: number) {
    this.input = ChainUtil.serializePublicKey(senderKeyPair.pub);
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.outputs = outputs;
    this.signature = ChainUtil.createSignature(senderKeyPair.priv, Payment.toHash(this));

    const fail: ResultFailure = { result: false, reason: "" };
    if (!Payment.verify(this,fail)) {
      throw new Error(fail.reason);
    }
  }

  static toHash(transaction: Payment): string {
    return ChainUtil.stableStringify([
      transaction.counter,
      transaction.rewardAmount,
      transaction.outputs]);
  }

  static createOutput(recipient: string, amount: number): Output {
    if (amount < 1) {
      throw new Error("Invalid amount, must be 1 or greater");
    }
    return {
      publicKey: recipient,
      amount: amount
    };
  }

  static verify(t: unknown, fail: ResultFailure): t is Payment {
    if (!ChainUtil.validateObject<Payment>(t, baseValidation, fail)) {
      fail.reason = "Is not a payment\n" + fail.reason;
      return false;
    }

    const verifyRes = ChainUtil.verifySignature(
      ChainUtil.deserializePublicKey(t.input),
      t.signature,
      Payment.toHash(t));
    if (isFailure(verifyRes)) {
      fail.reason = "Is not a payment\n" + verifyRes.reason;
      return false;
    }

    return true;
  }

  static wrap(tx: Payment): TransactionWrapper<Payment> {
    return {
      tx: tx,
      type: Payment
    };
  }

  static txName():string {
    return "Payment";
  }
}

export { Payment, type Output };
export default Payment;
