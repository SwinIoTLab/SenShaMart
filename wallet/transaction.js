const ChainUtil = require('../chain-util');
const { MINING_REWARD } = require('../config');

class Transaction {
  constructor(senderPublicKey, counter, outputs) {
    this.input = senderPublicKey;
    this.signature = null;
    this.counter = counter;
    this.outputs = outputs;
  }

  addSignature(signature) {
    if (!ChainUtil.verifySignature(
      this.input,
      signature,
      Transaction.hashToSign(this))) {
      console.log("Tried to add an invalid signature to a transaction");
      throw new Error("Tried to add an invalid signature to a transaction");
    }
    this.signature = signature;
  }

  static hashToSign(transaction) {
    return ChainUtil.hash({
      counter: transaction.counter,
      outputs: transaction.outputs
    });
  }

  static createOutput(recipient, amount) {
    return {
      publicKey: recipient,
      amount: amount
    };
  }

  //update(senderWallet, recipients) {
  //  const senderOutput = this.outputs.find(output => output.address === senderWallet.publicKey);

  //  if (amount > senderOutput.amount) {
  //    console.log(`Amount: ${amount} exceeds balance.`);
  //    return;
  //  }

  //  senderOutput.amount = senderOutput.amount - amount;
  //  this.outputs.push({ amount, address: recipient });
  //  Transaction.signTransaction(this, senderWallet);

  //  return this;
  //}
  //static signTransaction(transaction, senderWallet) {
  //  transaction.input = {
  //    timestamp: Date.now(),
  //    address: senderWallet.publicKey,
  //    signature: senderWallet.sign(ChainUtil.hash(transaction.outputs))
  //  }
  //}

  static verify(transaction) {
    if (transaction.outputs.length === 0) {
      return false;
    }
    for (const output of transaction.outputs) {
      if (!output.hasOwnProperty('amount')) {
        return false;
      }
      if (!output.hasOwnProperty('publicKey')) {
        return false;
      }
    }

    return ChainUtil.verifySignature(
      transaction.input,
      transaction.signature,
      Transaction.hashToSign(transaction)
    );
  }
}

module.exports = Transaction;