const Wallet = require('../wallet');
const Transaction = require('../wallet/transaction');

 
class Miner {
  constructor(blockchain, transactionPool, wallet, p2pServer) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.wallet = wallet;
    this.p2pServer = p2pServer;
  } 

  mine() {
    const validTransactions = this.transactionPool.validTransactions();
    validTransactions.push(
      Transaction.rewardTransaction(this.wallet, Wallet.blockchainWallet())
    );
    console.log(validTransactions);
    console.log("//////");
    const validMetadataS = this.transactionPool.validMetadataS();
    // for (let i =0; i <validMetadataS.length; i++){
    //   validTransactions.push(validMetadataS[i]);
    // }

    console.log(validTransactions);
   // const validMetadataS    = this.transactionPool.metadataS;
    const block = this.blockchain.addBlock([validTransactions, validMetadataS]);
    this.p2pServer.syncChains();
    this.transactionPool.clear();
    this.p2pServer.broadcastClearTransactions();
 
    return block;
  }
}

module.exports = Miner; 

