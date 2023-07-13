const Blockchain = require('./blockchain');
const Block = require('./block');

describe('Blockchain', () => {
  let bc, bc2;

  beforeEach(() => {
    bc = new Blockchain();
    bc2 = new Blockchain();
  });

  it('starts with genesis block', () => {
    expect(bc.chain[0]).toEqual(Block.genesis());
  });

  it('adds a new block', () => {
    const reward = 'test-reward-key';
    expect(bc.addBlock(Block.debugMine(bc.lastBlock(),reward))).toBe(true);

    expect(bc.lastBlock().reward).toEqual(reward);
  });

  it('validates a valid chain', () => {
    expect(bc2.addBlock(Block.debugMine(bc2.lastBlock(), 'test-reward-key'))).toBe(true);

    expect(Blockchain.isValidChain(bc2.chain)).toBe(true);
  });

  it('invalidates a chain with a corrupt genesis block', () => {
    bc2.chain[0].hash = 'Bad data';

    expect(Blockchain.isValidChain(bc2.chain)).toBe(false);
  });

  it('invalidates a corrupt chain', () => {
    expect(bc2.addBlock(Block.debugMine(bc2.lastBlock(), 'test-reward-key', [], []))).toBe(true);
    bc2.chain[1].reward = 'Not foo';

    expect(Blockchain.isValidChain(bc2.chain)).toBe(false);
  });

  it('replaces the chain with a valid chain', () => {
    expect(bc2.addBlock(Block.debugMine(bc2.lastBlock(), 'test-reward-key', [], []))).toBe(true);
    expect(bc.replaceChain(bc2.chain).result).toBe(true);

    expect(bc.chain).toEqual(bc2.chain);
  });

  it('does not replace the chain with one of less than or equal to length', () => {
    expect(bc.addBlock(Block.debugMine(bc.lastBlock(), 'test-reward-key', [], []))).toBe(true);
    expect(bc.replaceChain(bc2.chain).result).toBe(false);

    expect(bc.chain).not.toEqual(bc2.chain);
  })
});