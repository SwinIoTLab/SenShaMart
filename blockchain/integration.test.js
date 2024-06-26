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
const Integration = require('./integration');
const ChainUtil = require('../util/chain-util');

function createDummyIntegration(keyPair, witnesses) {
  return new Integration(
    keyPair,
    1,
    [Integration.createOutput(keyPair.getPublic().encode('hex'), 'a', 5, 1)],
    witnesses,
    0);
}

describe('Integration', () => {
  let keyPair;

  beforeEach(() => {
    keyPair = ChainUtil.genKeyPair();
  });

  it("Choose witnesses doesn't care about brokers ordering, 1 witness", () => {
    const brokers_f = ['a', 'b', 'c'];
    const brokers_b = ['c', 'b', 'a'];

    const integration = createDummyIntegration(keyPair, 1);
    expect(Integration.chooseWitnesses(integration, brokers_f)).toEqual(Integration.chooseWitnesses(integration, brokers_b));
  });

  it("Choose witnesses doesn't care about brokers ordering, 2 witness", () => {
    const brokers_f = ['a', 'b', 'c'];
    const brokers_b = ['c', 'b', 'a'];

    const integration = createDummyIntegration(keyPair, 2);
    expect(Integration.chooseWitnesses(integration, brokers_f)).toEqual(Integration.chooseWitnesses(integration, brokers_b));
  });

  it("Choose witnesses doesn't care about brokers ordering, 3 witness", () => {
    const brokers_f = ['a', 'b', 'c'];
    const brokers_b = ['c', 'b', 'a'];

    const integration = createDummyIntegration(keyPair, 3);
    expect(Integration.chooseWitnesses(integration, brokers_f)).toEqual(Integration.chooseWitnesses(integration, brokers_b));
  });
});
