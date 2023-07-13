const ChainUtil = require('../util/chain-util');
const Integration = require('./integration');

const integrationValidation = {
  input: ChainUtil.valdiateIsPublicKey,
  counter: ChainUtil.createValidateIsIntegerWithMin(1)
};

const baseValidation = {
  input: ChainUtil.validateIsPublicKey,
  brokerName: ChainUtil.validateIsString,
  integration: ChainUtil.createValidateObject(integrationValidation),
  signature: ChainUtil.validateIsSignature
};

class Compensation {
  constructor(senderKeyPair, brokerName, integration) {
    const verifyIntegration = Integration.verify(integration);

    if (!verifyIntegration.result) {
      throw new Error(verifyIntegration.reason);
    }

    this.input = senderKeyPair.getPublic().encode('hex');
    this.brokerName = brokerName;
    this.integration = {
      input: integration.input,
      counter: integration.counter
    };
    this.signature = senderKeyPair.sign(Compensation.hashToSign(this));

    const verification = Compensation.verify(this);
    if (!verification.result) {
      throw new Error(verification.reason);
    }
  }

  static hashToSign(transaction) {
    return ChainUtil.hash([
      transaction.input,
      transaction.brokerName,
      transaction.integration]);
  }

  static verify(transaction) {
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

  static name() {
    return "Compensation";
  }
}

module.exports = Compensation;