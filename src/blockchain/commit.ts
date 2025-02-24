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
          Josip Milovac
 */
import { ChainUtil, type ResultFailure, type KeyPair, isFailure } from '../util/chain-util.js';
import { type Transaction, type TransactionWrapper } from './transaction_base.js';

const integrationValidation = {
  input: ChainUtil.validateIsSerializedPublicKey,
  counter: ChainUtil.createValidateIsIntegerWithMin(1)
};

const outputValidation = {
  i: ChainUtil.createValidateIsIntegerWithMin(0),
  commitRatio: ChainUtil.createValidateIsNumberWithMinMax(0, 1)
};

const baseValidation = {
  input: ChainUtil.validateIsSerializedPublicKey,
  integration: ChainUtil.createValidateObject(integrationValidation),
  outputs: ChainUtil.createValidateArray(ChainUtil.createValidateObject(outputValidation)),
  signature: ChainUtil.validateIsSignature
};

type Output = {
  i: number; //the index in the integration outputs this commit is referring to
  commitRatio: number; //the ratio to commit. 0 is a full refund, 1 is a full commit
};

class Commit implements Transaction {
  input: string;
  integration: {
    input: string;
    counter: number;
  };
  outputs: Output[];
  
  signature: string;
  constructor(senderKeyPair: KeyPair, integrationInput: string, integrationCounter: number, outputs: Output[]) {

    this.input = ChainUtil.serializePublicKey(senderKeyPair.pub);
    this.integration = {
      input: integrationInput,
      counter: integrationCounter
    };
    this.outputs = outputs;
    this.signature = ChainUtil.createSignature(senderKeyPair.priv, Commit.toHash(this));

    const fail: ResultFailure = { result: false, reason: "" };
    if (!Commit.verify(this, fail)) {
      throw new Error(fail.reason);
    }
  }

  static createOutput(idx: number, commitRatio: number): Output {
    return {
      i: idx,
      commitRatio: commitRatio
    };
  }

  static toHash(transaction: Commit): string {
    return ChainUtil.stableStringify([
      transaction.input,
      transaction.integration.counter,
      transaction.integration.input,
      transaction.outputs]);
  }

  static verify(t: unknown, fail: ResultFailure): t is Commit {
    if (!ChainUtil.validateObject<Commit>(t, baseValidation, fail)) {
      fail.reason = "Is not a commit\n" + fail.reason;
      return false;
    }

    const verifyRes = ChainUtil.verifySignature(
      ChainUtil.deserializePublicKey(t.input),
      t.signature,
      Commit.toHash(t));
    if (isFailure(verifyRes)) {
      fail.reason = "Is not a commit\n" + verifyRes.reason;
      return false;
    }

    return true;
  }

  static wrap(tx: Commit): TransactionWrapper<Commit> {
    return {
      tx: tx,
      type: this
    };
  }

  static txName(): string {
    return "Commit";
  }
}

export default Commit;
