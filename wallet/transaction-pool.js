const PaymntTransaction      = require('./CoinTransaction');
const MetaDataTransaction    = require('./MetaDataTransaction');
//const CompTransaction        = require('./CompTransaction');
//const IntegrationTransaction = require('./IntegrationTransaction');
const { MaxNumOfPaymentTransactions, MaxNumOfMetadataTransactions, 
        MaxNumOfCompTransactions, MaxNumOfIntegrationTransactions} 
        = require('../config');
class TransactionPool {
  constructor() {
    this.paymenttransactions = [];
    this.metaDataTransactions =[];
    this.comptransactions = [];
    this.integrationTransactions =[];
  }
  updateOrAddPaymentTransaction(paymenttransaction) {
    let paymenttransactionWithId = this.paymenttransactions.find(t => 
        t.id === paymenttransaction.id);
     if (paymenttransactionWithId) {
       this.paymenttransactions[this.paymenttransactions.indexOf
       (paymenttransactionWithId)] = paymenttransaction;
     } else { 
      this.paymenttransactions.push(paymenttransaction);
    }
  }
  updateOrAddMetaDataTransaction(metaDataTransaction) {
    let metaDataTransactionWithId = this.metaDataTransactions.find(t => 
        t.id === metaDataTransaction.id);
    if (metaDataTransactionWithId) {
      this.metaDataTransactions[this.metaDataTransactions.indexOf
      (metaDataTransactionWithId)] = metaDataTransaction;
    } else {
      this.metaDataTransactions.push(metaDataTransaction);
    }
  }
  updateOrAddCompTransaction(comptransaction) {
    let comptransactionWithId = this.comptransactions.find(t => 
        t.id === comptransaction.id);
     if (comptransactionWithId) {
       this.comptransactions[this.comptransactions.indexOf
       (comptransactionWithId)] = comptransaction;
     } else { 
      this.comptransactions.push(comptransaction);
    } }
  updateOrAddIntegrationTransaction(integrationTransaction) {
    let integrationTransactionWithId = this.integrationTransaction.find(
        t => t.id === integrationTransaction.id);
    if (integrationTransactionWithId) {
      this.integrationTransactions[this.integrationTransactions.indexOf
      (integrationTransactionWithId)] = integrationTransaction;
    } else {
      this.integrationTransactions.push(integrationTransaction);
    }
  }
  existingPaymentTransaction(address) {
    return this.paymenttransactions.find(t => 
           t.input.address === address); }
  existingMetaDataTransaction(address) {
    return this.metaDataTransactions.find(t => 
           t.Signiture.address === address);}
  existingCompTransaction(address) {
    return this.comptransactions.find(t => 
           t.input.address === address); }
  existingIntegrationTransaction(address) {
    return this.integrationTransactions.find(t => 
           t.Signiture.address === address);}
  validPaymentTransactions() {
    return this.paymenttransactions.filter(paymenttransaction => {
      const outputTotal = paymenttransaction.outputs.reduce(
                          (total, output) => {
        return total + output.amount;
      }, 0);
      if (paymenttransaction.input.amount !== outputTotal) {
        console.log(`Invalid transaction from 
        ${paymenttransaction.input.address}.`);
        return;}
      if (!PaymentTransaction.verifyPaymentTransaction(
        paymenttransaction)) {
        console.log(`Invalid signature from 
        ${paymenttransaction.input.address}.`);
        return;}
      return paymenttransaction;
    });
  }
  validMetaDataTransactions(){
    if (!MetaDataTransaction.verifyMetaDataTransaction(
      metaDataTransaction)) {
       console.log(`Invalid signature from 
       ${metaDataTransaction.Signiture.address}.`);
        return;
      }
    return metaDataTransaction;
  }
  validCompTransactions(){
    if (!CompTransaction.verifyCompTransaction(
      CompTransaction)) {
       console.log(`Invalid signature from 
       ${CompTransaction.Signiture.address}.`);
        return;
      }
    return compTransaction;
  }
  validIntegrationTransactions(){
    if (!IntegrationTransaction.verifyIntegrationTransaction(
         integrationTransaction)) {
       console.log(`Invalid signature from 
      ${integrationTransaction.Signiture.address}.`);
        return;
      }
    return integrationTransaction;
  }
  clearAll() {
    this.cointransactions        = [];
    this.metaDataTransactions    = [];
    this.comptransactions        = [];
    this.integrationTransactions = [];
  }
}
module.exports = TransactionPool;