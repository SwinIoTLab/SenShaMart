import { ChainUtil, type Result, isFailure, type KeyPair } from '../util/chain-util.js';
import { type Transaction, type TransactionWrapper } from './transaction_base.js';
import Integration from './integration.js';

const integrationValidation = {
  input: ChainUtil.validateIsPublicKey,
  counter: ChainUtil.createValidateIsIntegerWithMin(1)
};

const baseValidation = {
  input: ChainUtil.validateIsPublicKey,
  brokerName: ChainUtil.validateIsString,
  integration: ChainUtil.createValidateObject(integrationValidation),
  signature: ChainUtil.validateIsSignature
};

class Compensation implements Transaction {
  input: string;
  brokerName: string;
  integration: {
    input: string;
    counter: number;
  };
  signature: string;
  constructor(senderKeyPair: KeyPair, brokerName:string, integration:Integration) {
    const verifyIntegration = Integration.verify(integration);

    if (isFailure(verifyIntegration)) {
      throw new Error(verifyIntegration.reason);
    }

    this.input = ChainUtil.serializePublicKey(senderKeyPair.pub);
    this.brokerName = brokerName;
    this.integration = {
      input: integration.input,
      counter: integration.counter
    };
    this.signature = ChainUtil.createSignature(senderKeyPair.priv, Compensation.hashToSign(this));

    const verification = Compensation.verify(this);
    if (isFailure(verification)) {
      throw new Error(verification.reason);
    }
  }

  static hashToSign(transaction: Compensation): string {
    return ChainUtil.hash([
      transaction.input,
      transaction.brokerName,
      transaction.integration]);
  }

  static verify(transaction: Compensation): Result {
    const validationRes = ChainUtil.validateObject(transaction, baseValidation);
    if (!validationRes.result) {
      return validationRes;
    }

    const verifyRes = ChainUtil.verifySignature(
      transaction.input,
      transaction.signature,
      Compensation.hashToSign(transaction));
    if (!verifyRes.result) {
      return verifyRes;
    }

    return {
      result: true,
    };
  }

  static wrap(tx: Compensation): TransactionWrapper<Compensation> {
    return {
      tx: tx,
      type: this
    };
  }

  static txName() : string {
    return "Compensation";
  }
}

export default Compensation;