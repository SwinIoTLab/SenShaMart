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
 * @author Anas Dawod e-mail: adawod@swin.edu.au
 */
import SensorRegistration  from './sensor-registration.js';
import { ChainUtil } from '../util/chain-util.js';
import { SENSHAMART_URI_PREFIX } from '../util/constants.js';

describe('Sensor Registration', () => {
  const keyPair = ChainUtil.genKeyPair();

  it("Construct a sensor", () => {
    new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, 0);
  });

  it("Construct a sensor with negative costPerMinute", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", -1, 0, "test", null, 0)).toThrow();
  });

  it("Construct a sensor with negative costPerKB", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, -1, "test", null, 0)).toThrow();
  });

  it("Construct a sensor with negative rewardAmount", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, -1)).toThrow();
  });

  it("Construct a sensor with numeric interval", () => {
    new SensorRegistration(keyPair, 1, "test", 0, 1, "test", 1, 0);
  });

  it("Construct a sensor with zero interval", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", 0, 0)).toThrow();
  });

  it("Construct a sensor with negative interval", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", -1, 0)).toThrow();
  });

  it("Construct a sensor with extra metadata", () => {
    new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]);
  });

  it("Construct a sensor reserved subject in extra metadata", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, 0, [{
      s: SENSHAMART_URI_PREFIX + "something",
      p: "and",
      o: "something else"
    }])).toThrow();
  });

  it("Construct a sensor with reserved predicate in extra metadata", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, 0, [{
      s: "something",
      p: SENSHAMART_URI_PREFIX + "and",
      o: "something else"
    }])).toThrow();
  });

  it("Construct a sensor with reserved object in extra metadata", () => {
    expect(() => new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, 0, [{
      s: "something",
      p: "and",
      o: SENSHAMART_URI_PREFIX + "something else"
    }])).toThrow();
  });

  it("Changing input fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.input = ChainUtil.genKeyPair().pubSerialized;

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });

  it("Changing counter fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.counter++;

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });

  it("Changing rewardAmount fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.rewardAmount++;

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });

  it("Changing metadata name fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.metadata.name = "else";

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });

  it("Changing metadata costPerMinute fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.metadata.costPerMinute++;

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });

  it("Changing metadata costPerKB fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.metadata.costPerKB++;

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });

  it("Changing metadata integrationBroker fails verify", () => {
    const changing = new SensorRegistration(keyPair, 1, "test", 0, 0, "test", null, 0, [{
      s: "something",
      p: "and",
      o: "something else"
    }]);

    expect(SensorRegistration.verify(changing).result).toBe(true);

    changing.metadata.integrationBroker += "a";

    expect(SensorRegistration.verify(changing).result).toBe(false);
  });
});
