/**
 *    Copyright (c) 2022-2024, SenShaMart
 *
 *    This file is part of SenShaMart.
 *
 *    SenShaMart is free software: you can redistribute it and/or modify
 *    it under the terms of the GNU Lesser General Public License.
 *
 *    SenShaMart is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Lesser General Public License for more details.
 *
 *    You should have received a copy of the GNU Lesser General Public License
 *    along with SenShaMart.  If not, see <http://www.gnu.org/licenses/>.
 **/

/**
 * @author Josip Milovac
 */
import SensorRegistration from './sensor-registration.js';
import BrokerRegistration from './broker-registration.js';
import Integration from './integration.js';
import Payment from './payment.js';
import Commit from './commit.js';

const ALL_TYPES = [
  SensorRegistration,
  BrokerRegistration,
  Integration,
  Payment,
  Commit
];

export { ALL_TYPES };
