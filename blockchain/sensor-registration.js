const ChainUtil = require('../util/chain-util');
const SENSHAMART_URI_PREFIX = require('../util/constants').SENSHAMART_URI_PREFIX;

function validateTerm(t) {
  const stringRes = ChainUtil.validateIsString(t);

  if (!stringRes.result) {
    return stringRes;
  }

  if (t.startsWith(SENSHAMART_URI_PREFIX)) {
    return {
      result: false,
      reason: "Starts with reserved prefix"
    };
  }

  return {
    result: true
  };
}

function validateLiteral(t) {
  const termRes = validateTerm(t);
  if (termRes.result) {
    return termRes;
  }

  const numberRes = ChainUtil.validateIsNumber(t);

  if (numberRes.result) {
    return numberRes;
  }

  return {
    result: false,
    reason: "Wasn't a string or a number"
  };
}

const nodeValidator = {
  s: validateTerm,
  p: validateTerm,
  o: validateTerm
};

const literalValidator = {
  s: validateTerm,
  p: validateTerm,
  o: validateLiteral
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

class SensorRegistration {
  constructor(senderKeyPair, counter, sensorName, costPerMinute, costPerKB, integrationBroker, nodeMetadata, literalMetadata, rewardAmount) {
    this.input = senderKeyPair.getPublic().encode('hex');
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.metadata = {
      name: sensorName,
      costPerMinute: costPerMinute,
      costPerKB: costPerKB,
      integrationBroker: integrationBroker,
    };
    if (typeof nodeMetadata !== undefined && nodeMetadata !== null) {
      this.metadata.extraNodes = nodeMetadata;
    }
    if (typeof literalMetadata !== undefined && literalMetadata !== null) {
      this.metadata.extraLiterals = literalMetadata;
    }
    this.signature = senderKeyPair.sign(SensorRegistration.hashToSign(this));

    const verification = SensorRegistration.verify(this);
    if (!verification.result) {
      throw new Error(verification.reason);
    }
  }

  static getSensorName(registration) {
    return registration.metadata.name;
  }

  static getCostPerMinute(registration) {
    return registration.metadata.costPerMinute;
  }

  static getCostPerKB(registration) {
    return registration.metadata.costPerKB;
  }

  static getIntegrationBroker(registration) {
    return registration.metadata.integrationBroker;
  }

  static getExtraNodeMetadata(registration) {
    if ("extraNodes" in registration.metadata) {
      return registration.metadata.extraNodes;
    } else {
      return [];
    }
  }

  static getExtraLiteralMetadata(registration) {
    if ("extraLiterals" in registration.metadata) {
      return registration.metadata.extraLiterals;
    } else {
      return [];
    }
  }

  static hashToSign(registration) {
    return ChainUtil.hash([
      registration.counter,
      registration.rewardAmount,
      registration.metadata]);
  }

  static verify(registration) {
    const validationResult = ChainUtil.validateObject(registration, baseValidation);
    if (!validationResult.result) {
      return validationResult;
    }

    const verifyRes = ChainUtil.verifySignature(
      registration.input,
      registration.signature,
      SensorRegistration.hashToSign(registration));
    if (!verifyRes.result) {
      return verifyRes;
    }

    return {
      result: true
    };
  }

  static name() {
    return "SensorRegistration";
  }
}

module.exports = SensorRegistration;