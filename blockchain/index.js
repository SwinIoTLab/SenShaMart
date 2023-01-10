const Block = require('./block');
const N3 = require('n3');
const DataFactory = require('n3').DataFactory;
const Transaction = require('../wallet/transaction');
const { MINING_REWARD } = require('../config');

function getBalanceCopyGeneric(publicKey, maps) {
  for (const map of maps) {
    if (map.hasOwnProperty(publicKey)) {
      const found = map[publicKey];
      return {
        balance: found.balance,
        counter: found.counter
      };
    }
  }

  return {
    balance: 0,
    counter: 0
  };
}

function verifyBlock(prevBalances, prevBlock, verifyingBlock) {
  if (verifyingBlock.lastHash !== prevBlock.hash) {
    return {
      result: false,
      reason: "last hash didn't match our last hash"
    };
  }
  //how to check if new block's timestamp is believable
  if (verifyingBlock.difficulty !== Block.adjustDifficulty(prevBlock, verifyingBlock.timestamp)) {
    return {
      result: false,
      reason: "difficulty is incorrect"
    };
  }
  if (!Block.checkHash(verifyingBlock)) {
    return {
      result: false,
      reason: "hash is invalid failed"
    };
  }

  const changedBalances = {};

  const rewardBalanceCopy = getBalanceCopyGeneric(verifyingBlock.reward, [prevBalances]);

  changedBalances[verifyingBlock.reward] = {
    balance: rewardBalanceCopy.balance + MINING_REWARD,
    counter: rewardBalanceCopy.counter
  };

  for (const transaction of Block.getTransactions(verifyingBlock)) {
    if (!Transaction.verify(transaction)) {
      return {
        result: false,
        reason: "couldn't verify a transaction" };
    }

    const inputBalance = getBalanceCopyGeneric(transaction.input, [changedBalances, prevBalances]);

    if (transaction.counter <= inputBalance.counter) {
      return {
        result: false,
        reason: "transaction has invalid counter"
      };
    }

    inputBalance.counter = transaction.counter;

    for (const output of transaction.outputs) {
      const outputBalance = getBalanceCopyGeneric(output.publicKey, [changedBalances, prevBalances]);

      if (output.amount > inputBalance.balance) {
        return {
          result: false,
          reason: "transaction spending more than they have"
        };
      }
      inputBalance.balance -= output.amount;
      outputBalance.balance += output.amount;
      changedBalances[output.publicKey] = outputBalance;
    }

    changedBalances[transaction.input] = inputBalance;
  }

  return {
    result: true,
    changedBalances: changedBalances
  };
}

function verifyChain(chain) {
  if (chain.length === 0) {
    return {
      result: false,
      reason: "zero length"
    };
  }
  if (JSON.stringify(chain[0]) !== JSON.stringify(Block.genesis())) {
    return {
      result: false,
      reason: "initial block isn't genesis"
    };
  }

  const balances = {};

  for (let i = 1; i < chain.length; i++) {
    const block = chain[i];
    const lastBlock = chain[i - 1];

    const verifyResult = verifyBlock(balances, lastBlock, block);

    if (verifyResult.result === false) {
      return {
        result: false,
        reason: `Chain is invalid on block ${i}: ${verifyResult.reason}`
      };
    }

    for (const publicKey in verifyResult.changedBalances) {
      balances[publicKey] = verifyResult.changedBalances[publicKey];
    }
  }

  return {
    result: true,
    balances: balances
  };
}

//returns the first index where the two chains differ
function findChainDifference(oldChain, newChain) {
  for (let i = 1; i < oldChain.length; ++i) {
    if (oldChain[i].hash !== newChain[i].hash) {
      return i;
    }
  }
  return 1;
}

function addBlockMetadata(blockchain, block) {
  const metadatas = Block.getMetadatas(block);
  for (const metadata of metadatas) {
    if (!("SSNmetadata" in metadata)) {
      //assert?
      return;
    }

    var ssn = metadata.SSNmetadata;

    const parser = new N3.Parser();

    parser.parse(
      ssn,
      (error, quadN, prefixes) => {
        if (quadN) {
          blockchain.store.addQuad(DataFactory.quad(
            DataFactory.namedNode(quadN.subject.id),
            DataFactory.namedNode(quadN.predicate.id),
            DataFactory.namedNode(quadN.object.id),
            DataFactory.namedNode(metadata.id)));
        }
      });
  }
}

class Blockchain {
  constructor() {
    this.chain = [Block.genesis()];
    this.balances = {};
    this.store = new N3.Store();
  }

  getBalanceCopy(publicKey) {
    return getBalanceCopyGeneric(publicKey, [this.balances]);
  }

  lastBlock() {
    return this.chain[this.chain.length - 1];
  }

  serialize() {
    return JSON.stringify(this.chain);
  }

  static deserialize(serialized) {
    const returning = new Blockchain();
    const replaceResult = returning.replaceChain(JSON.parse(serialized));
    if(!replaceResult.result) {
      //chain wasn't valid
      return null;
    } else {
      return returning;
    }
  }

  //adds an existing block to the blockchain, returns false if the block can't be added, true if it was added
  addBlock(newBlock) {
    const verifyResult = verifyBlock(this.balances, this.lastBlock(), newBlock);

    if (!verifyResult.result) {
      console.log(`Couldn't add block: ${verifyResult.reason}`);
      return false;
    }

    //all seems to be good, persist
    this.chain.push(newBlock);

    for (const publicKey in verifyResult.changedBalances) {
      this.balances[publicKey] = verifyResult.changedBalances[publicKey];
    }

    addBlockMetadata(this, newBlock);

    //console.log("Added new block");
    //console.log(newBlock);

    return true;
  }

  static isValidChain(chain) {
    const res = verifyChain(chain);

    return res.result;
  }

  //return false on fail, true on success
  //TODO: faster verification of the new chain by only verifying from divergence, would require saving some historical balance state
  replaceChain(newChain) {
    if (newChain.length <= this.chain.length) {
      return {
        result: false,
        reason: "Received chain is not longer than the current chain."
      };
    }
    const verifyResult = verifyChain(newChain);
    if (!verifyResult.result) {
      return {
        result: false,
        reason: `The received chain is not valid: ${verifyResult.reason}`
      };
    }

    //Replacing blockchain with the new chain

    const oldChain = this.chain;
    this.chain = newChain;

    //find where they differ
    const chainDifference = findChainDifference(oldChain, newChain);
    console.log(`chain difference was ${chainDifference}`);

    //fix metadata
    for (let i = oldChain.length - 1; i >= chainDifference; i--) {
      for (const metadata of Block.getMetadatas(oldChain[i])) {
        this.store.deleteGraph(metadata.id);
      }
    }
    for (let i = chainDifference; i < newChain.length; ++i) {
      addBlockMetadata(this, newChain[i]);
    }

    //fix balance
    this.balances = verifyResult.balances;

    return {
      result: true,
      chainDifference: chainDifference,
      oldChain: oldChain
    };
  }
}

module.exports = Blockchain;