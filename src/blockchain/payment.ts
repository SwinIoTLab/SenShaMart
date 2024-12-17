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
import { ChainUtil, type Result, isFailure, type KeyPair } from '../util/chain-util.js';
import type { RepeatableTransaction, TransactionWrapper } from './transaction_base.js';

const outputValidation = {
  publicKey: ChainUtil.validateIsPublicKey,
  amount: ChainUtil.createValidateIsIntegerWithMin(1)
};

type Output = {
  publicKey: string,
  amount: number
};

function validateOutputs(t:unknown):Result {
  const validateRes = ChainUtil.validateArray(t, function (output) {
      return ChainUtil.validateObject(output, outputValidation);
    });
  if (isFailure(validateRes)) {
    return validateRes
  }

  const t_array = t as object[];

  if (t_array.length <= 0) {
    return {
      result: false,
      reason: "Outputs length isn't positive"
    };
  }

  return {
    result: true
  };
}

const baseValidation = {
  input: ChainUtil.validateIsPublicKey,
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

    const verification = Payment.verify(this);
    if (isFailure(verification)) {
      throw new Error(verification.reason);
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

  static verify(transaction: Payment):Result {
    const validationRes = ChainUtil.validateObject(transaction, baseValidation);
    if (!validationRes.result) {
      return validationRes;
    }

    const verifyRes = ChainUtil.verifySignature(
      ChainUtil.deserializePublicKey(transaction.input),
      transaction.signature,
      Payment.toHash(transaction));
    if (!verifyRes.result) {
      return verifyRes;
    }

    return {
      result: true,
    };
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
