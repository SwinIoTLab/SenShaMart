import { ChainUtil, type Result, isFailure, type KeyPair } from '../util/chain-util.js';
import { type RepeatableTransaction, type TransactionWrapper } from './transaction_base.js';

const outputValidation = {
  publicKey: ChainUtil.validateIsPublicKey,
  amount: ChainUtil.createValidateIsIntegerWithMin(1)
};

type Output = {
  publicKey: string,
  amount: number
};

function validateOutputs(t:unknown):Result {
  let validateRes = ChainUtil.validateArray(t, function (output) {
      return ChainUtil.validateObject(output, outputValidation);
    });
  if (isFailure(validateRes)) {
    return validateRes
  }

  const t_array = t as object[];

  if (t_array.length <= 0) {
    return {
      result: false,
      reason: "Outputs length isn't positive"
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
  signature: ChainUtil.validateIsSignature
}

class Payment implements RepeatableTransaction {
  input: string;
  counter: number;
  rewardAmount: number;
  outputs: Output[];
  signature: string;
  constructor(senderKeyPair: KeyPair, counter: number, outputs: Output[], rewardAmount: number) {
    this.input = ChainUtil.serializePublicKey(senderKeyPair.pub);
    this.counter = counter;
    this.rewardAmount = rewardAmount;
    this.outputs = outputs;
    this.signature = ChainUtil.createSignature(senderKeyPair.priv, Payment.hashToSign(this));

    const verification = Payment.verify(this);
    if (isFailure(verification)) {
      throw new Error(verification.reason);
    }
  }

  static hashToSign(transaction: Payment): string {
    return ChainUtil.hash([
      transaction.counter,
      transaction.rewardAmount,
      transaction.outputs]);
  }

  static createOutput(recipient: string, amount: number): Output {
    if (amount < 1) {
      throw new Error("Invalid amount, must be 1 or greater");
    }
    return {
      publicKey: recipient,
      amount: amount
    };
  }

  static verify(transaction: Payment):Result {
    const validationRes = ChainUtil.validateObject(transaction, baseValidation);
    if (!validationRes.result) {
      return validationRes;
    }

    const verifyRes = ChainUtil.verifySignature(
      transaction.input,
      transaction.signature,
      Payment.hashToSign(transaction));
    if (!verifyRes.result) {
      return verifyRes;
    }

    return {
      result: true,
    };
  }

  static wrap(tx: Payment): TransactionWrapper<Payment> {
    return {
      tx: tx,
      type: Payment
    };
  }

  static txName():string {
    return "Payment";
  }
}

export { Payment, type Output };
export default Payment;