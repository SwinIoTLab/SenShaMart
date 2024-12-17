import Blockchain from './blockchain.js';
import Block from './block.js';
import { ChainUtil, type KeyPair } from '../util/chain-util.js';

describe('Blockchain', () => {

  let keyPair: KeyPair = null;

  const testKeyPair = ChainUtil.genKeyPair();

  beforeEach(() => {
    keyPair = ChainUtil.genKeyPair();
  });

  it('Replace empty chain with new chain', async () => {
    const b1 = await Blockchain.create(":memory:", null);
    const b2 = await Blockchain.create(":memory:", null);
    for (let i = 0; i < 5; ++i) {
      await b1.addBlock(Block.debugMine(b1.lastBlock(), testKeyPair.pubSerialized, [], [], [], [], []));
    }
    await b2.replaceChain(b1.getCachedBlocks().blocks, 0);
  });
});