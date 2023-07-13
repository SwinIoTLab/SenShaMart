const PREFIX = require('../util/constants').SENSHAMART_URI_PREFIX;

module.exports = {
  PREDICATE: {
    IS_OWNED_BY: PREFIX + "IsOwnedBy",
    DEFINES: PREFIX + "Defines",
    HAS_COUNTER: PREFIX + "HasCounter",
    COSTS_PER_MINUTE: PREFIX + "CostsPerMinute",
    COSTS_PER_KB: PREFIX + "CostsPerKB",
    USES_BROKER: PREFIX + "UsesBroker",
    HAS_ENDPOINT: PREFIX + "HasEndpoint",
    CONTAINS_TRANSACTION: PREFIX + "ContainsTransaction",
    CONTAINS_SENSOR_REGISTRATION: PREFIX + "ContainsSensorRegistration",
    CONTAINS_BROKER_REGISTRATION: PREFIX + "ContainsBrokerRegistration",
    TYPE: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    LAST_BLOCK: PREFIX + "LastBlock"
  },
  OBJECT: {
    SENSOR_REGISTRATION: PREFIX + "SensorRegistration",
    BROKER_REGISTRATION: PREFIX + "BrokerRegistration",
    TRANSACTION: PREFIX + "Transaction",
    WALLET: PREFIX + "Wallet",
    BLOCK: PREFIX + "Block",

  }
};