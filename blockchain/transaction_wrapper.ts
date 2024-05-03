import SensorRegistration from './sensor-registration.js';
import BrokerRegistration from './broker-registration.js';
import Integration from './integration.js';
import Payment from './payment.js';
import Compensation from './compensation.js';
import Commit from './commit.js';

const ALL_TYPES = [
  SensorRegistration,
  BrokerRegistration,
  Integration,
  Payment,
  Compensation,
  Commit
];

export { ALL_TYPES };