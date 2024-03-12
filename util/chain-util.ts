import { generateKeyPairSync, createPublicKey, type KeyObject, createPrivateKey, createSign, createVerify, createHash } from 'node:crypto';
import { SENSHAMART_URI_PREFIX } from './constants.js';

export { ChainUtil, type ResultSuccess, type ResultFailure, type Result, type ValidatorI, type KeyObject, type KeyPair, type NodeMetadata, type LiteralMetadata, type Metadata, isFailure };

//function convertJsonKeyValueToRDFImpl(key, object) {
//  const returning = [];

//  for (const key in object) {
//    const value = object[key];

//    if (value instanceof Array) {
//    } else if (value instanceof Object) {
//      returning.push({
//        o
//      });
//    } else {
//    }
//  }
//}

const EC_CURVE_ALG = 'secp256k1';
const HASH_ALG = 'sha256';
const SIGN_ALG = 'SHA256';

const PEM_HEADER = '-----BEGIN PUBLIC KEY-----\n';
const PEM_FOOTER = '\n-----END PUBLIC KEY-----\n';

type NodeMetadata = {
  s: string,
  p: string,
  o: string
}

type LiteralMetadata = {
  s: string,
  p: string,
  o: string | number
}

type Metadata = NodeMetadata | LiteralMetadata;

interface ResultSuccess {
  result: true;
}

interface ResultFailure {
  result: false;
  reason: string;
}

function isFailure(res: ResultSuccess | ResultFailure): res is ResultFailure {
  return !res.result;
}

type Result = ResultSuccess | ResultFailure;

interface KeyPair {
  priv: KeyObject,
  pub: KeyObject
}

type ValidatorI = (v: unknown) => Result;

class ChainUtil {
  static genKeyPair(): KeyPair {
    const { publicKey, privateKey } = generateKeyPairSync("ec", {
      namedCurve: EC_CURVE_ALG
    });

    return {
      pub: publicKey,
      priv: privateKey
    };
  }

  static hash(data: unknown): string {
    const hash = createHash(HASH_ALG);
    hash.update(ChainUtil.stableStringify(data));
    return hash.digest('base64');
  }

  static createSignature(privateKey: KeyObject, dataHash: string) : string {
    const sign = createSign('SHA256');
    sign.update(dataHash, 'hex');
    sign.end();
    return sign.sign(privateKey, 'base64');
  }

  static verifySignature(publicKey: string, signature: string, dataHash: string): Result {
    const verify = createVerify(SIGN_ALG);
    verify.update(dataHash, 'hex');
    verify.end();
    if (verify.verify( signature, 'hex')) {
      return {
        result: true
      };
    } else {
      return {
        result: false,
        reason: "Couldn't verify signature"
      };
    }
  }

  static deserializePrivateKey(serialized: string) : KeyObject {
    return createPrivateKey(serialized);
  }

  static deserializeKeyPair(serialized: string): KeyPair {
    const priv = ChainUtil.deserializePrivateKey(serialized);

    return {
      priv: priv,
      pub: createPublicKey(priv)
    };
  }

  static deserializePublicKey(serialized: string): KeyObject {
    return createPublicKey(PEM_HEADER + serialized + PEM_FOOTER);
  }

  static serializePrivateKey(priv : KeyObject):string {
    return priv.export({
      type: 'sec1',
      format: 'pem'
    }) as string;
  }
  static serializeKeyPair(keyPair: KeyPair): string {
    return ChainUtil.serializePrivateKey(keyPair.priv);
  }
  static serializePublicKey(pub: KeyObject): string {
    return pub.export({
      type: 'spki',
      format: 'der'
    }).toString('base64');
  }

  //stable stringify for hashing
  static stableStringify(v: unknown): string {
    if (typeof v === "string") {
      return v;
    }
    if (!(v instanceof Object)) {
      return JSON.stringify(v);
    }

    if (v instanceof Array) {
      const array_v = v as [unknown];
      let returning = '[';

      for (let i = 0; i < array_v.length; i++) {
        if (typeof array_v[i] === "undefined" || array_v[i] === null) {
          returning += "null";
        } else {
          returning += ChainUtil.stableStringify(array_v[i]);
        }
        if (i !== array_v.length - 1) {
          returning += ',';
        }
      }

      returning += ']';
      return returning;
    } else {
      const v_object = v as { [index: string]: unknown };

      let returning = '{';

      const keys = Object.keys(v_object).sort();

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (!Object.prototype.hasOwnProperty.call(v_object, key)) {
          continue;
        }
        if (typeof v_object[key] === "undefined" || v_object[key] === null) {
          continue;
        } else {
          returning += `"${key}":${ChainUtil.stableStringify(v_object[key])}`;
          if (i !== keys.length - 1) {
            returning += ',';
          }
        }
      }
      returning += '}';
      return returning;
    }
  }

  static validateExists(t?: unknown): Result {
    if (typeof t === "undefined") {
      return {
        result: false,
        reason: "Is undefined"
      };
    }

    return {
      result: true
    };
  }

  static validateIsObject(t?: unknown): Result {
    if (typeof t === "undefined") {
      return {
        result: false,
        reason: "Is undefined"
      };
    }
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

  static validateIsString(t: unknown): Result {
    if (typeof t === "undefined") {
      return {
        result: false,
        reason: "Is undefined"
      };
    }
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

  static validateIsNumber(t: unknown): Result {
    if (typeof t === "undefined") {
      return {
        result: false,
        reason: "Is undefined"
      };
    }
    if (typeof t !== 'number') {
      return {
        result: false,
        reason: "Is not number"
      };
    }
    return {
      result: true
    };
  }

  static validateIsInteger(t: unknown): Result {
    if (typeof t === "undefined") {
      return {
        result: false,
        reason: "Is undefined"
      };
    }
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
  static validateIsIntegerWithMin(t: unknown, minimum:number): Result {
    if (typeof t === "undefined") {
      return {
        result: false,
        reason: "Is undefined"
      };
    }
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
  static createValidateIsIntegerWithMin(minimum: number): ValidatorI {
    return (t) => {
      return ChainUtil.validateIsIntegerWithMin(t, minimum);
    };
  }

  static validateIsPublicKey(t: unknown):Result {
    //TODO
    return ChainUtil.validateIsString(t);
  }

  static validateIsSignature(t: unknown): Result {
    return ChainUtil.validateIsString(t);
  }

  static validateArray(t: unknown, memberValidator:ValidatorI): Result {
    if (typeof t === "undefined") {
      return {
        result: false,
        reason: "Is undefined"
      };
    }
    if (!(t instanceof Array)) {
      return {
        result: false,
        reason: "Is not an Array"
      };
    }
    for (const member of t) {
      const res = memberValidator(member);
      if (isFailure(res)) {
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

  static createValidateArray(memberValidator:ValidatorI): ValidatorI {
    return function (t) {
      return ChainUtil.validateArray(t, memberValidator);
    };
  }

  static validateObject(t: unknown, memberValidator: { [index: string]: ValidatorI }): Result {
    if (typeof t === "undefined") {
      return {
        result: false,
        reason: "Is undefined"
      };
    }
    if (!(t instanceof Object)) {
      return {
        result: false,
        reason: "Is not an object"
      };
    }

    const t_obj = t as { [index: string]: unknown };

    for (const key in memberValidator) {
      const validator = memberValidator[key];

      //ALLOW OPTIONAL KEYS
      //if (!(key in t)) {
      //  return {
      //    result: false,
      //    reason: "Couldn't find key: " + key
      //  };
      //}

      const res = validator(t_obj[key]);

      if (isFailure(res)) {
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

  static createValidateObject(memberValidator: { [index: string]: ValidatorI }): ValidatorI {
    return function (t) {
      return ChainUtil.validateObject(t, memberValidator);
    };
  }

  static createValidateOptional(validator: ValidatorI): ValidatorI {
    return function (t) {
      if (typeof t === "undefined") {
        return {
          result: true
        };
      }

      return validator(t);
    };
  }

  static validateTerm(t: unknown): Result {
    const stringRes = ChainUtil.validateIsString(t);

    if (!stringRes.result) {
      return stringRes;
    }

    if ((t as string).startsWith(SENSHAMART_URI_PREFIX)) {
      return {
        result: false,
        reason: "Starts with reserved prefix"
      };
    }

    return {
      result: true
    };
  }

  static validateLiteral(t: unknown) : Result {
    const termRes = ChainUtil.validateTerm(t);
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
}