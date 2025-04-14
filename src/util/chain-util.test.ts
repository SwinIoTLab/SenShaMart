import { ChainUtil } from '../util/chain-util.js';

describe('Chain-util', () => {
  it('Genned keys different', async () => {
    const kp = ChainUtil.genKeyPair();
    const kp2 = ChainUtil.genKeyPair();
    expect(kp.pubSerialized).not.toBe(kp2.pubSerialized);
  });
});