const ChainUtil = require('../chain-util');

const tripleValidator = {
  s: ChainUtil.validateIsString,
  p: ChainUtil.validateIsString,
  o: ChainUtil.validateIsString
};

function validateMetadata(t) {
  let isSensor = [];
  let costPerMinute = [];
  let costPerKB = [];
  let integrationBroker = [];

  const validationRes = ChainUtil.validateArray(t, ChainUtil.createValidateObject(tripleValidator));

  if (!validationRes.result) {
    return validationRes;
  }

  for (const triple of t) {
    switch (triple.p) {
      case "http://SSM/Cost_of_Using_IoT_Devices/Cost_Per_Minute": costPerMinute.push(triple); break;
      case "http://SSM/Cost_of_Using_IoT_Devices/Cost_Per_Kbyte": costPerKB.push(triple); break;
      case "http://www.w3.org/1999/02/22-rdf-syntax-ns#type":
        if (triple.o === "http://www.w3.org/ns/sosa/Sensor") {
          isSensor.push(triple.s);
        }
        break;
      case "http://SSM/Integration/Broker": integrationBroker.push(triple); break;
    }
  }

  if (isSensor.length === 0) {
    return {
      result: false,
      reason: "No sensor is defined"
    };
  } else if (isSensor.length > 1) {
    return {
      result: false,
      reason: "Multiple sensors are defined"
    };
  }

  const sensorName = isSensor[0];

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
  } else if (costPerMinute[0].s != sensorName) {
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
  } else if (costPerKB[0].s != sensorName) {
    return {
      result: false,
      reason: "Cost per KB object isn't the broker"
    };
  }

  if (integrationBroker.length === 0) {
    return {
      result: false,
      reason: "No integration broker was defined"
    };
  } else if (integrationBroker.length > 1) {
    return {
      result: false,
      reason: "Multiple integration brokers were defined"
    };
  } else if (integrationBroker[0].s != sensorName) {
    return {
      result: false,
      reason: "Integration broker subjsect isn't the sensor"
    };
  }

  return {
    result: true,
    metadata: {
      sensorName: sensorName,
      costPerMinute: CostPerMinuteValue,
      costPerKB: CostPerKBValue,
      integrationBroker: integrationBroker[0].o
    }
  };
}

const baseValidation = {
  input: ChainUtil.validateIsPublicKey,
  counter: ChainUtil.createValidateIsIntegerWithMin(1),
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  metadata: validateMetadata,
  signature: ChainUtil.validateIsSignature
};

class SensorRegistration {
  constructor(senderKeyPair, counter, metadata, rewardAmount) {
    this.input = senderKeyPair.getPublic().encode('hex');
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.metadata = metadata;
    this.signature = senderKeyPair.sign(SensorRegistration.hashToSign(this));

    const verification = SensorRegistration.verify(this);
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
    const validationResult = ChainUtil.validateObject(registration, baseValidation);
    if (!validationResult.result) {
      console.log(`Failed validation: ${validationResult.reason}`);
      return false;
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

  static getExtInformation(registration) {
    return validateMetadata(registration.metadata);
  }
}

module.exports = SensorRegistration;