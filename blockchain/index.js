const Block = require('./block');

class Blockchain {
  constructor() {
    this.chain = [Block.genesis()];
  }

  //adds an existing block to the blockchain, returns false if the block can't be added, true if it was added
  addBlock(newBlock) {
    if (newBlock.lastHash !== this.chain[this.chain.length - 1].hash) {
      console.log("Tried to add invalid block, last hash didn't match our last hash");
      return false;
    }
    //how to check if new block's timestamp is believable
    if (newBlock.difficulty !== Block.adjustDifficulty(this.chain[this.chain.length - 1], newBlock.timestamp)) {
      console.log("Tried to add invalid block, difficulty is incorrect");
      return false;
    }
    if (!Block.checkBlock(newBlock)) {
      console.log("Tried to add invalid block, block's hash doesn't match its contents");
      return false;
    } 

    this.chain.push(newBlock);

    console.log("Added new block: ");
    //console.log(newBlock);

    return true;
  }

  isValidChain(chain) {
    if (chain.length === 0) {
      return false;
    }
    if (JSON.stringify(chain[0]) !== JSON.stringify(Block.genesis())) {
      return false;
    }

    for (let i=1; i<chain.length; i++) {
      const block = chain[i];
      const lastBlock = chain[i-1];

      if (block.lastHash !== lastBlock.hash ||
          block.hash !== Block.blockHash(block)) {
        return false;
      }
      if (!Block.checkBlock(block)) {
        return false;
      }
    }

    return true;
  }

  //return null on fail, returns the index of where they differ
  replaceChain(newChain) {
    if (newChain.length <= this.chain.length) {
      console.log('Received chain is not longer than the current chain.');
      return false;
    } else if (!this.isValidChain(newChain)) {
      console.log('The received chain is not valid.');
      return false;
    }

    console.log('Replacing blockchain with the new chain.');

    const oldChain = this.chain;
    this.chain = newChain;

    //find where they differ
    for (let i = 1; i < oldChain.length; ++i) {
      if (oldChain[i].hash !== newChain[i].hash) {
        return i;
      }
    }
    //if they didn't differ in the length of the old chain, must be one after
    return oldChain.length;
  }
}

module.exports = Blockchain;