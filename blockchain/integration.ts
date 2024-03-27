import { ChainUtil, type KeyPair, type ResultFailure, type Result, isFailure } from '../util/chain-util.js';
import { type RepeatableTransaction, type TransactionWrapper } from './transaction_base.js';
import SeedRandom from 'seedrandom';

const outputValidation = {
  sensorName: ChainUtil.validateIsString,
  amount: ChainUtil.createValidateIsIntegerWithMin(1),
  sensorHash: ChainUtil.validateIsString,
  brokerHash: ChainUtil.validateIsString
};

type Output = {
  amount: number,
  sensorName: string,
  sensorHash: string,
  brokerHash: string
}

function validateOutputs(t: unknown): Result {
  const validateArrayRes = ChainUtil.validateArray(t, (output) => {
    return ChainUtil.validateObject(output, outputValidation);
  });

  if (!validateArrayRes.result) {
    return validateArrayRes;
  }

  const t_array = t as Output[];

  if (t_array.length <= 0) {
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

type ResultWitnesses = {
  result: true;
  witnesses: string[];
}

class Integration implements RepeatableTransaction {
  input: string;
  counter: number;
  rewardAmount: number;
  outputs: Output[];
  witnessCount: number;
  signature: string;
  constructor(senderKeyPair: KeyPair, counter: number, outputs: Output[], witnessCount: number, rewardAmount: number) {
    this.input = ChainUtil.serializePublicKey(senderKeyPair.pub);
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.outputs = outputs;
    this.witnessCount = witnessCount;

    this.signature = ChainUtil.createSignature(senderKeyPair.priv, Integration.hashToSign(this));

    const verification = Integration.verify(this);
    if (isFailure(verification)) {
      throw new Error(verification.reason);
    }
  }

  static createOutput(amount: number, sensorName: string, sensorRegistrationHash: string, brokerRegistrationHash: string): Output {
    return {
      amount: amount,
      sensorName: sensorName,
      sensorHash: sensorRegistrationHash,
      brokerHash: brokerRegistrationHash
    };
  }

  static hashToSign(integration:Integration):string {
    return ChainUtil.hash([
      integration.counter,
      integration.rewardAmount,
      integration.witnessCount,
      integration.outputs]);
  }

  static wrap(tx: Integration): TransactionWrapper<Integration> {
    return {
      tx: tx,
      type: this
    };
  }

  static verify(integration:Integration):Result {
    const validationRes = ChainUtil.validateObject(integration, baseValidation);
    if (!validationRes.result) {
      return validationRes;
    }

    const verifyRes = ChainUtil.verifySignature(
      ChainUtil.deserializePublicKey(integration.input),
      integration.signature,
      Integration.hashToSign(integration));
    if (!verifyRes.result) {
      return verifyRes;
    }

    return {
      result: true
    };
  }

  static chooseWitnesses(integration: Integration, brokerList: string[]): ResultWitnesses | ResultFailure{
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

    const rng = SeedRandom.alea(integration.signature + Integration.hashToSign(integration)) as SeedRandom.PRNG;

    const witnesses = [];

    for (let i = 0; i < witnessCount; ++i) {
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

  static txName(): string {
    return "Integration";
  }
}
export { Integration, type Output };
export default Integration;