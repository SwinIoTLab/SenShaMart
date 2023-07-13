/**
 * npm run dev
 * HTTP_PORT=3002 P2P_PORT=5002 MQTT_PORT=1884 PEERS=ws://localhost:5001 npm run dev
 * HTTP_PORT=3003 P2P_PORT=5003 MQTT_PORT=1885 PEERS=ws://localhost:5001,ws://localhost:5002 npm run dev
 * HTTP_PORT=3004 P2P_PORT=5004 MQTT_PORT=1886 PEERS=ws://localhost:5001,ws://localhost:5002,ws://localhost:5003 npm run dev
 * HTTP_PORT=3005 P2P_PORT=5005 MQTT_PORT=1887 PEERS=ws://localhost:5001,ws://localhost:5002,ws://localhost:5003,ws://localhost:5004  npm run dev
 */

/**
 * npm run dev                                                                                                          //node1
 * HTTP_PORT=3002 P2P_PORT=5002 MQTT_PORT=1884 PEERS=ws://45.113.235.182:5001 npm run dev                                           //node2
 * HTTP_PORT=3003 P2P_PORT=5003 MQTT_PORT=1885 PEERS=ws://45.113.235.182:5001,ws://45.113.234.151:5002 npm run dev                  //node3
 * HTTP_PORT=3004 P2P_PORT=5004 MQTT_PORT=1886 PEERS=ws://IP:5001,ws://IP:5002,ws://IP:5003 npm run dev                 //node4
 * HTTP_PORT=3005 P2P_PORT=5005 MQTT_PORT=1887 PEERS=ws://IP:5001,ws://IP:5002,ws://IP:5003,ws://IP:5004  npm run dev   //node5
 */

/**
 * for monitoring the memory and cpu as well as run node in the background use the following, 
 * note: the second section of the instruction is to change the heap memory
 * pm2 start app/index.js --node-args="--max_old_space_size=8192"
 * HTTP_PORT=3002 P2P_PORT=5002 MQTT_PORT=1884 PEERS=ws://45.113.235.182:5001 pm2 start app/index.js --node-args="--max_old_space_size=8192"
 * HTTP_PORT=3003 P2P_PORT=5003 MQTT_PORT=1885 PEERS=ws://45.113.235.182:5001,ws://45.113.234.151:5002 pm2 start app/index.js --node-args="--max_old_space_size=8192"
 * HTTP_PORT=3004 P2P_PORT=5004 MQTT_PORT=1886 PEERS=ws://IP:5001,ws://IP:5002,ws://IP:5003 pm2 start app/index.js --node-args="--max_old_space_size=8192"
 * HTTP_PORT=3005 P2P_PORT=5005 MQTT_PORT=1887 PEERS=ws://IP:5001,ws://IP:5002,ws://IP:5003,ws://IP:5004 pm2 start app/index.js --node-args="--max_old_space_size=8192"
 * use 
 * $ pm2 monit
 * to monitor the node
 * 
 */

const express = require('express');
const bodyParser = require('body-parser');
const BlockchainProp = require('../network/blockchain-prop');
const QueryEngine = require('@comunica/query-sparql-rdfjs').QueryEngine;
const Blockchain = require('../blockchain/blockchain');
const Miner = require('./miner');
'use strict';/* "use strict" is to indicate that the code should be executed in "strict mode".
              With strict mode, you can not, for example, use undeclared variables.*/

const Config = require('../util/config');

const Payment = require('../blockchain/payment');
const Integration = require('../blockchain/integration');
const SensorRegistration = require('../blockchain/sensor-registration');
const BrokerRegistration = require('../blockchain/broker-registration');
const Transaction = require('../blockchain/transaction');

const {
  DEFAULT_PORT_MINER_API,
  DEFAULT_PORT_MINER_CHAIN,
} = require('../util/constants');

const CONFIGS_STORAGE_LOCATION = "./settings.json";

const config = new Config(CONFIGS_STORAGE_LOCATION);

const minerPublicKey = config.get({
  key: "miner-public-key",
  default: ""
});
const blockchainLocation = config.get({
  key: "miner-blockchain-location",
  default: "./miner_blockchain.json"
});
const chainServerPort = config.get({
  key: "miner-chain-server-port",
  default: DEFAULT_PORT_MINER_CHAIN
});
const chainServerPeers = config.get({
  key: "miner-chain-server-peers",
  default: []
});
const minerPublicAddress = config.get({
  key: "miner-public-address",
  default: "-"
});
const apiPort = config.get({
  key: "miner-api-port",
  default: DEFAULT_PORT_MINER_API
});

const blockchain = Blockchain.loadFromDisk(blockchainLocation);


const miner = new Miner(blockchain, minerPublicKey);

const newTxCb = function (tx) {
  console.log("new tx through cb");
  miner.addTransaction(tx);
};

const chainServer = new BlockchainProp("Chain-server", blockchain, newTxCb);
chainServer.start(chainServerPort, minerPublicAddress, chainServerPeers);

const app = express();
const myEngine = new QueryEngine();

app.use(bodyParser.json());

// initialising the HTTP PORT to listen 
app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));

//aedes mqtt server intialization
//const MQTTport = process.env.MQTT_PORT || 1882;
//MQTTserver.listen(MQTTport, function () {
//	console.log('MQTTserver listening on port', MQTTport)
//})

app.use(bodyParser.json());

// GET APIs
app.get('/blocks', (req, res) => {
  res.json(blockchain.chain);
});
///////////////
app.get('/Transactions', (req, res) => {
  res.json(miner.txs);
});
app.get('/public-key', (req, res) => {
  res.json(minerPublicKey); 
});
///////////////
app.get('/MinerBalance', (req, res) => {
  const balance = blockchain.getBalanceCopy(minerPublicKey);
  res.json(balance);
});
app.get('/Balance', (req, res) => {
  const balance = blockchain.getBalanceCopy(req.body.publicKey);
  res.json(balance);
});
app.get('/Balances', (req, res) => {
  const balances = blockchain.balances;
  res.json(balances);
});

///////////////
//this API prints all the quads stored in the RDF store and returns the entire store
app.get('/quads', (req, res) => {
  //for (const quad of store)
  //console.log(quad);
  res.json(blockchain.stores);
});

app.get('/brokers', (req, res) => {
  res.json(blockchain.brokers);
});

app.get('/sensors', (req, res) => {
  res.json(blockchain.sensors);
});


app.get('/ChainServer/sockets', (req, res) => {
  res.json(chainServer.sockets);
});
app.post('/ChainServer/connect', (req, res) => {
  chainServer.connect(req.body.url);
  res.json("Connecting");
});

function newTransaction(res, body, type) {
  const verifyRes = type.verify(body);
  if (!verifyRes.result) {
    res.json(`Failed to verify ${type.name}: ${verifyRes.reason}`);
    return;
  }

  miner.addTransaction(new Transaction(body, type));
  res.json("Added to pool");
}

app.post('/Payment', (req, res) => {
  newTransaction(res, req.body, Payment);
});

app.post('/Integration', (req, res) => {
  newTransaction(res, req.body, Integration);
});

app.post('/BrokerRegistration', (req, res) => {
  newTransaction(res, req.body, BrokerRegistration);
});

app.post('/SensorRegistration', (req, res) => {
  newTransaction(res, req.body, SensorRegistration);
});

/////////////////////
//Start of comunica sparql query code
app.post('/sparql', (req, res) => {
  const start = async function () {
    try {
      let result = [];
      const bindingsStream = await myEngine.queryBindings(
        req.body.query,
        {
          readOnly: true,
          sources: [blockchain.rdfSource()]
        });
      bindingsStream.on('data', (binding) => {
        const pushing = {};
        for (const [key, value] of binding) {
          pushing[key.value] = value.value;
        }
        result.push(pushing);
      });
      bindingsStream.on('end', () => {
        res.json(JSON.stringify(result));
      });
      bindingsStream.on('error', (err) => {
        console.error(err);
      });
    } catch (err) {
      console.error(err);
      res.json("Error occured while querying");
    }
  };

  start()

});
