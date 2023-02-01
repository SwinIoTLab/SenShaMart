const Payment = require('./payment');
const Integration = require('./integration');
const SensorRegistration = require('./sensor-registration');
const BrokerRegistration = require('./broker-registration');

class Transaction {
  constructor(transaction, type) {
    this.transaction = transaction;
    this.verify = type.verify;
    this.type = type;
  }

  static mapId(type) {
    return type.name();
  }
};

module.exports = Transaction;