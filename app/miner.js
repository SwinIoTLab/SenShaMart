const Block = require('../blockchain/block');

const ITERATIONS = 1;
 
class Miner {
  static STATE_RUNNING = 0;
  static STATE_INTERRUPTED = 1;

  constructor(blockchain, transactionPool, reward, p2pServer) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.p2pServer = p2pServer;
    this.state = Miner.STATE_INTERRUPTED;
    this.lastBlock = null;

    this.minedStartTime = null;

    this.mining = {};
    this.mining.transactions = [];
    this.mining.reward = reward;
    this.mining.metadatas = [];

    this.startMine();
  }

  interrupt() {
    if (this.state === Miner.STATE_RUNNING) {
      this.state = Miner.STATE_INTERRUPTED;
    }
  }

  interruptIfContainsTransaction(transaction) {
    if (this.state === Miner.STATE_RUNNING && this.mining.metadatas.find(t => t.id === transaction.id)) {
      this.state = Miner.STATE_INTERRUPTED;
    }
  }
  interruptIfContainsMetadata(metadata) {
    if (this.state === Miner.STATE_RUNNING && this.mining.transactions.find(t => t.id === metadata.id)) {
      this.state = Miner.STATE_INTERRUPTED;
    }
  }

  startMine() {
    //only continue if state is waiting or restarting
    if (this.state !== Miner.STATE_INTERRUPTED && this.state !== Miner.STATE_RESTARTING) {
      return;
    }

    this.minedStartTime = process.hrtime.bigint();

    this.mining.transactions =  this.transactionPool.validTransactionsCopy();
    this.mining.metadatas = this.transactionPool.validMetadatasCopy();

    this.lastBlock = this.blockchain.chain[this.blockchain.chain.length - 1];

    this.nonce = 0;
    this.state = Miner.STATE_RUNNING;

    this.mine();
  }

  mine() {
    if (this.state !== Miner.STATE_RUNNING) {
      this.state = Miner.STATE_RESTARTING;
      this.startMine();
      return;
    }
    const timestamp = Date.now();
    const difficulty = Block.adjustDifficulty(this.lastBlock, timestamp);

    for (let i = 0; i < ITERATIONS; ++i) {
      const hash = Block.hash(
        timestamp,
        this.lastBlock.hash,
        this.mining.reward,
        this.mining.transactions,
        this.mining.metadatas,
        this.nonce,
        difficulty);

      if (hash.substring(0, difficulty) === '0'.repeat(difficulty)) {
        //success
        const endTime = process.hrtime.bigint();
        console.log(`Mined a block of difficulty ${difficulty} in ${Number(endTime - this.minedStartTime) / 1000000}ms`);
        this.p2pServer.blockMined(new Block(
          timestamp,
          this.lastBlock.hash,
          hash,
          this.mining.reward,
          this.mining.transactions,
          this.mining.metadatas,
          this.nonce,
          difficulty));
        this.state = Miner.STATE_RESTARTING;
        setImmediate(() => { this.startMine() });
      } else {
        //failure
        this.nonce++;
      }
    }
    setImmediate(() => { this.mine() });
  }
}

module.exports = Miner;

