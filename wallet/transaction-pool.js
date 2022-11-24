const Transaction = require('../wallet/transaction');
const Metadata    = require('../wallet/metadata')
class TransactionPool {
  constructor() {
    this.transactions = [];
    this.metadataS     =[];
  }

  updateOrAddTransaction(transaction) {
    let transactionWithId = this.transactions.find(t => t.id === transaction.id);

    if (transactionWithId) {
      this.transactions[this.transactions.indexOf(transactionWithId)] = transaction;
    } else {
      this.transactions.push(transaction);
    }
  }

  AddMetadata(metadata) {
    // let metadataWithId = this.metadataS.find(t => t.id === metadata.id);

    // if (metadataWithId) {
    //   this.metaDataS[this.metadataS.indexOf(metadataWithId)] = metadata;
    // } else {
      this.metadataS.push(metadata);
  //  }
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

  clear() {
    this.transactions = [];
    this.metadataS    = [];
  }
}

module.exports = TransactionPool;