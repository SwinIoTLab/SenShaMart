const Transaction = require('../wallet/transaction');
const Metadata = require('../wallet/metadata');
const Block = require('../blockchain/block');

const Return = {
  add: 1,
  update: 2,
  error: 3
};

class TransactionPool {
  constructor() {
    this.transactions = [];
    this.metadatas = [];
  }

  //returns true on update, false on add
  updateOrAddTransaction(transaction) {
    if (!Transaction.verify(transaction)) {
      console.log("Couldn't update or add transaction, transaction couldn't be verified");
      return Return.error;
    }
    const foundIndex = this.transactions.findIndex(t => t.input === transaction.input && t.counter === transaction.counter);

    if (foundIndex !== -1) {
      this.transactions[foundIndex] = transaction;
      return Return.update;
    } else {
      this.transactions.push(transaction);
      return Return.add;
    }
  }

  updateOrAddMetadata(metadata) {
    if (!Metadata.verifyMetadata(metadata)) {
      console.log("Couldn't update metdata, metadata couldn't be verified");
      return Return.error;
    }

    const foundIndex = this.metadatas.findIndex(t => t.id === metadata.id);

    if (foundIndex !== -1) {
      this.metadatas[foundIndex] = metadata;
      return Return.update;
    } else {
      this.metadatas.push(metadata);
      return Return.add;
    }
  }

  existingTransaction(address) {
    return this.transactions.find(t => t.input.address === address);
  }

  existingMetadata(address) {
    return this.metadatas.find(t => t.Signiture.address === address);
  }

  //we could check for possible double spends here
  validTransactionsCopy() {
    return [...this.transactions];
  }

  validMetadatasCopy(){
    return [...this.metadatas];
  }

  clearFromBlock(block) {
    const blockTransactions = Block.getTransactions(block);
    const blockMetadatas = Block.getMetadatas(block);

    for (const transaction of blockTransactions) {
      const foundTransaction = this.transactions.findIndex(t => t.id === transaction.id);

      if (foundTransaction !== -1) {
        this.transactions.splice(foundTransaction, 1);
      }
    }
    for (const metadata of blockMetadatas) {
      const foundMetadata = this.metadatas.findIndex(m => m.id === metadata.id);

      if (foundMetadata !== -1) {
        this.metadatas.splice(foundMetadata, 1);
      }
    }
  }

  clearAll() {
    this.transactions = [];
    this.metadatas    = [];
  }
}

module.exports = TransactionPool;
module.exports.Return = Return;