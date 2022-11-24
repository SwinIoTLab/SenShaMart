const TransactionPool = require('./transaction-pool');
const Transaction = require('./transaction');
const Metadata    = require('./metadata')
const Wallet = require('./index');
const Blockchain = require('../blockchain');

describe('TransactionPool', () => {
  let tp, wallet, transaction, metadata, bc;

  beforeEach(() => {
    tp = new TransactionPool();
    wallet = new Wallet();
    wallet2 =new Wallet();
    bc = new Blockchain();
    transaction = wallet.createTransaction('r4nd-4dr355', 30, bc, tp);
    // senderWallet = 'address';
    // Name = 'IoT_Lab_Temp_Sensor'
    // Geo = [1.045,0.0135]
    // IP_URL = 'www.IoT-locationbar.com/sensors/temp'
    // Topic_Token = 'ACCESS_TOKEN'
    // Permission = 'Public'
    // RequestDetail = 'Null' 
    // OrgOwner = 'Swinburne_University'
    // DepOwner = 'Computer_Science'
    // PrsnOwner = 'Anas_Dawod'
    // PaymentPerKbyte = 10
    // PaymentPerMinute = 5
    // Protocol = 'MQTT'
    // MessageAttributes  = 'null'
    // Interval = 10
    // FurtherDetails = 'null'
    // SSNmetadata = 'null'

    metadata    = wallet.createMetadata('IoT_Lab_Temp_Sensor',[1.045,0.0135],"www.IoT-locationbar.com/sensors/temp" ,'ACCESS_TOKEN' , 'Public',
    'Null', 'Swinburne_University', 'Computer_Science','Anas_Dawod', 10, 
      5, 'MQTT', 'null', 10, 
      'FurtherDetails', 'SSNmetadata',tp);
  });

  it('adds a transaction to the pool', () => {
    expect(tp.transactions.find(t => t.id === transaction.id)).toEqual(transaction);
  });
  it('adds a metadata to the pool', () => {
    expect(tp.metadataS.find(t => t.id === metadata.id)).toEqual(metadata);
  });

  it('updates a transaction in the pool', () => {
    const oldTransaction = JSON.stringify(transaction);
    const newTransaction = transaction.update(wallet, 'foo-4ddr355', 40);
    tp.updateOrAddTransaction(newTransaction);

    expect(JSON.stringify(tp.transactions.find(t => t.id === newTransaction.id)))
      .not.toEqual(oldTransaction);
  });

  it('clears transactions and metadata', () => {
    tp.clear();
    expect(tp.transactions).toEqual([]);
    expect(tp.metadataS).toEqual([]);
  });

  describe('mixing valid and corrupt transactions', () => {
    let validTransactions;
 
    beforeEach(() => {
      validTransactions = [...tp.transactions];
      for (let i=0; i<6; i++) {
        wallet = new Wallet();
        transaction = wallet.createTransaction('r4nd-4dr355', 30, bc, tp);
        if (i%2==0) {
          transaction.input.amount = 99999;
        } else {
          validTransactions.push(transaction);
        }
      }
    });

    it('shows a difference between valid and corrupt transactions', () => {
      expect(JSON.stringify(tp.transactions)).not.toEqual(JSON.stringify(validTransactions));
    });

    it('grabs valid transactions', () => {
      expect(tp.validTransactions()).toEqual(validTransactions);
    });
  });
});