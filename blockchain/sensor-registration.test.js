/**
 *    Copyright (c) 2022-2024, SenShaMart
 *
 *    This file is part of SenShaMart.
 *
 *    SenShaMart is free software: you can redistribute it and/or modify
 *    it under the terms of the GNU Lesser General Public License.
 *
 *    OpenIoT is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Lesser General Public License for more details.
 *
 *    You should have received a copy of the GNU Lesser General Public License
 *    along with OpenIoT.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

/**
 * @author Anas Dawod e-mail: adawod@swin.edu.au
 */
const SensorRegistration = require('./sensor-registration');
const ChainUtil = require('../util/chain-util');
const SENSHAMART_URI_PREFIX = require('../util/constants').SENSHAMART_URI_PREFIX;

describe('Sensor Registration', () => {
  let keyPair;

  beforeEach(() => {
    keyPair = ChainUtil.genKeyPair();
  });

  it("Construct a sensor", () => {
    new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [], 0);
  });

  it("Construct a sensor with invalid counter", () => {
    expect(() => new SensorRegistration(keyPair, "hello", "test", 0, 0, "test", null, 0)).toThrow();
  });

  it("Construct a sensor with invalid name", () => {
    expect(() => new SensorRegistration(keyPair, 1, 5, 0, 0, "test", null, 0)).toThrow();
  });

  it("Construct a sensor with negative costPerMinute", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", -1, 0, "test", null, 0)).toThrow();
  });

  it("Construct a sensor with invalid costPerMinute", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 1.5, 0, "test", null, 0)).toThrow();
  });

  it("Construct a sensor with negative costPerKB", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, -1, "test", null, 0)).toThrow();
  });

  it("Construct a sensor with invalid costPerKB", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, "hello", "test", null, 0)).toThrow();
  });

  it("Construct a sensor with invalid broker", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, 5, null, 0)).toThrow();
  });

  it("Construct a sensor with negative rewardAmount", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, -1)).toThrow();
  });

  it("Construct a sensor with invalid rewardAmount", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, "0")).toThrow();
  });

  it("Construct a sensor with extra metadata", () => {
    new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);
  });

  it("Construct a sensor invalid subject in extra metadata", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: 0,
      p: "and",
      o: "something else"
    }], 0)).toThrow();
  });

  it("Construct a sensor reserved subject in extra metadata", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: SENSHAMART_URI_PREFIX + "something",
      p: "and",
      o: "something else"
    }], 0)).toThrow();
  });

  it("Construct a sensor with invalid predicate in extra metadata", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: {},
      o: "something else"
    }], 0)).toThrow();
  });

  it("Construct a sensor with reserved predicate in extra metadata", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: SENSHAMART_URI_PREFIX + "and",
      o: "something else"
    }], 0)).toThrow();
  });

  it("Construct a sensor with invalid object in extra metadata", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: []
    }], 0)).toThrow();
  });

  it("Construct a sensor with reserved object in extra metadata", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: SENSHAMART_URI_PREFIX + "something else"
    }], 0)).toThrow();
  });

  it("Changing input fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.input = ChainUtil.genKeyPair();

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });

  it("Changing counter fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.counter++;

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });

  it("Changing rewardAmount fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.rewardAmount++;

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });

  it("Changing metadata name fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.metadata.name = "else";

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });

  it("Changing metadata costPerMinute fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.metadata.costPerMinute++;

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });

  it("Changing metadata costPerKB fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.metadata.costPerKB++;

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });

  it("Changing metadata integrationBroker fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", [{
      s: "something",
      p: "and",
      o: "something else"
    }], 0);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.metadata.integrationBroker += "a";

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });
});
