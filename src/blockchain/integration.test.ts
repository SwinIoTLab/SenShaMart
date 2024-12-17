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
import Integration from './integration.js';
import { ChainUtil, type KeyPair } from '../util/chain-util.js';

function createDummyIntegration(keyPair: KeyPair, witnesses: number) {
  return new Integration(
    keyPair,
    1,
    [Integration.createOutput(1, 'a', 'b', 'c')],
    witnesses,
    0);
}

describe('Integration', () => {
  const keyPair = ChainUtil.genKeyPair();

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
  it("Construct an integration with no extra witnesses", () => {
    createDummyIntegration(keyPair, 0);
  });
  it("Construct an integration with 1 witness", () => {
    createDummyIntegration(keyPair, 1);
  });
  it("Changing input fails verify", () => {
    const changing = createDummyIntegration(keyPair, 0);

    expect(Integration.verify(changing).result).toBe(true);

    changing.input = ChainUtil.genKeyPair().pubSerialized;

    expect(Integration.verify(changing).result).toBe(false);
  });
  it("Changing counter fails verify", () => {
    const changing = createDummyIntegration(keyPair, 0);

    expect(Integration.verify(changing).result).toBe(true);

    changing.counter++;

    expect(Integration.verify(changing).result).toBe(false);
  });
  it("Changing rewardAmount fails verify", () => {
    const changing = createDummyIntegration(keyPair, 0);

    expect(Integration.verify(changing).result).toBe(true);

    changing.rewardAmount++;

    expect(Integration.verify(changing).result).toBe(false);
  });
  it("Changing witnessCount fails verify", () => {
    const changing = createDummyIntegration(keyPair, 0);

    expect(Integration.verify(changing).result).toBe(true);

    changing.witnessCount++;

    expect(Integration.verify(changing).result).toBe(false);
  });
});
