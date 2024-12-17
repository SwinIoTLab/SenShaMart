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
import Payment from './payment.js';
import { ChainUtil } from '../util/chain-util.js';

describe('Payment', () => {

  const skp = ChainUtil.genKeyPair();
  const kp2 = ChainUtil.genKeyPair();
  const kp3 = ChainUtil.genKeyPair();
  const kp4 = ChainUtil.genKeyPair();

  it("Construct a payment", () => {
    new Payment(skp, 1, [Payment.createOutput(kp2.pubSerialized, 1), Payment.createOutput(kp3.pubSerialized, 2)], 0);
  });

  it("Construct a payment with negative rewardAmount", () => {
    expect(() => new Payment(skp, 1, [Payment.createOutput(kp2.pubSerialized, 1), Payment.createOutput(kp3.pubSerialized, 2)], -1)).toThrow();
  });
  it("Construct a payment with negative output amount", () => {
    expect(() => new Payment(skp, 1, [Payment.createOutput(kp2.pubSerialized, -1), Payment.createOutput(kp3.pubSerialized, 2)], 0)).toThrow();
  });
  it("Changing input fails verify", () => {
    const changing = new Payment(skp, 1, [Payment.createOutput(kp2.pubSerialized, 1), Payment.createOutput(kp3.pubSerialized, 2)], 0);

    expect(Payment.verify(changing).result).toBe(true);
    changing.input = kp2.pubSerialized;
    expect(Payment.verify(changing).result).toBe(false);
  });
  it("Changing counter fails verify", () => {
    const changing = new Payment(skp, 1, [Payment.createOutput(kp2.pubSerialized, 1), Payment.createOutput(kp3.pubSerialized, 2)], 0);

    expect(Payment.verify(changing).result).toBe(true);
    changing.counter++;
    expect(Payment.verify(changing).result).toBe(false);
  });
  it("Adding output fails verify", () => {
    const changing = new Payment(skp, 1, [Payment.createOutput(kp2.pubSerialized, 1), Payment.createOutput(kp3.pubSerialized, 2)], 0);

    expect(Payment.verify(changing).result).toBe(true);
    changing.outputs.push(Payment.createOutput(kp4.pubSerialized, 3));
    expect(Payment.verify(changing).result).toBe(false);
  });
  it("Removing output fails verify", () => {
    const changing = new Payment(skp, 1, [Payment.createOutput(kp2.pubSerialized, 1), Payment.createOutput(kp3.pubSerialized, 2)], 0);

    expect(Payment.verify(changing).result).toBe(true);
    changing.outputs.pop();
    expect(Payment.verify(changing).result).toBe(false);
  });
  it("Changing output key fails verify", () => {
    const changing = new Payment(skp, 1, [Payment.createOutput(kp2.pubSerialized, 1), Payment.createOutput(kp3.pubSerialized, 2)], 0);

    expect(Payment.verify(changing).result).toBe(true);
    changing.outputs[0].publicKey = kp4.pubSerialized;
    expect(Payment.verify(changing).result).toBe(false);
  });
  it("Changing output amount fails verify", () => {
    const changing = new Payment(skp, 1, [Payment.createOutput(kp2.pubSerialized, 1), Payment.createOutput(kp3.pubSerialized, 2)], 0);

    expect(Payment.verify(changing).result).toBe(true);
    changing.outputs[0].amount++;
    expect(Payment.verify(changing).result).toBe(false);
  });
  it("Changing rewardAmount fails verify", () => {
    const changing = new Payment(skp, 1, [Payment.createOutput(kp2.pubSerialized, 1), Payment.createOutput(kp3.pubSerialized, 2)], 0);

    expect(Payment.verify(changing).result).toBe(true);
    changing.rewardAmount++;
    expect(Payment.verify(changing).result).toBe(false);
  });
});