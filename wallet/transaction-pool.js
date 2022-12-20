const Transaction = require('../wallet/transaction');
const Metadata = require('../wallet/metadata')

const Return = {
  add: 1,
  update: 2,
  error: 3
};

class TransactionPool {
  constructor() {
    this.transactions = [];
    this.metadataS     =[];
  }

  //returns true on update, false on add
  updateOrAddTransaction(transaction) {
    if (!Transaction.verifyTransaction(transaction)) {
      console.log("Couldn't update or add transaction, transaction couldn't be verified");
      return Return.error;
    }
    const foundIndex = this.transactions.findIndex(t => t.id === transaction.id);

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

    const foundIndex = this.metadataS.findIndex(t => t.id === metadata.id);

    if (foundIndex !== -1) {
      this.metadataS[foundIndex] = metadata;
      return Return.update;
    } else {
      this.metadataS.push(metadata);
      return Return.add;
    }
  }

  existingTransaction(address) {
    return this.transactions.find(t => t.input.address === address);
  }

  existingMetadata(address) {
    return this.metadataS.find(t => t.Signiture.address === address);
  }

  validTransactions() {
    return this.transactions.filter(transaction => {
      const outputTotal = transaction.outputs.reduce((total, output) => {
        return total + output.amount;
      }, 0);

      if (transaction.input.amount !== outputTotal) {
        console.log(`Invalid transaction from ${transaction.input.address}.`);
        return;
      }

      if (!Transaction.verifyTransaction(transaction)) {
        console.log(`Invalid signature from ${transaction.input.address}.`);
        return;
      }

      return transaction;
    });
  }

  validMetadataS(){
    return this.metadataS.filter(metadata => {
      if (!Metadata.verifyMetadata(metadata)) {
         console.log(`Invalid signature from ${metadata.Signiture.address}.`);
          return;
        }
    return metadata;
  });
  }

  clearFromBlock(block) {
    const transactions = block.data[0];
    const metadatas = block.data[1];
    for (const transaction of transactions) {
      const foundTransaction = this.transactions.findIndex(t => t.id === transaction.id);

      if (foundTransaction !== -1) {
        this.transactions.splice(foundTransaction, 1);
      }
    }

    for (const metadata of metadatas) {
      const foundMetadata = this.metadataS.findIndex(m => m.id === metadata.id);

      if (foundMetadata !== -1) {
        this.metadataS.splice(foundMetadata, 1);
      }
    }
  }

  clearAll() {
    this.transactions = [];
    this.metadataS    = [];
  }
}

module.exports = TransactionPool;
module.exports.Return = Return;