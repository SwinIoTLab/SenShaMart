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

/**
 * @author Josip Milovac
 */
const BrokerRegistration = require('./broker-registration');
const ChainUtil = require('../util/chain-util');
const SENSHAMART_URI_PREFIX = require('../util/constants').SENSHAMART_URI_PREFIX;

describe('Broker Registration', () => {
  let keyPair;

  beforeEach(() => {
    keyPair = ChainUtil.genKeyPair();
  });

  it("Construct a broker", () => {
    new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [], 0);
  });

  it("Construct a broker with invalid counter", () => {
    expect(() => new BrokerRegistration(keyPair, "hello", "test", 0, 0, "test", null, 0)).toThrow();
  });

  it("Construct a broker with invalid name", () => {
    expect(() => new BrokerRegistration(keyPair, 1, 5, 0, 0, "test", null, 0)).toThrow();
  });

  it("Construct a broker with negative costPerMinute", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", -1, 0, "test", null, 0)).toThrow();
  });

  it("Construct a broker with invalid costPerMinute", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", 1.5, 0, "test", null, 0)).toThrow();
  });

  it("Construct a broker with negative costPerKB", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", 0, -1, "test", null, 0)).toThrow();
  });

  it("Construct a broker with invalid costPerKB", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", 0, "hello", "test", null, 0)).toThrow();
  });

  it("Construct a broker with invalid broker", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", 0, 0, 5, null, 0)).toThrow();
  });

  it("Construct a broker with negative rewardAmount", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", null, -1)).toThrow();
  });

  it("Construct a broker with invalid rewardAmount", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", null, "0")).toThrow();
  });

  it("Construct a broker with extra metadata", () => {
    new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);
  });

  it("Construct a broker invalid subject in extra metadata", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: 0,
      p: "and",
      o: "something else"
    }], 0)).toThrow();
  });

  it("Construct a broker reserved subject in extra metadata", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: SENSHAMART_URI_PREFIX + "something",
      p: "and",
      o: "something else"
    }], 0)).toThrow();
  });

  it("Construct a broker with invalid predicate in extra metadata", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: {},
      o: "something else"
    }], 0)).toThrow();
  });

  it("Construct a broker with reserved predicate in extra metadata", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: SENSHAMART_URI_PREFIX + "and",
      o: "something else"
    }], 0)).toThrow();
  });

  it("Construct a broker with invalid object in extra metadata", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: []
    }], 0)).toThrow();
  });

  it("Construct a broker with reserved object in extra metadata", () => {
    expect(() => new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: SENSHAMART_URI_PREFIX + "something else"
    }], 0)).toThrow();
  });

  it("Changing input fails verify", () => {
    const changing = new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(BrokerRegistration.verify(changing).result).toBe(true);

    changing.input = ChainUtil.genKeyPair();

    expect(BrokerRegistration.verify(changing).result).toBe(false);
  });

  it("Changing counter fails verify", () => {
    const changing = new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(BrokerRegistration.verify(changing).result).toBe(true);

    changing.counter++;

    expect(BrokerRegistration.verify(changing).result).toBe(false);
  });

  it("Changing rewardAmount fails verify", () => {
    const changing = new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(BrokerRegistration.verify(changing).result).toBe(true);

    changing.rewardAmount++;

    expect(BrokerRegistration.verify(changing).result).toBe(false);
  });

  it("Changing metadata name fails verify", () => {
    const changing = new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(BrokerRegistration.verify(changing).result).toBe(true);

    changing.metadata.name = "else";

    expect(BrokerRegistration.verify(changing).result).toBe(false);
  });

  it("Changing metadata costPerMinute fails verify", () => {
    const changing = new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(BrokerRegistration.verify(changing).result).toBe(true);

    changing.metadata.costPerMinute++;

    expect(BrokerRegistration.verify(changing).result).toBe(false);
  });

  it("Changing metadata costPerKB fails verify", () => {
    const changing = new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(BrokerRegistration.verify(changing).result).toBe(true);

    changing.metadata.costPerKB++;

    expect(BrokerRegistration.verify(changing).result).toBe(false);
  });

  it("Changing metadata endpoint fails verify", () => {
    const changing = new BrokerRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(BrokerRegistration.verify(changing).result).toBe(true);

    changing.metadata.endpoint += "a";

    expect(BrokerRegistration.verify(changing).result).toBe(false);
  });
});
