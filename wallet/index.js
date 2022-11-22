const ChainUtil = require('../chain-util');
const CoinTransaction = require('./CoinTransaction');
const { INITIAL_BALANCE } = require('../config');
const MetaDataTransaction = require('./MetaDataTransaction');
const transactionPool = require('./transaction-pool');

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

  createCoinTransaction(recipient, amount, blockchain, transactionPool) {
   // this.balance = this.calculateBalance(blockchain);

   if (amount > this.balance) {
     console.log(`Amount: ${amount} exceceds current balance: ${this.balance}`);
     return;
   }

    let cointransaction = transactionPool.existingPaymentTransaction(this.publicKey);


   if (cointransaction) {
     cointransaction.update(this, recipient, amount); 
   } else { //this should be the original one
       //just for test i make the transaction not to update if the sender is the same 
      cointransaction = CoinTransaction.newCoinTransaction(this, recipient, amount);
      transactionPool.updateOrAddPaymentTransaction(cointransaction);
     }

    return cointransaction;
  }
  createMetaDataTransaction(Name,Geo ,IP_URL , Topic_Token, Permission, RequestDetail, OrgOwner, DepOwner,PrsnOwner, PaymentPerKbyte, PaymentPerMinute, Protocol, MessageAttributes, Interval,  FurtherDetails, SSNmetadata, transactionPool){
  /* let metaData = metaDataPool.existingMetaData(this.publicKey);

    if (metaData) {
      metaData.update(this, Geo, Std, Name,MetaHash,file);
    } else {*/
   
    const metaDataTransaction= MetaDataTransaction.newMetaDataTransaction(this, Name,Geo ,IP_URL , Topic_Token, Permission, RequestDetail, OrgOwner, DepOwner,PrsnOwner, PaymentPerKbyte, PaymentPerMinute, Protocol, MessageAttributes,Interval, FurtherDetails, SSNmetadata);
    transactionPool.updateOrAddMetaDataTransaction(metaDataTransaction);
    //}
    return metaDataTransaction; 
  } 

  calculateBalance(blockchain) {
    let balance = this.balance;
    let cointransactions = [];
    blockchain.chain.forEach(block => block.data.forEach(cointransaction => {
      cointransactions.push(cointransaction);
    }));

    const walletInputTs = cointransactions
      .filter(cointransaction => cointransaction.input.address === this.publicKey);

    let startTime = 0;

    if (walletInputTs.length > 0) {
      const recentInputT = walletInputTs.reduce(
        (prev, current) => prev.input.timestamp > current.input.timestamp ? prev : current
      );

      balance = recentInputT.outputs.find(output => output.address === this.publicKey).amount;
      startTime = recentInputT.input.timestamp;
    }

    cointransactions.forEach(cointransaction => {
      if (cointransaction.input.timestamp > startTime) {
        cointransaction.outputs.find(output => {
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