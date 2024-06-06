import { SENSHAMART_URI_PREFIX as PREFIX } from '../util/constants.js';

export const PREDICATE = {
  IS_OWNED_BY: PREFIX + "IsOwnedBy",
  DEFINES: PREFIX + "Defines",
  HAS_COUNTER: PREFIX + "HasCounter",
  COSTS_PER_MINUTE: PREFIX + "CostsPerMinute",
  COSTS_PER_KB: PREFIX + "CostsPerKB",
  USES_BROKER: PREFIX + "UsesBroker",
  HAS_ENDPOINT: PREFIX + "HasEndpoint",
  CONTAINS_PAYMENT: PREFIX + "ContainsPayment",
  CONTAINS_INTEGRATION: PREFIX + "ContainsIntegration",
  CONTAINS_COMPENSATION: PREFIX + "ContainsCompensation",
  CONTAINS_COMMIT: PREFIX + "ContainsCommit",
  CONTAINS_TRANSACTION: PREFIX + "ContainsTransaction",
  CONTAINS_SENSOR_REGISTRATION: PREFIX + "ContainsSensorRegistration",
  CONTAINS_BROKER_REGISTRATION: PREFIX + "ContainsBrokerRegistration",
  TYPE: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  LAST_BLOCK: PREFIX + "LastBlock",
  REWARDED: PREFIX + "Rewarded",
  MINED_BY: PREFIX + "MinedBy",
  HAS_HASH: PREFIX + "HasHash",
  SUPERCEDES: PREFIX + "Supercedes"
};
  
export const OBJECT = {
  PAYMENT_TX: PREFIX + "Payment",
  INTEGRATION_TX: PREFIX + "Integration",
  COMPENSATION_TX: PREFIX + "Compensation",
  COMMIT_TX: PREFIX + "Commit",
  SENSOR_REGISTRATION_TX: PREFIX + "SensorRegistration",
  BROKER_REGISTRATION_TX: PREFIX + "BrokerRegistration",
  WALLET: PREFIX + "Wallet",
  BLOCK: PREFIX + "Block",
};

const URIS = {
  PREDICATE: PREDICATE,
  OBJECT: OBJECT
};

export default URIS;