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

const outputValidation = {
  commitRatio: ChainUtil.createValidateIsNumberWithMinMax(0, 1)
};

type Output = {
  commitRatio: number; //the ratio to commit. 0 is a full refund, 1 is a full commit
};

type OutputConstructor = Output & {
  sensorName: string;
};

function validateOutputs(t: unknown, fail: ResultFailure): t is { [index: string]: Output } {
  if (!ChainUtil.validateMap<Output>(t, ChainUtil.createValidateObject(outputValidation), fail)) {
    fail.reason = "Output failed map validation\n" + fail.reason;
    return false;
  }

  if (Object.keys(t).length <= 0) {
    fail.reason = "Length must be at least 1";
    return false;
  }

  return true;
}

const baseValidation = {
  input: ChainUtil.validateIsSerializedPublicKey,
  integrationKey: ChainUtil.validateIsString,
  outputs: validateOutputs,
  signature: ChainUtil.validateIsSignature
};

class Commit implements Transaction {
  input: string;
  integrationKey: string;
  outputs: { [index: string]: Output };
  
  signature: string;
  constructor(senderKeyPair: KeyPair, integrationKey: string, outputs: OutputConstructor[]) {
    this.input = ChainUtil.serializePublicKey(senderKeyPair.pub);
    this.integrationKey = integrationKey;
    this.outputs = {};
    for (const output of outputs) {
      this.outputs[output.sensorName] = {
        commitRatio: output.commitRatio
      };
    }
    if (Object.keys(this.outputs).length !== outputs.length) {
      throw new Error("Outputs had non unique sensor names");
    }
    this.signature = ChainUtil.createSignature(senderKeyPair.priv, Commit.toHash(this));

    const fail: ResultFailure = { result: false, reason: "" };
    if (!Commit.verify(this, fail)) {
      throw new Error(fail.reason);
    }
  }

  static createOutput(sensorName: string, commitRatio: number): OutputConstructor {
    return {
      sensorName: sensorName,
      commitRatio: commitRatio
    };
  }

  static toHash(transaction: Commit): string {
    return ChainUtil.stableStringify([
      transaction.input,
      transaction.integrationKey,
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
export { Commit, type Output };
