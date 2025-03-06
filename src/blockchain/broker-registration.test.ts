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
 * 
/**
 * @author Josip Milovac
 */
import BrokerRegistration from './broker-registration.js';
import { ChainUtil, type ResultFailure } from '../util/chain-util.js';
import { SENSHAMART_IRI_PREFIX } from '../util/constants.js';

describe('Broker Registration', () => {
  const keyPair = ChainUtil.genKeyPair();

  it("Construct a broker", () => {
    new BrokerRegistration(keyPair, 1, "test", "", 0);
  });

  it("Construct a broker with negative rewardAmount", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", "", -1)).toThrow();
  });

  it("Construct a broker with extra metadata", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", "", 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]));
  });

  it("Construct a broker reserved subject in extra metadata", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", "", 0, [{
      s: SENSHAMART_IRI_PREFIX + "something",
      p: "and",
      o: "something else"
    }])).toThrow();
  });

  it("Construct a broker with reserved predicate in extra metadata", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", "", 0, [{
      s: "something",
      p: SENSHAMART_IRI_PREFIX + "and",
      o: "something else"
    }])).toThrow();
  });

  it("Construct a broker with reserved object in extra metadata", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", "", 0, [{
      s: "something",
      p: "and",
      o: SENSHAMART_IRI_PREFIX + "something else"
    }])).toThrow();
  });

  it("Changing input fails verify", () => {
    const changing = new BrokerRegistration(keyPair, 1, "test", "", 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]);

    const fail: ResultFailure = { result: false, reason: "" };

    expect(BrokerRegistration.verify(changing,fail)).toBe(true);

    changing.input = "invalid key";

    expect(BrokerRegistration.verify(changing,fail)).toBe(false);
  });

  it("Changing counter fails verify", () => {
    const changing = new BrokerRegistration(keyPair, 1, "test", "", 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]);

    const fail: ResultFailure = { result: false, reason: "" };

    expect(BrokerRegistration.verify(changing, fail)).toBe(true);

    changing.counter++;

    expect(BrokerRegistration.verify(changing, fail)).toBe(false);
  });

  it("Changing rewardAmount fails verify", () => {
    const changing = new BrokerRegistration(keyPair, 1, "test", "", 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]);

    const fail: ResultFailure = { result: false, reason: "" };

    expect(BrokerRegistration.verify(changing, fail)).toBe(true);

    changing.rewardAmount++;

    expect(BrokerRegistration.verify(changing, fail)).toBe(false);
  });

  it("Changing metadata name fails verify", () => {
    const changing = new BrokerRegistration(keyPair, 1, "test", "", 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]);

    const fail: ResultFailure = { result: false, reason: "" };

    expect(BrokerRegistration.verify(changing, fail)).toBe(true);

    changing.metadata.name = "else";

    expect(BrokerRegistration.verify(changing, fail)).toBe(false);
  });

  it("Changing metadata endpoint fails verify", () => {
    const changing = new BrokerRegistration(keyPair, 1, "test", "", 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]);

    const fail: ResultFailure = { result: false, reason: "" };

    expect(BrokerRegistration.verify(changing, fail)).toBe(true);

    changing.metadata.endpoint += "a";

    expect(BrokerRegistration.verify(changing, fail)).toBe(false);
  });
});
