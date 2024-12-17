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
import { ChainUtil, type Result, isFailure, type KeyPair } from '../util/chain-util.js';
import { type Transaction, type TransactionWrapper } from './transaction_base.js';

const integrationValidation = {
  input: ChainUtil.validateIsPublicKey,
  counter: ChainUtil.createValidateIsIntegerWithMin(1)
};

const outputValidation = {
  i: ChainUtil.createValidateIsIntegerWithMin(0),
  commitRatio: ChainUtil.createValidateIsNumberWithMinMax(0, 1)
};

const baseValidation = {
  input: ChainUtil.validateIsPublicKey,
  integration: ChainUtil.createValidateObject(integrationValidation),
  outputs: ChainUtil.createValidateArray(ChainUtil.createValidateObject(outputValidation)),
  signature: ChainUtil.validateIsSignature
};

type Output = {
  i: number; //the index in the integration outputs this commit is referring to
  commitRatio: number; //the ratio to commit. 0 is a full refund, 1 is a full commit
};

class Witnessed implements Transaction {
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
    this.signature = ChainUtil.createSignature(senderKeyPair.priv, Witnessed.toHash(this));

    const verification = Witnessed.verify(this);
    if (isFailure(verification)) {
      throw new Error(verification.reason);
    }
  }

  static toHash(transaction: Witnessed): string {
    return ChainUtil.stableStringify([
      transaction.input,
      transaction.integration.counter,
      transaction.integration.input,
      transaction.outputs]);
  }

  static verify(transaction: Witnessed): Result {
    const validationRes = ChainUtil.validateObject(transaction, baseValidation);
    if (!validationRes.result) {
      return validationRes;
    }

    const verifyRes = ChainUtil.verifySignature(
      ChainUtil.deserializePublicKey(transaction.input),
      transaction.signature,
      Witnessed.toHash(transaction));
    if (!verifyRes.result) {
      return verifyRes;
    }

    return {
      result: true,
    };
  }

  static wrap(tx: Witnessed): TransactionWrapper<Witnessed> {
    return {
      tx: tx,
      type: this
    };
  }

  static txName(): string {
    return "Witnessed";
  }
}

export default Witnessed;