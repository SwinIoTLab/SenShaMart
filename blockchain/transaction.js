const SensorRegistration = require('./sensor-registration');
const BrokerRegistration = require('./broker-registration');
const Integration = require('./integration');
const Payment = require('./payment');
const Compensation = require('./compensation');

class Transaction {
  constructor(transaction, type) {
    this.transaction = transaction;
    this.verify = type.verify;
    this.type = type;
  }

  static ALL_TYPES = [
    SensorRegistration,
    BrokerRegistration,
    Integration,
    Payment,
    Compensation
  ];
};

module.exports = Transaction;