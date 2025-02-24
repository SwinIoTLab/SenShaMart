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

export type ResolveCb = (res: unknown) => void;
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

type ValidatorI = (v: unknown, fail: ResultFailure) => boolean;

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
  static validateExists(t: unknown, fail: ResultFailure): t is unknown {
    if (t === undefined) {
      fail.reason = "Is undefined";
      return false;
    }

    return true;
  }

  static validateIsEither(t: unknown, fail: ResultFailure, validators: ValidatorI[]): boolean {
    let failString = "Failed all validators:";
    for (const v of validators) {
      if (v(t, fail)) {
        return true;
      } else {
        failString += "\n  " + fail.reason;
      }
    }
    fail.reason = failString;
    return false;
  }

  static createValidateIsEither(...validators: ValidatorI[]): ValidatorI {
    return (t: unknown, fail: ResultFailure): boolean => {
      return ChainUtil.validateIsEither(t, fail, validators);
    };
  }

  static validateIsNull(t: unknown, fail: ResultFailure): t is null {
    if (t === undefined) {
      fail.reason = "Is undefined"
      return false;
    }
    if (t !== null) {
      fail.reason = "Is not null"
      return false;
    }
    return true;
  }

  static validateIsObject(t: unknown, fail: ResultFailure): t is object {
    if (t === undefined) {
      fail.reason = "Is undefined";
      return false;
    }
    if (typeof t !== 'object') {
      fail.reason = "Is not an object";
      return false;
    }

    return true;
  }

  static validateIsString(t: unknown, fail: ResultFailure): t is string {
    if (t === undefined) {
      fail.reason = "Is undefined";
    }
    if (typeof t === 'string') {
      return true;
    } else {
      fail.reason = "Is not string";
      return false;
    }
  }

  static validateIsNumber(t: unknown, fail: ResultFailure): t is number {
    if (t === undefined) {
      fail.reason = "Is undefined"
      return false;
    }
    if (typeof t !== 'number') {
      fail.reason = "Is not number";
      return false;
    }
    return true;
  }

  static validateIsInteger(t: unknown, fail: ResultFailure): t is number {
    if (t === undefined) {
      fail.reason = "Is undefined";
      return false;
    }
    if (typeof t !== 'number') {
      fail.reason = "Is not number";
      return false;

    }
    if (!Number.isInteger(t)) {
      fail.reason = "Is not integer";
      return false;
    }
    return true;
  }

  //includes minimum
  static validateIsIntegerWithMin(t: unknown, minimum:number, fail: ResultFailure): t is number {
    if (t === undefined) {
      fail.reason= "Is undefined";
      return false;
    }
    if (typeof t !== 'number') {
      fail.reason = "Is not number";
      return false;
    }
    if (!Number.isInteger(t)) {
      fail.reason = "Is not integer";
      return false;
    }
    if (t < minimum) {
      fail.reason = "Is below minimum";
      return false;
    }
    return true;
  }

  //includes minimum
  static createValidateIsIntegerWithMin(minimum: number): ValidatorI {
    return (t,fail) => {
      return ChainUtil.validateIsIntegerWithMin(t, minimum, fail);
    };
  }

  //includes minimum and maximum
  static validateIsNumberWithMinMax(t: unknown, minimum: number, maximum: number, fail: ResultFailure): t is number {
    if (t === undefined) {
      fail.reason = "Is undefined";
      return false;
    }
    if (typeof t !== 'number') {
      fail.reason = "Is not number";
      return false;
    }
    if (t < minimum) {
      fail.reason = "Is below minimum";
      return false;
    }
    if (t > maximum) {
      fail.reason = "Is above maximum";
      return false;
    }
    return true;
  }

  //includes minimum and maximum
  static createValidateIsNumberWithMinMax(minimum: number, maximum: number): ValidatorI {
    return (t, fail) => {
      return ChainUtil.validateIsNumberWithMinMax(t, minimum, maximum, fail);
    };
  }

  static validateIsSerializedPublicKey(t: unknown, fail: ResultFailure): t is string {
    if (!ChainUtil.validateIsString(t, fail)) {
      fail.reason = "Is not a serialized public key\n" + fail.reason;
      return false;
    }

    try {
      ChainUtil.deserializePublicKey(t);
    } catch (_) {
      fail.reason = "Is not a serialized public key\nCould not deserialize";
      return false;
    }
    return true;
  }

  static validateIsSerializedKeyPair(t: unknown, fail: ResultFailure): t is string {
    if (!ChainUtil.validateIsString(t, fail)) {
      fail.reason = "Is not a serialized keypair\n" + fail.reason;
      return false;
    }

    try {
      ChainUtil.deserializeKeyPair(t as string);
    } catch (_) {
      fail.reason = "Is not a serialized keypair\nCould not deserialize";
      return false;
    }
    return true;
  }

  static validateIsSerializedPrivateKey(t: unknown, fail: ResultFailure): t is string {
    if (!ChainUtil.validateIsString(t, fail)) {
      fail.reason = "Is not serialized private key\n" + fail.reason;
      return false;
    }

    try {
      ChainUtil.deserializePrivateKey(t as string);
    } catch (_) {
      fail.reason = "Is not a serialized private key\n Could not deserialize";
      return false;
    }
    return true;
  }

  static validateIsSignature(t: unknown, fail: ResultFailure): t is string {
    //TODO
    return ChainUtil.validateIsString(t, fail);
  }

  static validateArray<T>(t: unknown, memberValidator: ValidatorI, fail: ResultFailure): t is T[] {
    if (t === undefined) {
      fail.reason = "Is undefined";
      return false;
    }
    if (!(t instanceof Array)) {
      fail.reason = "Is not an Array";
      return false;
    }

    for (const member of t) {
      if (!memberValidator(member, fail)) {
        fail.reason = "Is not an array of appropriate type\n" + fail.reason;
        return false;
      }
    }
    return true;
  }

  //this 'creates' a validator, using the given validator to validate each element of the array
  static createValidateArray(memberValidator:ValidatorI): ValidatorI {
    return function (t, fail) {
      return ChainUtil.validateArray(t, memberValidator, fail);
    };
  }

  static validateObject<T>(t: unknown, memberValidator: { [index: string]: ValidatorI }, fail: ResultFailure): t is T {
    if (t === undefined) {
      fail.reason = "Is undefined";
      return false;
    }
    if (!(t instanceof Object)) {
      fail.reason = "Is not an object";
      return false;
    }

    const t_obj = t as { [index: string]: unknown };

    for (const key in memberValidator) {
      const validator = memberValidator[key];

      if (!validator(t_obj[key], fail)) {
        fail.reason = `Member '${key}' failed validation\n`;
        return false;
      }
    }

    for (const key in t) {
      if (!(key in memberValidator)) {
        fail.reason = "Verifying has key not in validators";
        return false;
      }
    }

    return true;
  }

  //this 'creates' a validator, using the given object. For every member of the member validator, a key in t must exist and pass the validator.
  static createValidateObject(memberValidator: { [index: string]: ValidatorI }): ValidatorI {
    return function (t, fail) {
      return ChainUtil.validateObject(t, memberValidator, fail);
    };
  }

  //this 'creates' a validator, using the given validator. The thing tested may be undefined, or pass the given validator
  static createValidateOptional(validator: ValidatorI): ValidatorI {
    return function (t, fail) {
      if (t === undefined) {
        return true;
      }

      return validator(t, fail);
    };
  }

  //validates RDF terms
  static validateTerm(t: unknown, fail: ResultFailure): t is string {

    if (!ChainUtil.validateIsString(t, fail)) {
      fail.reason = "Is not a term\n" + fail.reason;
      return false;
    }

    if (t.startsWith(SENSHAMART_URI_PREFIX)) {
      fail.reason = "Starts with reserved prefix";
      return false;
    }

    return true;
  }

  //validates RDF literals
  static validateLiteral(t: unknown, fail: ResultFailure): t is string | number {
    if (!ChainUtil.validateIsEither(t, fail, [ChainUtil.validateTerm, ChainUtil.validateIsNumber])) {
      fail.reason = "Is not a literal\n" + fail.reason;
      return false;
    }
    return true;
  }
}