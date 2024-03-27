import { ChainUtil, type KeyPair, type Result, type ResultFailure, type NodeMetadata, type LiteralMetadata, isFailure } from '../util/chain-util.js';
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
  input: ChainUtil.validateIsPublicKey,
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
  extraNodes?: NodeMetadata[],
  extraLiterals?: LiteralMetadata[]
}


class SensorRegistration implements RepeatableTransaction {
  input: string;
  counter: number;
  rewardAmount: number;
  metadata: SensorRegistrationMetadata;
  signature: string;

  constructor(senderKeyPair: KeyPair, counter: number, sensorName: string, costPerMinute: number, costPerKB: number, integrationBroker: string, rewardAmount?: number, nodeMetadata?: NodeMetadata[], literalMetadata?: LiteralMetadata[]) {
    this.input = ChainUtil.serializePublicKey(senderKeyPair.pub);
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.metadata = {
      name: sensorName,
      costPerMinute: costPerMinute,
      costPerKB: costPerKB,
      integrationBroker: integrationBroker,
    };
    if (nodeMetadata !== undefined && nodeMetadata !== null) {
      this.metadata.extraNodes = nodeMetadata;
    }
    if (literalMetadata !== undefined && literalMetadata !== null) {
      this.metadata.extraLiterals = literalMetadata;
    }
    this.signature = ChainUtil.createSignature(senderKeyPair.priv, SensorRegistration.hashToSign(this));

    const verification = SensorRegistration.verify(this);
    if (isFailure(verification)) {
      throw new Error((verification as ResultFailure).reason);
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

  static getExtraNodeMetadata(registration: SensorRegistration): NodeMetadata[] {
    if ("extraNodes" in registration.metadata) {
      return registration.metadata.extraNodes;
    } else {
      return [];
    }
  }

  static getExtraLiteralMetadata(registration: SensorRegistration): LiteralMetadata[] {
    if ("extraLiterals" in registration.metadata) {
      return registration.metadata.extraLiterals;
    } else {
      return [];
    }
  }

  static hashToSign(registration: SensorRegistration):string {
    return ChainUtil.hash([
      registration.counter,
      registration.rewardAmount,
      registration.metadata]);
  }

  static verify(registration: SensorRegistration):Result {
    const validationResult = ChainUtil.validateObject(registration, baseValidation);
    if (!validationResult.result) {
      return validationResult;
    }

    const verifyRes = ChainUtil.verifySignature(
      ChainUtil.deserializePublicKey(registration.input),
      registration.signature,
      SensorRegistration.hashToSign(registration));
    if (!verifyRes.result) {
      return verifyRes;
    }

    return {
      result: true
    };
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