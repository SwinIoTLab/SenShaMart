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

class BrokerRegistration {
  constructor(senderKeyPair, counter, brokerName, endpoint, nodeMetadata, literalMetadata, rewardAmount) {
    this.input = senderKeyPair.getPublic().encode('hex');
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.metadata = {
      name: brokerName,
      endpoint: endpoint
    };
    if (typeof nodeMetadata !== undefined && nodeMetadata !== null) {
      this.metadata.extraNodes = nodeMetadata;
    };
    if (typeof literalMetadata !== undefined && literalMetadata !== null) {
      this.metadata.extraLiterals = literalMetadata;
    };
    this.signature = senderKeyPair.sign(BrokerRegistration.hashToSign(this));

    const verification = BrokerRegistration.verify(this);
    if (!verification.result) {
      throw new Error(verification.reason);
    }
  }

  static getBrokerName(registration) {
    return registration.metadata.name;
  }

  static getEndpoint(registration) {
    return registration.metadata.endpoint;
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
    const validationRes = ChainUtil.validateObject(registration, baseValidation);
    if (!validationRes.result) {
      return validationRes;
    }

    const signatureRes = ChainUtil.verifySignature(
      registration.input,
      registration.signature,
      BrokerRegistration.hashToSign(registration));

    if (!signatureRes.result) {
      return signatureRes;
    }

    return {
      result: true
    };
  }

  static name() {
    return "BrokerRegistration";
  }
}

module.exports = BrokerRegistration;