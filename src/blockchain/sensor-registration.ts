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
  costPerMinute: ChainUtil.createValidateIsIntegerWithMin(0),
  costPerKB: ChainUtil.createValidateIsIntegerWithMin(0),
  integrationBroker: ChainUtil.validateIsString,
  interval: ChainUtil.createValidateIsEither(ChainUtil.validateIsNull, ChainUtil.createValidateIsIntegerWithMin(1)),
  extraNodes: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(
      ChainUtil.createValidateObject(
        nodeValidator))),
  extraLiterals: ChainUtil.createValidateOptional(
    ChainUtil.createValidateArray(
      ChainUtil.createValidateObject(
        literalValidator)))
};

const baseValidation = {
  input: ChainUtil.validateIsSerializedPublicKey,
  counter: ChainUtil.createValidateIsIntegerWithMin(1),
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  metadata: ChainUtil.createValidateObject(metadataValidation),
  signature: ChainUtil.validateIsSignature
};

type SensorRegistrationMetadata = {
  name: string;
  costPerMinute: number;
  costPerKB: number;
  integrationBroker: string;
  interval: number | null;
  extraNodes?: NodeMetadata[],
  extraLiterals?: LiteralMetadata[]
}


class SensorRegistration implements RepeatableTransaction {
  input: string;
  counter: number;
  rewardAmount: number;
  metadata: SensorRegistrationMetadata;
  signature: string;

  constructor(senderKeyPair: KeyPair, counter: number, sensorName: string, costPerMinute: number, costPerKB: number, integrationBroker: string, interval: number | null, rewardAmount: number, nodeMetadata?: NodeMetadata[], literalMetadata?: LiteralMetadata[]) {
    this.input = ChainUtil.serializePublicKey(senderKeyPair.pub);
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.metadata = {
      name: sensorName,
      costPerMinute: costPerMinute,
      costPerKB: costPerKB,
      interval: interval,
      integrationBroker: integrationBroker,
    };
    if (nodeMetadata !== undefined && nodeMetadata !== null) {
      this.metadata.extraNodes = nodeMetadata;
    }
    if (literalMetadata !== undefined && literalMetadata !== null) {
      this.metadata.extraLiterals = literalMetadata;
    }
    this.signature = ChainUtil.createSignature(senderKeyPair.priv, SensorRegistration.toHash(this));

    const fail: ResultFailure = { result: false, reason: "" };

    if (!SensorRegistration.verify(this, fail)) {
      throw new Error(fail.reason);
    }
  }

  static getSensorName(registration: SensorRegistration):string {
    return registration.metadata.name;
  }

  static getCostPerMinute(registration: SensorRegistration):number {
    return registration.metadata.costPerMinute;
  }

  static getCostPerKB(registration: SensorRegistration):number {
    return registration.metadata.costPerKB;
  }

  static getIntegrationBroker(registration: SensorRegistration):string {
    return registration.metadata.integrationBroker;
  }

  static hasInterval(registration: SensorRegistration): boolean {
    return registration.metadata.interval !== null;
  }

  static getInterval(registration: SensorRegistration): number | null {
    return registration.metadata.interval;
  }

  static getExtraNodeMetadata(registration: SensorRegistration): NodeMetadata[] {
    if (registration.metadata.extraNodes !== undefined) {
      return registration.metadata.extraNodes;
    } else {
      return [];
    }
  }

  static getExtraLiteralMetadata(registration: SensorRegistration): LiteralMetadata[] {
    if (registration.metadata.extraLiterals !== undefined) {
      return registration.metadata.extraLiterals;
    } else {
      return [];
    }
  }

  static toHash(registration: SensorRegistration): string {
    return ChainUtil.stableStringify([
      registration.counter,
      registration.rewardAmount,
      registration.metadata]);
  }

  static verify(t: unknown, fail: ResultFailure): t is SensorRegistration {
    if(!ChainUtil.validateObject<SensorRegistration>(t, baseValidation, fail)) {
      fail.reason = "Is not a SensorRegistration\n" + fail.reason;
      return false;
    }

    const verifyRes = ChainUtil.verifySignature(
      ChainUtil.deserializePublicKey(t.input),
      t.signature,
      SensorRegistration.toHash(t));
    if (isFailure(verifyRes)) {
      fail.reason = "Is not a valid SensorRegistration\n" + verifyRes.reason;
      return false;
    }

    return true;
  }

  static wrap(tx: SensorRegistration): TransactionWrapper<SensorRegistration> {
    return {
      tx: tx,
      type: this
    };
  }

  static txName() : string {
    return "SensorRegistration";
  }
}

export default SensorRegistration;
