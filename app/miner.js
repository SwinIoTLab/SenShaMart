const Wallet = require('../wallet');
const CoinTransaction = require('../wallet/CoinTransaction');
const MetaDataTransaction = require('../wallet/MetaDataTransaction');
//const MetaDataPool= require('../wallet/metaData-Pool');
const { MaxNumOfCoinTransactions, MaxNumOfMetadataTransactions} = require('../config');
var   TransactionPointer;
var NumberOfClearedCoins;
var NumberOfClearedMeta;
class Miner {
  constructor(blockchain, transactionPool, wallet, p2pServer) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.wallet = wallet;
    this.p2pServer = p2pServer;
  }

  mine() {
    
    //const validCoinTransactions = this.transactionPool.validCoinTransactions(); Temeperarly changed without checking transaction validity
    var SelectedCoinTransactions     = this.transactionPool.cointransactions.slice(0, MaxNumOfCoinTransactions);
    var SelectedMetadataTransactions = this.transactionPool.metaDataTransactions.slice(0, MaxNumOfMetadataTransactions);
    //const validTransactions = validCoinTransactions.Concat(validMetaDataTransactions);
    // SelectedCoinTransactions = validCoinTransactions.splice (0, MaxNumOfCoinTransactions); //this will return only limited number of transactions to be stored
     // for (TransactionPointer=0; TransactionPointer<MaxNumOfCoinTransactions; TransactionPointer++){
     //   SelectedCoinTransactions.push(validCoinTransactions[TransactionPointer]);
    //  } 

     // SelectedMetadataTransactions = validMetadataTransactions.splice (0, MaxNumOfMetadataTransactions);
      // for (TransactionPointer=0; TransactionPointer<MaxNumOfCoinTransactions; TransactionPointer++){
      //   SelectedCoinTransactions.push(validCoinTransactions[TransactionPointer]);
     //  } 
    // include a reward transaction for the miner
    SelectedCoinTransactions.push(CoinTransaction.rewardCoinTransaction(this.wallet, Wallet.blockchainWallet()));
    //CoinTransaction.rewardCoinTransaction(this.wallet, Wallet.blockchainWallet())); 
    // create a block consisting of the valid transactions
    const block = this.blockchain.addBlock([SelectedCoinTransactions,SelectedMetadataTransactions]);
    //const block = this.blockchain.addBlock(validTransactions);
    // synchronize chains in the peer-to-peer server

    
    this.p2pServer.syncChains();
    
    // clear the transaction pool
    // broadcast to every miner to clear their transaction pools
   // if (validCoinTransactions.length>MaxNumOfCoinTransactions){
   // this.transactionPool.clearCoin();// clears only selected cointransactions
   
   this.transactionPool.clearCoin(SelectedCoinTransactions.length-1);
   this.transactionPool.clearMeta(SelectedMetadataTransactions.length);
    this.p2pServer.broadcastClearCoinTransactions();
    this.p2pServer.broadcastClearMetadataTransactions();
    SelectedCoinTransactions = [];
    SelectedMetadataTransactions =[];
  //  }
    // else {
    //   this.transactionPool.clearAll();
    //   this.p2pServer.broadcastClearAllTransactions();
    // }
    return block;
  }
}
//module.exports = {NumberOfClearedCoins, NumberOfClearedMeta}; 
module.exports = Miner;
