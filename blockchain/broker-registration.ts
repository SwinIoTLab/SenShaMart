import { ChainUtil, type KeyPair, type Result, type NodeMetadata, type LiteralMetadata, isFailure } from '../util/chain-util.js';
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
  input: ChainUtil.validateIsPublicKey,
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
    this.signature = ChainUtil.createSignature(senderKeyPair.priv, BrokerRegistration.hashToSign(this));

    const verification = BrokerRegistration.verify(this);
    if (isFailure(verification)) {
      throw new Error(verification.reason);
    }
  }

  static getBrokerName(registration: BrokerRegistration): string {
    return registration.metadata.name;
  }

  static getEndpoint(registration: BrokerRegistration): string {
    return registration.metadata.endpoint;
  }

  static getExtraNodeMetadata(registration: BrokerRegistration): NodeMetadata[] {
    if ("extraNodes" in registration.metadata) {
      return registration.metadata.extraNodes;
    } else {
      return [];
    }
  }

  static getExtraLiteralMetadata(registration: BrokerRegistration): LiteralMetadata[] {
    if ("extraLiterals" in registration.metadata) {
      return registration.metadata.extraLiterals;
    } else {
      return [];
    }
  }

  static hashToSign(registration: BrokerRegistration):string {
    return ChainUtil.hash([
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

  static verify(registration: BrokerRegistration): Result {
    const validationRes = ChainUtil.validateObject(registration, baseValidation);
    if (!validationRes.result) {
      return validationRes;
    }

    const signatureRes = ChainUtil.verifySignature(
      ChainUtil.deserializePublicKey(registration.input),
      registration.signature,
      BrokerRegistration.hashToSign(registration));

    if (!signatureRes.result) {
      return signatureRes;
    }

    return {
      result: true
    };
  }

  static txName(): string {
    return "BrokerRegistration";
  }
}

export default BrokerRegistration;