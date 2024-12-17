import { generateKeyPairSync, createPublicKey, type KeyObject, createPrivateKey, createSign, createVerify, createHash, type Encoding } from 'node:crypto';
import { SENSHAMART_URI_PREFIX } from './constants.js';

export { ChainUtil, type ResultSuccess, type ResultValue, type ResultFailure, type Result, type ValuedResult, type ValidatorI, type KeyObject, type KeyPair, type NodeMetadata, type LiteralMetadata, type Metadata, isFailure, resultFromError };

const EC_CURVE_ALG = 'secp256k1';
const HASH_ALG = 'sha256';
const SIGN_ALG = 'SHA256';

const PUBLIC_PEM_HEADER = '-----BEGIN PUBLIC KEY-----\n';
const PUBLIC_PEM_FOOTER = '\n-----END PUBLIC KEY-----\n';

const PRIVATE_PEM_HEADER = '-----BEGIN EC PRIVATE KEY-----\n';
const PRIVATE_PEM_FOOTER = '\n-----END EC PRIVATE KEY-----\n';

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

export type ResolveCb = (res?: unknown) => void;
export type RejectCb = (err: Error) => void;

interface ResultSuccess {
  result: true;
}

interface ResultValue<T> extends ResultSuccess {
  value: T;
}

interface ResultFailure {
  result: false;
  reason: string;
}

function isFailure(res: ResultSuccess | ResultFailure): res is ResultFailure {
  return !res.result;
}

type Result = ResultSuccess | ResultFailure;

type ValuedResult<T> = ResultValue<T> | ResultFailure;

function resultFromError(err: Error | null): Result {
  if (err === null) {
    return {
      result: true
    };
  } else {
    return {
      result: false,
      reason: err.message + '\n' + err.stack
    };
  }
}

interface KeyPair {
  priv: KeyObject,
  pub: KeyObject,
  pubSerialized: string
}

type ValidatorI = (v: unknown) => Result;

//an object to store a bunch of static utility functions
class ChainUtil {
  //generate a new key pair
  static genKeyPair(): KeyPair {
    const { publicKey, privateKey } = generateKeyPairSync("ec", {
      namedCurve: EC_CURVE_ALG
    });

    return {
      pub: publicKey,
      priv: privateKey,
      pubSerialized: ChainUtil.serializePublicKey(publicKey)
    };
  }

  //hash some unknown data
  static hashUnknown(data: unknown): string {
    const hash = createHash(HASH_ALG);
    hash.update(ChainUtil.stableStringify(data));
    return hash.digest('base64');
  }
  static hash(data: string, type: Encoding = 'utf8'): string {
    const hash = createHash(HASH_ALG);
    hash.update(data, type);
    return hash.digest('base64');
  }

  //sign something
  static createSignature(privateKey: KeyObject, toHash: string) : string {
    const sign = createSign(SIGN_ALG);
    sign.update(toHash);
    sign.end();
    return sign.sign(privateKey, 'base64');
  }

  //verify a signature
  static verifySignature(publicKey: KeyObject, signature: string, toHash: string): Result {
    const verify = createVerify(SIGN_ALG);
    verify.update(toHash);
    verify.end();
    if (verify.verify(publicKey, signature, 'base64')) {
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

  //deserialize a private key
  static deserializePrivateKey(serialized: string) : KeyObject {
    return createPrivateKey(PRIVATE_PEM_HEADER + serialized + PRIVATE_PEM_FOOTER);
  }

  //deserialize a key pair
  static deserializeKeyPair(serialized: string): KeyPair {
    const priv = ChainUtil.deserializePrivateKey(serialized);
    const pub = createPublicKey(priv);
    return {
      priv: priv,
      pub: pub,
      pubSerialized: ChainUtil.serializePublicKey(pub)
    };
  }

  //deserialize a public key
  static deserializePublicKey(serialized: string): KeyObject {
    return createPublicKey(PUBLIC_PEM_HEADER + serialized + PUBLIC_PEM_FOOTER);
  }

  //serialize a private key
  static serializePrivateKey(priv : KeyObject):string {
    let returning = priv.export({
      type: 'sec1',
      format: 'pem'
    }) as string;
    if (returning.startsWith(PRIVATE_PEM_HEADER)) {
      returning = returning.substring(PRIVATE_PEM_HEADER.length);
    }
    if (returning.endsWith(PRIVATE_PEM_FOOTER)) {
      returning = returning.substring(0,returning.length - PRIVATE_PEM_FOOTER.length);
    }
    let found_newline = 0;
    for (; ;) {
      found_newline = returning.indexOf('\n', found_newline);
      if (found_newline === -1) {
        break;
      }
      returning = returning.substring(0, found_newline).concat(returning.substring(found_newline + 1));
    }
    return returning;
  }
  //serialize a key pair
  static serializeKeyPair(keyPair: KeyPair): string {
    return ChainUtil.serializePrivateKey(keyPair.priv);
  }
  //serialize a public key
  static serializePublicKey(pub: KeyObject): string {
    return pub.export({
      type: 'spki',
      format: 'der'
    }).toString('base64');
  }

  //stable stringify for hashing. It stringifies objects the same way.
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

  //the following functions are used for validation, the names should be self explanatory
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

  static createValidateIsEither(...validators: ValidatorI[]) {
    return (t: unknown): Result => {
      let failString = "Failed all validators:";
      for (const v of validators) {
        const res = v(t);
        if (!isFailure(res)) {
          return {
            result: true
          };
        } else {
          failString += "\n  " + res.reason;
        }
      }
      return {
        result: false,
        reason: failString
      };
    };
  }

  static validateIsNull(t?: unknown): Result {
    if (t === undefined) {
      return {
        result: false,
        reason: "Is undefined"
      };
    }
    if (t !== null) {
      return {
        result: false,
        reason: "Is not null"
      };
    }
    return {
      result: true
    };
  }

  static validateIsObject(t?: unknown): Result {
    if (t === undefined) {
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

  //includes minimum and maximum
  static validateIsNumberWithMinMax(t: unknown, minimum: number, maximum: number): Result {
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
    if (t < minimum) {
      return {
        result: false,
        reason: "Is below minimum"
      };
    }
    if (t > maximum) {
      return {
        result: false,
        reason: "Is above maximum"
      };
    }
    return {
      result: true
    };
  }

  //includes minimum and maximum
  static createValidateIsNumberWithMinMax(minimum: number, maximum: number): ValidatorI {
    return (t) => {
      return ChainUtil.validateIsNumberWithMinMax(t, minimum, maximum);
    };
  }

  static validateIsPublicKey(t: unknown): Result {
    const stringRes = ChainUtil.validateIsString(t);

    if (isFailure(stringRes)) {
      return stringRes;
    }

    try {
      ChainUtil.deserializePublicKey(t as string);
    } catch (_) {
      return {
        result: false,
        reason: `Couldn't deserialize: '${t}'`
      };
    }
    return {
      result: true
    };
  }

  static validateIsKeyPair(t: unknown): Result {
    const stringRes = ChainUtil.validateIsString(t);

    if (isFailure(stringRes)) {
      return stringRes;
    }

    try {
      ChainUtil.deserializeKeyPair(t as string);
    } catch (_) {
      return {
        result: false,
        reason: "Couldn't deserialize"
      };
    }
    return {
      result: true
    };
  }

  static validateIsPrivateKey(t: unknown): Result {
    const stringRes = ChainUtil.validateIsString(t);

    if (isFailure(stringRes)) {
      return stringRes;
    }

    try {
      ChainUtil.deserializePrivateKey(t as string);
    } catch (_) {
      return {
        result: false,
        reason: "Couldn't deserialize"
      };
    }
    return {
      result: true
    };
  }

  static validateIsSignature(t: unknown): Result {
    //TODO
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

  //this 'creates' a validator, using the given validator to validate each element of the array
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

  //this 'creates' a validator, using the given object. For every member of the member validator, a key in t must exist and pass the validator.
  static createValidateObject(memberValidator: { [index: string]: ValidatorI }): ValidatorI {
    return function (t) {
      return ChainUtil.validateObject(t, memberValidator);
    };
  }

  //this 'creates' a validator, using the given validator. The thing tested may be undefined, or pass the given validator
  static createValidateOptional(validator: ValidatorI): ValidatorI {
    return function (t) {
      if (t === undefined) {
        return {
          result: true
        };
      }

      return validator(t);
    };
  }

  //validates RDF terms
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

  //validates RDF literals
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