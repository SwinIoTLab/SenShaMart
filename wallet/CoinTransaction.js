const ChainUtil = require('../chain-util');
const { MINING_REWARD } = require('../config');

class CoinTransaction {
  constructor() {
    this.id = ChainUtil.id();
    this.input = null;
    this.outputs = [];
  }

  update(senderWallet, recipient, amount) {
    const senderOutput = this.outputs.find(output => output.address === senderWallet.publicKey);
    if (amount > senderOutput.amount) {
      console.log(`Amount: ${amount} exceeds balance.`);
      return;
    }
   
    senderOutput.amount = senderOutput.amount - amount;
    this.outputs.push({ amount, address: recipient });
    CoinTransaction.signCoinTransaction(this, senderWallet);

    return this; 
  }

  static CoinTransactionWithOutputs(senderWallet, outputs) {
    const cointransaction = new this();
    cointransaction.outputs.push(...outputs);
    CoinTransaction.signCoinTransaction(cointransaction, senderWallet);
    return cointransaction;
  }

  static newCoinTransaction(senderWallet, recipient, amount) {
    if (amount > senderWallet.balance) {
      console.log(`Amount: ${amount} exceeds balance.`);
      return;
    }

    return CoinTransaction.CoinTransactionWithOutputs(senderWallet, [
      { amount: senderWallet.balance - amount, address: senderWallet.publicKey},
      { amount, address: recipient }]);
  }

  static rewardCoinTransaction(minerWallet, blockchainWallet) {
    return CoinTransaction.CoinTransactionWithOutputs(blockchainWallet, [{
      amount: MINING_REWARD, address: minerWallet.publicKey
    }]);
  }

  static signCoinTransaction(cointransaction, senderWallet) {
    cointransaction.input = {
      timestamp: Date.now(),
      amount: senderWallet.balance,
      address: senderWallet.publicKey,
      signature: senderWallet.sign(ChainUtil.hash(cointransaction.outputs))
    }
  }

  static verifyCoinTransaction(cointransaction) {
    return ChainUtil.verifySignature(
      cointransaction.input.address,
      cointransaction.input.signature,
      ChainUtil.hash(cointransaction.outputs)
    );
  }
}

module.exports = CoinTransaction;