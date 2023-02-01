const ChainUtil = require('../chain-util');

const outputValidation = {
  publicKey: ChainUtil.validateIsPublicKey,
  sensor: ChainUtil.validateIsString,
  amount: ChainUtil.createValidateIsIntegerWithMin(1),
};

function validateOutputs(t) {
  if (!ChainUtil.validateArray(t, (output) => {
    return ChainUtil.validateObject(output, outputValidation).result;
  })) {
    return false;
  }

  if (t.outputs.length <= 0) {
    return false;
  }

  return true;
}

const baseValidation = {
  input: ChainUtil.validateIsPublicKey,
  counter: ChainUtil.createValidateIsIntegerWithMin(1),
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  outputs: validateOutputs,
  signature: ChainUtil.validateIsSignature
};

class Integration {
  constructor(senderKeyPair, counter, outputs, rewardAmount) {
    this.input = senderKeyPair.getPublic().encode('hex');
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.outputs = outputs;
    this.signature = senderKeyPair.sign(Integration.hashToSign(this));


    const verification = Integration.verify(this);
    if (!verification.result) {
      throw new Error(verification.reason);
    }
  }

  static createOutput(recipientPublicKey, sensorId, amount) {
    return {
      publicKey: recipientPublicKey,
      sensor: sensorId,
      amount: amount
    };
  }

  static hashToSign(registration) {
    return ChainUtil.hash([
      registration.counter,
      registration.rewardAmount,
      registration.outputs]);
  }

  static verify(registration) {
    const validationRes = ChainUtil.validateObject(registration, baseValidation);
    if (!validationRes.result) {
      return validationRes;
    }

    const verifyRes = ChainUtil.verifySignature(
      registration.input,
      registration.signature,
      Integration.hashToSign(registration));
    if (!verifyRes.result) {
      return verifyRes;
    }

    return {
      result: true
    };
  }
}

module.exports = Integration;