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

/**
 * @author Josip Milovac
 */

import { ChainUtil, type KeyPair, type ResultFailure, type NodeMetadata, type LiteralMetadata, isFailure } from '../util/chain-util.js';
import { type RepeatableTransaction, type TransactionWrapper } from './transaction_base.js';

const nodeValidator = {
  s: ChainUtil.validateTerm,
  p: ChainUtil.validateTerm,
  o: ChainUtil.validateTerm
};

const literalValidator = {
  s: ChainUtil.validateTerm,
  p: ChainUtil.validateTerm,
  o: ChainUtil.validateLiteral
};

const metadataValidation = {
  name: ChainUtil.validateIsString,
  endpoint: ChainUtil.validateIsString,
  extraNodes: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(
      ChainUtil.createValidateObject(
        nodeValidator))),
  extraLiterals: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(
      ChainUtil.createValidateObject(
        literalValidator)))
}

const baseValidation = {
  input: ChainUtil.validateIsSerializedPublicKey,
  counter: ChainUtil.createValidateIsIntegerWithMin(0),
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  metadata: ChainUtil.createValidateObject(metadataValidation),
  signature: ChainUtil.validateIsSignature
};

type BrokerRegistrationMetadata = {
  name: string;
  endpoint: string;
  extraNodes?: NodeMetadata[],
  extraLiterals?: LiteralMetadata[]
}

class BrokerRegistration implements RepeatableTransaction {
  input: string;
  counter: number;
  rewardAmount: number;
  metadata: BrokerRegistrationMetadata;
  signature: string;
  constructor(senderKeyPair: KeyPair, counter: number, brokerName: string, endpoint: string, rewardAmount: number, nodeMetadata?: NodeMetadata[], literalMetadata?: LiteralMetadata[]) {
    this.input = ChainUtil.serializePublicKey(senderKeyPair.pub);
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.metadata = {
      name: brokerName,
      endpoint: endpoint
    };
    if (nodeMetadata !== undefined && nodeMetadata !== null) {
      this.metadata.extraNodes = nodeMetadata;
    }
    if (literalMetadata !== undefined && literalMetadata !== null) {
      this.metadata.extraLiterals = literalMetadata;
    }
    this.signature = ChainUtil.createSignature(senderKeyPair.priv, BrokerRegistration.toHash(this));

    const fail: ResultFailure = { result: false, reason: "" };

    if (!BrokerRegistration.verify(this, fail)) {
      throw new Error(fail.reason);
    }
  }

  static getBrokerName(registration: BrokerRegistration): string {
    return registration.metadata.name;
  }

  static getEndpoint(registration: BrokerRegistration): string {
    return registration.metadata.endpoint;
  }

  static getExtraNodeMetadata(registration: BrokerRegistration): NodeMetadata[] {
    if (registration.metadata.extraNodes !== undefined) {
      return registration.metadata.extraNodes;
    } else {
      return [];
    }
  }

  static getExtraLiteralMetadata(registration: BrokerRegistration): LiteralMetadata[] {
    if (registration.metadata.extraLiterals !== undefined) {
      return registration.metadata.extraLiterals;
    } else {
      return [];
    }
  }

  static toHash(registration: BrokerRegistration): string {
    return ChainUtil.stableStringify([
      registration.counter,
      registration.rewardAmount,
      registration.metadata]);
  }

  static wrap(tx: BrokerRegistration): TransactionWrapper<BrokerRegistration> {
    return {
      type: this,
      tx: tx
    };
  }

  static verify(t: unknown, fail: ResultFailure): t is BrokerRegistration {
    if (!ChainUtil.validateObject<BrokerRegistration>(t, baseValidation, fail)) {
      fail.reason = "Is not broker registration\n" + fail.reason;
      return false;
    }

    const signatureRes = ChainUtil.verifySignature(
      ChainUtil.deserializePublicKey(t.input),
      t.signature,
      BrokerRegistration.toHash(t));

    if (isFailure(signatureRes)) {
      fail.reason = "Is not broker registration\n" + signatureRes.reason;
      return false;
    }

    return true;
  }

  static txName(): string {
    return "BrokerRegistration";
  }
}

export default BrokerRegistration;
