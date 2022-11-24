const ChainUtil = require('../chain-util');
const Transaction = require('./transaction');
const { INITIAL_BALANCE } = require('../config');
const Metadata = require('./metadata');

class Wallet {
  constructor() {
    this.balance = INITIAL_BALANCE;
    this.keyPair = ChainUtil.genKeyPair();
    this.publicKey = this.keyPair.getPublic().encode('hex');
  }

  toString() {
    return `Wallet -
      publicKey: ${this.publicKey.toString()}
      balance  : ${this.balance}`
  }

  sign(dataHash) {
    return this.keyPair.sign(dataHash);
  }

  createTransaction(recipient, amount, blockchain, transactionPool) {
    this.balance = this.calculateBalance(blockchain);

    if (amount > this.balance) {
      console.log(`Amount: ${amount} exceceds current balance: ${this.balance}`);
      return;
    }

    let transaction = transactionPool.existingTransaction(this.publicKey);

    if (transaction) {
      transaction.update(this, recipient, amount);
    } else { 
      transaction = Transaction.newTransaction(this, recipient, amount);
      transactionPool.updateOrAddTransaction(transaction);
    }

    return transaction;
  }

  createMetadata(Name,Geo ,IP_URL , Topic_Token, Permission, RequestDetail, OrgOwner, DepOwner,
    PrsnOwner, PaymentPerKbyte, PaymentPerMinute, Protocol, MessageAttributes, Interval,  
    FurtherDetails, SSNmetadata, transactionPool){
     //let metadata = transactionPool.existingMetadata(this.publicKey);
  
      // if (metaData) {
      //   metadata.update(this, Geo, Std, Name,MetaHash,file);
      // } else {*/
     
      let metadata= Metadata.newMetadata(this, Name,Geo ,IP_URL , Topic_Token, Permission, 
        RequestDetail, OrgOwner, DepOwner,PrsnOwner, PaymentPerKbyte, PaymentPerMinute, 
        Protocol, MessageAttributes,Interval, FurtherDetails, SSNmetadata);
      transactionPool.AddMetadata(metadata);
 
      //}
      return metadata; 
    }
  
 
  calculateBalance(blockchain) {
    let balance = this.balance;
    let transactions = [];
    blockchain.chain.forEach(block => block.data.forEach(transaction => {
      transactions.push(transaction);
    }));
    console.log("transactions of balance")
console.log(transactions);
    const PaymentTransactions = transactions[0];
    console.log("Payment transactions ")
    console.log(PaymentTransactions);
    const walletInputTs = PaymentTransactions.filter(transaction => transaction.input.address === this.publicKey);

    let startTime = 0;

    if (walletInputTs.length > 0) {
      const recentInputT = walletInputTs.reduce(
        (prev, current) => prev.input.timestamp > current.input.timestamp ? prev : current
      );

      balance = recentInputT.outputs.find(output => output.address === this.publicKey).amount;
      startTime = recentInputT.input.timestamp;
    }

    PaymentTransactions.forEach(transaction => {
      if (transaction.input.timestamp > startTime) {
        transaction.outputs.find(output => {
          if (output.address === this.publicKey) {
            balance += output.amount;
          }
        });
      }
    });

    return balance;
  }

  static blockchainWallet() {
    const blockchainWallet = new this();
    blockchainWallet.address = 'blockchain-wallet';
    return blockchainWallet;
  }
}

module.exports = Wallet;

