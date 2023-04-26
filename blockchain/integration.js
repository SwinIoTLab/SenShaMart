const ChainUtil = require('../chain-util');
const SeedRandom = require('seedrandom');

const outputValidation = {
  publicKey: ChainUtil.validateIsPublicKey,
  sensor: ChainUtil.validateIsString,
  amount: ChainUtil.createValidateIsIntegerWithMin(1),
  counter: ChainUtil.createValidateIsIntegerWithMin(1)
};

function validateOutputs(t) {
  const validateArrayRes = ChainUtil.validateArray(t, (output) => {
    return ChainUtil.validateObject(output, outputValidation);
  });

  if (!validateArrayRes.result) {
    return validateArrayRes;
  }

  if (t.length <= 0) {
    return {
      result: false,
      reason: "Integration must have at least 1 output"
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
  witnessCount: ChainUtil.createValidateIsIntegerWithMin(0),
  signature: ChainUtil.validateIsSignature
};

class Integration {
  constructor(senderKeyPair, counter, outputs, witnessCount, rewardAmount) {
    this.input = senderKeyPair.getPublic().encode('hex');
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.outputs = outputs;
    this.witnessCount = witnessCount;

    this.signature = senderKeyPair.sign(Integration.hashToSign(this));

    const verification = Integration.verify(this);
    if (!verification.result) {
      throw new Error(verification.reason);
    }
  }

  static createOutput(recipientPublicKey, sensorId, amount, counter) {
    return {
      publicKey: recipientPublicKey,
      sensor: sensorId,
      amount: amount,
      counter: counter
    };
  }

  static hashToSign(integration) {
    return ChainUtil.hash([
      integration.counter,
      integration.rewardAmount,
      integration.witnesses,
      integration.outputs]);
  }

  static verify(integration) {
    const validationRes = ChainUtil.validateObject(integration, baseValidation);
    if (!validationRes.result) {
      return validationRes;
    }

    const verifyRes = ChainUtil.verifySignature(
      integration.input,
      integration.signature,
      Integration.hashToSign(integration));
    if (!verifyRes.result) {
      return verifyRes;
    }

    return {
      result: true
    };
  }

  static chooseWitnesses(integration, brokerList) {
    const brokerListCopy = [...brokerList];
    brokerListCopy.sort();

    const witnessCount = integration.witnessCount;

    if (witnessCount > brokerList.length) {
      return {
        result: false,
        reason: "Not enough brokers for the number of witnesses requested"
      };
    }

    if (witnessCount === brokerList.length) {
      return {
        result: true,
        witnesses: brokerListCopy
      };
    }

    const rng = new SeedRandom.alea(integration.signature, Integration.hashToSign(integration));

    const witnesses = [];

    for (var i = 0; i < witnessCount; ++i) {
      const chosen = Math.floor(rng() * brokerListCopy.length);

      witnesses.push(brokerListCopy[chosen]);
      brokerListCopy[chosen] = brokerListCopy[brokerListCopy.length - 1];
      brokerListCopy.pop();
    }


    return {
      result: true,
      witnesses: witnesses
    };
  }
}

module.exports = Integration;