const EC = require('elliptic').ec;
const SHA256 = require('crypto-js/sha256');
const { v1 : uuidV1 } =  require ('uuid');
const ec = new EC('secp256k1');

function convertJsonKeyValueToRDFImpl(key, object) {
  const returning = [];

  for (const key in object) {
    const value = object[key];

    if (value instanceof Array) {
    } else if (value instanceof Object) {
      returning.push({
        o
      });
    } else {
    }
  }
}

class ChainUtil {
  static genKeyPair() {
    return ec.genKeyPair();
  }

  static id() {
    return uuidV1();
  }

  static hash(data) {
    return SHA256(ChainUtil.stableStringify(data)).toString();
  }

  static verifySignature(publicKey, signature, dataHash) {
    //TODO, validate signature object
    if (!ec.keyFromPublic(publicKey, 'hex').verify(dataHash, signature)) {
      return {
        result: false,
        reason: "Couldn't verify signature"
      };
    } else {
      return {
        result: true
      };
    }
  }

  static deserializeKeyPair(serialized) {
    return ec.keyFromPrivate(serialized, 'hex');
  }

  static serializeKeyPair(keyPair) {
    return keyPair.getPrivate().toString('hex');
  }

  //stable stringify for hashing
  static stableStringify(object) {

    if (object instanceof Array) {
      let returning = '[';

      for (let i = 0; i < object.length; i++) {
        if (typeof object[i] === "undefined" || object[i] === null) {
          returning += "null";
        } else {
          returning += ChainUtil.stableStringify(object[i]);
        }
        if (i !== object.length - 1) {
          returning += ',';
        }
      }

      returning += ']';
      return returning;
    }
    if (!(object instanceof Object)) {
      return JSON.stringify(object);
    }

    let returning = '{';

    const keys = Object.keys(object).sort();
    
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!object.hasOwnProperty(key)) {
        continue;
      }
      if (typeof object[key] === "undefined" || object[key] === null) {
        continue;
      } else {
        returning += `"${key}":${ChainUtil.stableStringify(object[key])}`;
        if (i !== keys.length - 1) {
          returning += ',';
        }
      }
    }
    returning += '}';
    return returning;
  }

  static validateAlways(_) {
    return {
      result: true
    };
  }

  static validateIsObject(t) {
    if (typeof t !== 'object') {
      return {
        result: false,
        reason: "Is not an object"
      };
    }

    return {
      result: true
    };
  }

  static validateIsString(t) {
    if (typeof t === 'string') {
      return {
        result: true
      };
    } else {
      return {
        result: false,
        reason: "Is not string"
      };
    }
  }

  static validateIsInteger(t) {
    if (typeof t !== 'number') {
      return {
        result: false,
        reason: "Is not number"
      };

    } else if (!Number.isInteger(t)) {
      return {
        result: false,
        reason: "Is not integer"
      };
    }
    return {
      result: true
    };
  }

  //includes minimum
  static validateIsIntegerWithMin(t, minimum) {
    if (typeof t !== 'number') {
      return {
        result: false,
        reason: "Is not number"
      };
    } else if (!Number.isInteger(t)) {
      return {
        result: false,
        reason: "Is not integer"
      };
    } else if (t < minimum) {
      return {
        result: false,
        reason: "Is below minimum"
      }
    }
    return {
      result: true
    };
  }

  //includes minimum
  static createValidateIsIntegerWithMin(minimum) {
    return (t) => {
      return ChainUtil.validateIsIntegerWithMin(t, minimum);
    };
  }

  static validateIsPublicKey(t) {
    //TODO
    return {
      result: true
    };
  }

  static validateIsSignature(t) {
    //TODO
    return {
      result: true
    };
  }

  static validateArray(t, memberValidator) {
    if (!(t instanceof Array)) {
      return {
        result: false,
        reason: "Is not an Array"
      };
    }
    for (const member of t) {
      const res = memberValidator(member);
      if (!res.result) {
        return {
          result: false,
          reason: "Array member validation failed: " + res.reason
        };
      }
    }
    return {
      result: true
    };
  }

  static createValidateArray(memberValidator) {
    return function (t) {
      return ChainUtil.validateArray(t, memberValidator);
    };
  }

  static validateObject(t, memberValidator) {
    if (!(t instanceof Object)) {
      return {
        result: false,
        reason: "Is not an object"
      };
    }

    for (const key in memberValidator) {
      const validator = memberValidator[key];

      if (!(key in t)) {
        return {
          result: false,
          reason: "Couldn't find key: " + key
        };
      }

      const res = validator(t[key]);

      if (!res.result) {
        return {
          result: false,
          reason: `Validator for key '${key}' failed: ${res.reason}`
        };
      }
    }

    for (const key in t) {
      if (!(key in memberValidator)) {
        return {
          result: false,
          reason: "Verifying has key not in validators"
        }
      }
    }

    return {
      result: true
    };
  }

  static createValidateObject(memberValidator) {
    return function (t) {
      return ChainUtil.validateObject(t, memberValidator);
    }
  }
}

module.exports = ChainUtil;