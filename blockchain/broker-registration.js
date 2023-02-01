const ChainUtil = require('../chain-util');

const tripleValidator = {
  s: ChainUtil.validateIsString,
  p: ChainUtil.validateIsString,
  o: ChainUtil.validateIsString
};

function validateMetadata(t) {
  
  let isBroker = [];
  let costPerMinute = [];
  let costPerKB = [];
  let integrationEndpoint = [];

  const validationRes = ChainUtil.validateArray(t, ChainUtil.createValidateObject(tripleValidator));

  if (!validationRes.result) {
    return validationRes;
  }

  for (const triple of t) {
    switch (triple.p) {
      case "IoT device metadata/Cost_of_Using_IoT_Devices/Cost_Per_Minute": costPerMinute.push(triple); break;
      case "IoT device metadata/Cost_of_Using_IoT_Devices/Cost_Per_Kbyte": costPerKB.push(triple); break;
      case "http://www.w3.org/1999/02/22-rdf-syntax-ns#type":
        if (triple.o === "SSM/Broker") {
          isBroker.push(triple.s);
        }
        break;
      case "IoT device metadata/Integration/Endpoint": integrationEndpoint.push(triple); break;
    }
  }

  if (isBroker.length === 0) {
    return {
      result: false,
      reason: "No broker is defined"
    };
  } else if (isBroker.length > 1) {
    return {
      result: false,
      reason: "Multiple brokers are defined"
    };
  }

  const brokerName = isBroker[0];

  if (costPerMinute.length === 0) {
    return {
      result: false,
      reason: "No cost per minute was defined"
    };
  } else if (costPerMinute.length > 1) {
    return {
      result: false,
      reason: "Multiple cost per minutes were defined"
    }
  }
  const CostPerMinuteValue = Number.parseInt(costPerMinute[0].o);
  if (CostPerMinuteValue === NaN) {
    return {
      result: false,
      reason: "Couldn't parse cost per minute as an integer"
    };
  } else if (CostPerMinuteValue < 1) {
    return {
      result: false,
      reason: "Cost per minute was negative"
    }
  } else if (costPerMinute[0].s != brokerName) {
    return {
      result: false,
      reason: "Cost per minute object isn't the broker"
    };
  }

  if (costPerKB.length === 0) {
    return {
      result: false,
      reason: "No cost per KB was defined"
    };
  } else if (costPerKB.length > 1) {
    return {
      result: false,
      reason: "Multiple cost per KB were defined"
    }
  }
  const CostPerKBValue = Number.parseInt(costPerKB[0].o);
  if (CostPerKBValue === NaN) {
    return {
      result: false,
      reason: "Couldn't parse cost per KB as an integer"
    };
  } else if (CostPerKBValue < 1) {
    return {
      result: false,
      reason: "Cost per KB was negative"
    }
  } else if (costPerKB[0].s != brokerName) {
    return {
      result: false,
      reason: "Cost per KB object isn't the broker"
    };
  }

  if (integrationEndpoint.length === 0) {
    return {
      result: false,
      reason: "No integration endpoint was defined"
    };
  } else if (integrationEndpoint.length > 1) {
    return {
      result: false,
      reason: "Multiple integration endpoints were defined"
    };
  } else if (integrationEndpoint[0].s != brokerName) {
    return {
      result: false,
      reason: "Integration endpoint object isn't the broker"
    };
  }

  return {
    result: true,
    metadata: {
      brokerName: brokerName,
      costPerMinute: CostPerMinuteValue,
      costPerKB: CostPerKBValue,
      integrationEndpoint: integrationEndpoint[0].o
    }
  };
}

const baseValidation = {
  input: ChainUtil.validateIsPublicKey,
  counter: ChainUtil.validateIsInteger,
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  metadata: validateMetadata,
  signature: ChainUtil.validateIsSignature
};

class BrokerRegistration {
  constructor(senderKeyPair, counter, metadata, rewardAmount) {
    this.input = senderKeyPair.getPublic().encode('hex');
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.metadata = metadata;
    this.signature = senderKeyPair.sign(BrokerRegistration.hashToSign(this));

    const verification = BrokerRegistration.verify(this);
    if (!verification.result) {
      throw new Error(verification.reason);
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
      return signatureRes.reason;
    }

    return {
      result: true
    };
  }

  static getExtInformation(registration) {
    return validateMetadata(registration.metadata);
  }
}

module.exports = BrokerRegistration;