import { Blockchain } from "../blockchain/blockchain.js";
import  Block from "../blockchain/block.js";
import { ChainUtil } from "../util/chain-util.js";

let chain: Blockchain = null;

const lengthTarget = Number.parseInt(process.argv[2]);

chain = await Blockchain.create("./test_blockchain.db", null);

const keypair = ChainUtil.genKeyPair();

while (chain.length() < lengthTarget) {
  const lastBlock = chain.lastBlock();
  console.log(`Last block hash: ${lastBlock.hash}`);
  await chain.addBlock(Block.debugMine(lastBlock, keypair.pubSerialized, null, null, null, null, null));
}