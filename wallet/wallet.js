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
  createPayment(blockchain, rewardAmount, outputs) {
    console.log(`${outputs}`);
    console.log(`${rewardAmount}`);

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

  createPaymentAsTransaction(blockchain, rewardAmount, outputs) {
    return new Transaction(
      this.createPayment(blockchain, rewardAmount, outputs),
      Payment);
  }

  //TODO: API for multiple sensors
  //returns Transaction
  createIntegration(blockchain, rewardAmount, witnessCount, outputs) {
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

    return new Integration(this.keyPair, counterToUse, outputs, witnessCount, rewardAmount);
  }

  createIntegrationAsTransaction(blockchain, rewardAmount, witnessCount, outputs) {
    return new Transaction(
      this.createIntegration(blockchain, rewardAmount, witnessCount, outputs),
      Integration);
  }

  //returns Transaction
  createBrokerRegistration(blockchain, rewardAmount, brokerName, endpoint, extraNodeMetadata, extraLiteralMetadata) {
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

    return new BrokerRegistration(
      this.keyPair,
      counterToUse,
      brokerName,
      endpoint,
      extraNodeMetadata,
      extraLiteralMetadata,
      rewardAmount);
  }

  createBrokerRegistrationAsTransaction(blockchain, rewardAmount, brokerName, endpoint, extraNodeMetadata, extraLiteralMetadata) {
    return new Transaction(
      this.createBrokerRegistration(blockchain, rewardAmount, brokerName, endpoint, extraNodeMetadata, extraLiteralMetadata),
      BrokerRegistration);
  }

  //return Transaction
  createSensorRegistration(blockchain, rewardAmount, sensorName, costPerMinute, costPerKB, integrationBroker, extraNodeMetadata, extraLiteralMetadata) {
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

    return new SensorRegistration(this.keyPair, counterToUse, sensorName, costPerMinute, costPerKB, integrationBroker, extraNodeMetadata, extraLiteralMetadata, rewardAmount);
  }

  createSensorRegistrationAsTransaction(blockchain, rewardAmount, sensorName, costPerMinute, costPerKB, integrationBroker, extraNodeMetadata, extraLiteralMetadata) {
    return new Transaction(
      this.createSensorRegistration(blockchain, rewardAmount, sensorName, costPerMinute, costPerKB, integrationBroker, extraNodeMetadata, extraLiteralMetadata),
      SensorRegistration);
  }
}

module.exports = Wallet;

