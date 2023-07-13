const PropServer = require('./blockchain-prop');
const Block = require('../blockchain/block');

const s1 = new PropServer('s1', false);
const s2 = new PropServer('s2', false);
const s3 = new PropServer('s3', false);

s1.start(9100, 'ws://127.0.0.1:9100', []);
s2.start(9101, 'ws://127.0.0.1:9101', ['ws://127.0.0.1:9100']);
s3.start(9102, 'ws://127.0.0.1:9102', ['ws://127.0.0.1:9101']);

const blocks = [Block.genesis()];
blocks.push(Block.debugMine(blocks[blocks.length - 1], 'eh', [], [], [], [], []));

s3.updateBlocks(blocks);