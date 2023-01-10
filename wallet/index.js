const Transaction = require('./transaction');
const { INITIAL_BALANCE } = require('../config');
const Metadata = require('./metadata');
const ChainUtil = require('../chain-util');

class Wallet {
  constructor(keyPair) {
    this.keyPair = keyPair;
    this.publicKey = this.keyPair.getPublic().encode('hex');
    this.counter = 0;
  }

  toString() {
    return `Wallet -
      publicKey: ${this.publicKey.toString()}
      balance  : ${this.balance}`
  }

  sign(dataHash) {
    return this.keyPair.sign(dataHash);
  }

  createTransaction(recipient, amount, blockchain) {
    const balance = blockchain.getBalanceCopy(this.publicKey);

    if (balance.counter > this.counter) {
      this.counter = balance.counter;
    }

    if (amount > balance.balance) {
      console.log(`Amount: ${amount} exceceds current balance: ${balance.balance}`);
      return null;
    }

    const counterToUse = this.counter + 1;
    this.counter++;

    const newTransaction = new Transaction(this.publicKey, counterToUse, [Transaction.createOutput(recipient, amount)]);
    newTransaction.addSignature(this.sign(Transaction.hashToSign(newTransaction)));
    return newTransaction;
  }

  createMetadata(SSNmetadata) {
    return Metadata.newMetadata(this, SSNmetadata);
  }
  
  //calculateBalance(blockchain) {
  //  let balance = this.balance;
  //  let transactions = [];
  //  blockchain.chain.forEach(block => block.data.forEach(transaction => {
  //    transactions.push(transaction);
  //  }));
  //  console.log("transactions of balance")
  //  console.log(transactions);
  //  const PaymentTransactions = transactions[0];
  //  console.log("Payment transactions ")
  //  console.log(PaymentTransactions);
  //  const walletInputTs = PaymentTransactions.filter(transaction => transaction.input.address === this.publicKey);

  //  let startTime = 0;

  //  if (walletInputTs.length > 0) {
  //    const recentInputT = walletInputTs.reduce(
  //      (prev, current) => prev.input.timestamp > current.input.timestamp ? prev : current
  //    );

  //    balance = recentInputT.outputs.find(output => output.address === this.publicKey).amount;
  //    startTime = recentInputT.input.timestamp;
  //  }

  //  PaymentTransactions.forEach(transaction => {
  //    if (transaction.input.timestamp > startTime) {
  //      transaction.outputs.find(output => {
  //        if (output.address === this.publicKey) {
  //          balance += output.amount;
  //        }
  //      });
  //    }
  //  });

  //  return balance;
  //}

  //static blockchainWallet() {
  //  const blockchainWallet = new this(ChainUtil.genKeyPair());
  //  blockchainWallet.address = 'blockchain-wallet';
  //  return blockchainWallet;
  //}
}

module.exports = Wallet;

