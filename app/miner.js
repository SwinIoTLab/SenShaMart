const Wallet = require('../wallet');
const Transaction = require('../wallet/transaction');
const Block = require('../blockchain/block');

 
class Miner {
  static STATE_WAITING = 0;
  static STATE_RUNNING = 1;
  static STATE_INTERRUPTED = 2;
  static STATE_RESTARTING = 3;

  constructor(blockchain, transactionPool, wallet, p2pServer) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.wallet = wallet;
    this.p2pServer = p2pServer;
    this.state = Miner.STATE_WAITING;
    this.mining = [[], []];
    this.lastBlock = null;
  }

  interrupt() {
    if (this.state === Miner.STATE_RUNNING) {
      this.state = Miner.STATE_INTERRUPTED;
    }
  }

  interruptIfContainsTransaction(transaction) {
    if (this.state === Miner.STATE_RUNNING && this.mining[0].find(t => t.id === transaction.id)) {
      this.state = Miner.STATE_INTERRUPTED;
    }
  }
  interruptIfContainsMetadata(metadata) {
    if (this.state === Miner.STATE_RUNNING && this.mining[1].find(t => t.id === metadata.id)) {
      this.state = Miner.STATE_INTERRUPTED;
    }
  }

  startMine() {
    //only continue if state is waiting or restarting
    if (this.state !== Miner.STATE_WAITING && this.state !== Miner.STATE_RESTARTING) {
      return;
    }

    const validTransactions = this.transactionPool.validTransactions();
    const validMetadataS = this.transactionPool.validMetadataS();

    if (validTransactions.length === 0 && validMetadataS.length === 0) {
      this.state = Miner.STATE_WAITING;
      return;
    }

    validTransactions.push(
      Transaction.rewardTransaction(this.wallet, Wallet.blockchainWallet())
    );

    this.lastBlock = this.blockchain.chain[this.blockchain.chain.length - 1];

    this.state = Miner.STATE_RUNNING;

    this.mining = [validTransactions, validMetadataS];
    this.nonce = 0;
    this.mine();
  }

  mine() {
    if (this.state !== Miner.STATE_RUNNING) {
      this.state = Miner.STATE_RESTARTING;
      startMine();
      return;
    }
    const timestamp = Date.now();
    const difficulty = Block.adjustDifficulty(this.lastBlock, timestamp);
    const hash = Block.hash(timestamp, this.lastBlock.hash, this.mining, this.nonce, difficulty);

    if (hash.substring(0, difficulty) === '0'.repeat(difficulty)) {
      //success
      this.p2pServer.newBlock(new Block(timestamp, this.lastBlock.hash, hash, this.mining, this.nonce, difficulty));
      this.state = Miner.STATE_RESTARTING;
      setImmediate(() => { this.startMine() });
    } else {
      //failure
      this.nonce++;
      setImmediate(() => { this.mine() });
    }
  }
}

module.exports = Miner; 

