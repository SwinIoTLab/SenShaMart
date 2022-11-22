const Websocket = require('ws');
const P2P_PORT = process.env.P2P_PORT || 5001;
const peers = process.env.PEERS ? process.env.PEERS.split(',') : [];
const MESSAGE_TYPES = {
  chain: 'CHAIN',
  cointransaction: 'COINTRANSACTION',
  clear_payment_transactions: 'CLEAR_Payment_TRANSACTIONS',
  clear_meta_transactions: 'CLEAR_META_TRANSACTIONS',
  clear_Comp_transactions: 'CLEAR_COMP_TRANSACTIONS',
  clear_Integration_transactions: 'CLEAR_Integration_TRANSACTIONS',
  metaDataTransaction: 'METADATATRANSACTION',};
class P2pServer {
  constructor(blockchain, transactionPool) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.sockets = [];}
  listen() {
    const server = new Websocket.Server({ port: P2P_PORT });
    server.on('connection', socket => this.connectSocket(socket));
    this.connectToPeers();
    console.log(`Listening for peer-to-peer connections on: ${P2P_PORT}`);}
  connectToPeers() { 
    peers.forEach(peer => {
      const socket = new Websocket(peer);
      socket.on('open', () => this.connectSocket(socket)); });}  
  connectSocket(socket) {
    this.sockets.push(socket);
    console.log('Socket connected');
    this.messageHandler(socket);
    this.sendChain(socket);}
  messageHandler(socket) { 
    socket.on('message', message => {
      const data = JSON.parse(message);
      switch(data.type) {
        case MESSAGE_TYPES.chain:
          this.blockchain.replaceChain(data.chain);
          break;
        case MESSAGE_TYPES.paymenttransaction:
          this.transactionPool.updateOrAddPaymentTransaction(
          data.Paymenttransaction);
          break;
        case MESSAGE_TYPES.metaDataTransaction:
            this.transactionPool.updateOrAddMetaDataTransaction(
            data.metaDataTransaction);
            break;
        case MESSAGE_TYPES.CompTransaction:
            this.transactionPool.updateOrAddCompTransaction(
            data.CompTransaction);
            break;
        case MESSAGE_TYPES.IntegrationTransaction:
            this.transactionPool.updateOrAddIntegrationTransaction(
            data.IntegrationTransaction);
            break;
        case MESSAGE_TYPES.clear_Payment_transactions:
          this.transactionPool.clearPayment(this.blockchain.chain[this.
          blockchain.chain.length-1].data[0].length-1);
          break;
        case MESSAGE_TYPES.clear_meta_transactions:
          this.transactionPool.clearMeta(this.blockchain.chain[this.
          blockchain.chain.length-1].data[1].length);
          break;
        case MESSAGE_TYPES.clear_comp_transactions:
          this.transactionPool.clearMeta(this.blockchain.chain[this.
          blockchain.chain.length-1].data[1].length);
          break;
         case MESSAGE_TYPES.clear_intgration_transactions:
          this.transactionPool.clearMeta(this.blockchain.chain[this.
          blockchain.chain.length-1].data[1].length);
          break;}});}
  sendChain(socket) {
    socket.send(JSON.stringify({
      type: MESSAGE_TYPES.chain,
      chain: this.blockchain.chain}));}
  ClearedPayments (socket){
    socket.send(JSON.stringify({
      type: MESSAGE_TYPES.clear_payment_transactions,})); }
  ClearedMeta (socket){
    socket.send(JSON.stringify({
      type: MESSAGE_TYPES.clear_meta_transactions,}));}
  ClearedComp (socket){
    socket.send(JSON.stringify({
      type: MESSAGE_TYPES.clear_comp_transactions,}));}
  ClearedIntegration (socket){
    socket.send(JSON.stringify({
      type: MESSAGE_TYPES.clear_integration_transactions,}));}
  sendPaymentTransaction(socket, paymenttransaction) {
    socket.send(JSON.stringify({
      type: MESSAGE_TYPES.paymenttransaction,
      paymenttransaction}));}
  sendMetaDataTransaction(socket, metaDataTransaction) {
    socket.send(JSON.stringify({ 
      type: MESSAGE_TYPES.metaDataTransaction,
      metaDataTransaction}));}
  sendIntegrationTransaction(socket, integrationTransaction) {
    socket.send(JSON.stringify({ 
      type: MESSAGE_TYPES.integrationTransaction,
      integrationTransaction}));}
  sendCompTransaction(socket, compTransaction) {
    socket.send(JSON.stringify({ 
      type: MESSAGE_TYPES.compTransaction,
      compTransaction}));}
  syncChains() {
    this.sockets.forEach(socket => this.sendChain(socket));}
  broadcastPaymentTransaction(paymenttransaction) {
    this.sockets.forEach(socket => this.sendPaymentTransaction(socket, 
    paymenttransaction));}
  broadcastMetaDataTransaction(metaDataTransaction) {
    this.sockets.forEach(socket => this.sendMetaDataTransaction(socket, 
    metaDataTransaction));}
  broadcastCompTransaction(compTransaction) {
    this.sockets.forEach(socket => this.sendCompTransaction(socket, 
    CompTransaction));}
  broadcastIntegrationTransaction(integrationTransaction) {
    this.sockets.forEach(socket => this.sendIntegrationTransaction(socket,
    integrationTransaction));}
  broadcastClearPaymentTransactions() {
    this.sockets.forEach(socket => this.ClearedCoins(socket));}
  broadcastClearMetadataTransactions() {
    this.sockets.forEach(socket => this.ClearedMeta(socket));}
  broadcastClearCompTransactions() {
      this.sockets.forEach(socket => this.ClearedComp(socket));}
  broadcastClearIntegrationTransactions() {
    this.sockets.forEach(socket => this.ClearedIntegration(socket));}}
module.exports = P2pServer ;