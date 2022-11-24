const Transaction = require('./transaction');
const Metadata    = require('./metadata');
const Wallet = require('./index');
const { MINING_REWARD } = require('../config');

describe('Transaction & Metadata', () => {
  let transaction, metadata, wallet, recipient, amount,
    senderWallet,Name,Geo ,IP_URL , Topic_Token, Permission,
    RequestDetail, OrgOwner, DepOwner,PrsnOwner, PaymentPerKbyte, 
    PaymentPerMinute, Protocol, MessageAttributes, Interval, 
    FurtherDetails, SSNmetadata;

  beforeEach(() => {
    wallet = new Wallet();
    amount = 50;
    recipient = 'r3c1p13nt';
    senderWallet = new Wallet();
    Name = 'IoT_Lab_Temp_Sensor'
    Geo = [1.045,0.0135]
    IP_URL = 'www.IoT-locationbar.com/sensors/temp'
    Topic_Token = 'ACCESS_TOKEN'
    Permission = 'Public'
    RequestDetail = 'Null' 
    OrgOwner = 'Swinburne_University'
    DepOwner = 'Computer_Science'
    PrsnOwner = 'Anas_Dawod'
    PaymentPerKbyte = 10
    PaymentPerMinute = 5
    Protocol = 'MQTT'
    MessageAttributes  = 'null'
    Interval = 10
    FurtherDetails = 'null'
    SSNmetadata = 'null'
    transaction = Transaction.newTransaction(wallet, recipient, amount);
    metadata    = Metadata.newMetadata(senderWallet,Name,Geo ,IP_URL , Topic_Token, Permission,
      RequestDetail, OrgOwner, DepOwner,PrsnOwner, PaymentPerKbyte, 
      PaymentPerMinute, Protocol, MessageAttributes, Interval, 
      FurtherDetails, SSNmetadata)
  });

  it('outputs the `amount` subtracted from the wallet balance', () => {
    expect(transaction.outputs.find(output => output.address === wallet.publicKey).amount)
      .toEqual(wallet.balance - amount);
  });

  it('outputs the `amount` added to the recipient', () => {
    expect(transaction.outputs.find(output => output.address === recipient).amount)
      .toEqual(amount);
  });

  it('inputs the balance of the wallet', () => {
    expect(transaction.input.amount).toEqual(wallet.balance);
  });

  it('validates a valid transaction', () => {
    expect(Transaction.verifyTransaction(transaction)).toBe(true);
  });

  it('validates a valid metadata', () => {
    expect(Metadata.verifyMetadata(metadata)).toBe(true);
  });

  it('invalidates a corrupt transaction', () => {
    transaction.outputs[0].amount = 50000;
    expect(Transaction.verifyTransaction(transaction)).toBe(false);
  });

  describe('transacting with an amount that exceeds the balance', () => {
    beforeEach(() => {
      amount = 50000;
      transaction = Transaction.newTransaction(wallet, recipient, amount);
    });

    it('does not create the transaction', () => {
      expect(transaction).toEqual(undefined);
    });
  });

  describe('and updating a transaction', () => {
    let nextAmount, nextRecipient;

    beforeEach(() => {
      nextAmount = 20;
      nextRecipient = 'n3xt-4ddr355';
      transaction = transaction.update(wallet, nextRecipient, nextAmount);
    });

    it(`subtracts the next amount from the sender's output`, () => {
      expect(transaction.outputs.find(output => output.address === wallet.publicKey).amount)
        .toEqual(wallet.balance - amount - nextAmount);
    });

    it('outputs an amount for the next recipient', () => {
      expect(transaction.outputs.find(output => output.address === nextRecipient).amount)
        .toEqual(nextAmount);
    });
  });

  describe('creating a reward transaction', () => {
    beforeEach(() => {
      transaction = Transaction.rewardTransaction(wallet, Wallet.blockchainWallet());
    });

    it(`reward the miner's wallet`, () => {
      expect(transaction.outputs.find(output => output.address === wallet.publicKey).amount)
        .toEqual(MINING_REWARD);
    });
  });
});