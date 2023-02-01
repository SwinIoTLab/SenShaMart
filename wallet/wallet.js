const Payment = require('../blockchain/payment');
const Integration = require('../blockchain/integration');
const SensorRegistration = require('../blockchain/sensor-registration');
const BrokerRegistration = require('../blockchain/broker-registration');
const Transaction = require('../blockchain/transaction');

//TODO: keep track of issued transactions, so we don't accidently try and double spend
class Wallet {
  constructor(keyPair) {
    this.keyPair = keyPair;
    this.publicKey = this.keyPair.getPublic().encode('hex');
    this.counter = 0;
  }

  sign(dataHash) {
    return this.keyPair.sign(dataHash);
  }

  //TODO: API for multiple outputs
  //returns Transaction
  createPayment(rewardAmount, outputs, blockchain) {
    const balance = blockchain.getBalanceCopy(this.publicKey);

    if (balance.counter > this.counter) {
      this.counter = balance.counter;
    }

    let totalAmount = 0;
    for (const output of outputs) {
      totalAmount += output.amount;
    }

    if (totalAmount + rewardAmount > balance.balance) {
      console.log(`Total amount: ${totalAmount} + reward amount: ${rewardAmount} exceeds current balance: ${balance.balance}`);
      return null;
    }

    const counterToUse = this.counter + 1;
    this.counter++;

    return new Payment(this.keyPair, counterToUse, outputs, rewardAmount);
  }

  createPaymentAsTransaction(rewardAmount, outputs, blockchain) {
    return new Transaction(
      this.createPayment(rewardAmount, outputs, blockchain),
      Payment);
  }

  //TODO: API for multiple sensors
  //returns Transaction
  createIntegration(rewardAmount, outputs, blockchain) {
    const balance = blockchain.getBalanceCopy(this.publicKey);

    if (balance.counter > this.counter) {
      this.counter = balance.counter;
    }

    let totalAmount = 0;
    for (const output of outputs) {
      totalAmount += output.amount;
    }

    if (totalAmount + rewardAmount > balance.balance) {
      console.log(`Total amount: ${totalAmount} + reward amount: ${rewardAmount} exceeds current known balance: ${balance.balance}`);
      return null;
    }

    const counterToUse = this.counter + 1;
    this.counter++;

    return new Integration(this.keyPair, counterToUse, outputs, rewardAmount);
  }

  createIntegrationAsTransaction(rewardAmount, outputs, blockchain) {
    return new Transaction(
      this.createIntegration(rewardAmount, outputs, blockchain),
      Integration);
  }

  //returns Transaction
  createBrokerRegistration(metadata, rewardAmount, blockchain) {
    const balance = blockchain.getBalanceCopy(this.publicKey);

    if (balance.counter > this.counter) {
      this.counter = balance.counter;
    }

    if (rewardAmount > balance.balance) {
      console.log(`Reward amount: ${rewardAmount} exceeds current balance: ${balance.balance}`);
      return null;
    }

    const counterToUse = this.counter + 1;
    this.counter++;

    return new BrokerRegistration(this.keyPair, counterToUse, metadata, rewardAmount)
  }

  createBrokerRegistrationAsTransaction(metadata, rewardAmount, blockchain) {
    return new Transaction(
      this.createBrokerRegistration(metadata, rewardAmount, blockchain),
      BrokerRegistration);
  }

  //return Transaction
  createSensorRegistration(metadata, rewardAmount, blockchain) {
    const balance = blockchain.getBalanceCopy(this.publicKey);

    if (balance.counter > this.counter) {
      this.counter = balance.counter;
    }

    if (rewardAmount > balance.balance) {
      console.log(`Reward amount: ${rewardAmount} exceeds current balance: ${balance.balance}`);
      return null;
    }

    const counterToUse = this.counter + 1;
    this.counter++;

    return new SensorRegistration(this.keyPair, counterToUse, metadata, rewardAmount);
  }

  createSensorRegistrationAsTransaction(metadata, rewardAmount, blockchain) {
    return new Transaction(
      this.createSensorRegistration(metadata, rewardAmount, blockchain),
      SensorRegistration);
  }
}

module.exports = Wallet;

