const ChainUtil = require('../chain-util');

const outputValidation = {
  publicKey: ChainUtil.validateIsPublicKey,
  amount: ChainUtil.createValidateIsIntegerWithMin(1)
};

function validateOutputs(t) {
  let validateRes = ChainUtil.validateArray(t, function (output) {
      return ChainUtil.validateObject(output, outputValidation);
    });
  if (!validateRes.result) {
    return validateRes
  }

  if (t.length <= 0) {
    return {
      result: false,
      reason: "Outputs length isn't positive"
    };
  }

  return {
    result: true
  };
}

const baseValidation = {
  input: ChainUtil.validateIsPublicKey,
  counter: ChainUtil.createValidateIsIntegerWithMin(1),
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  outputs: validateOutputs,
  signature: ChainUtil.validateIsSignature
}

class Payment {
  constructor(senderKeyPair, counter, outputs, rewardAmount) {
    this.input = senderKeyPair.getPublic().encode('hex');
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.outputs = outputs;
    this.signature = senderKeyPair.sign(Payment.hashToSign(this));

    const verification = Payment.verify(this);
    if (!verification.result) {
      throw new Error(verification.reason);
    }
  }

  static hashToSign(transaction) {
    return ChainUtil.hash([
      transaction.counter,
      transaction.rewardAmount,
      transaction.outputs]);
  }

  static createOutput(recipient, amount) {
    return {
      publicKey: recipient,
      amount: amount
    };
  }

  static verify(transaction) {
    const validationRes = ChainUtil.validateObject(transaction, baseValidation);
    if (!validationRes.result) {
      return validationRes;
    }

    const verifyRes = ChainUtil.verifySignature(
      transaction.input,
      transaction.signature,
      Payment.hashToSign(transaction));
    if (!verifyRes.result) {
      return verifyRes;
    }

    return {
      result: true,
    };
  }
}

module.exports = Payment;