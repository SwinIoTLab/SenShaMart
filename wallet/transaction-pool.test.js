const TransactionPool = require('./transaction-pool');
const Transaction = require('./Cointransaction');
const Wallet = require('./index');
const Blockchain = require('../blockchain');

describe('TransactionPool', () => {
  let tp, wallet, transaction, bc;

  beforeEach(() => {
    tp = new TransactionPool();
    wallet = new Wallet();
    bc = new Blockchain();
    transaction = wallet.createCoinTransaction('r4nd-4dr355', 30,20,9014,'temp','123abc', bc, tp);
  });

  it('adds a transaction to the pool', () => {
    expect(tp.paymenttransactions.find(t => t.id === transaction.id)).toEqual(transaction);
  });

  it('updates a transaction in the pool', () => {
    const oldTransaction = JSON.stringify(transaction);
    const newTransaction = transaction.update(wallet, 'foo-4ddr355', 40,20,9014,'temp','123abc');
    tp.updateOrAddPaymentTransaction(newTransaction);

    expect(JSON.stringify(tp.paymenttransactions.find(t => t.id === newTransaction.id)))
      .not.toEqual(oldTransaction);
  });

  it('clears transactions', () => {
    tp.clear();
    expect(tp.paymenttransactions).toEqual([]);
  });

  describe('mixing valid and corrupt transactions', () => {
    let validTransactions;

    beforeEach(() => {
      validTransactions = [...tp.paymenttransactions];
      for (let i=0; i<6; i++) {
        wallet = new Wallet();
        transaction = wallet.createCoinTransaction('r4nd-4dr355', 30,20,9014,'temp','123abc', bc, tp);
        if (i%2==0) {
          transaction.input.amount = 99999;
        } else {
          validTransactions.push(transaction);
        }
      }
    });

    it('shows a difference between valid and corrupt transactions', () => {
      expect(JSON.stringify(tp.paymenttransactions)).not.toEqual(JSON.stringify(validTransactions));
    });

    it('grabs valid transactions', () => {
      expect(tp.validTransactions()).toEqual(validTransactions);
    });
  });
});