//WALLET
const express = require('express');
const bodyParser = require('body-parser');
const BlockchainProp = require('../network/blockchain-prop');

const N3 = require('n3');

const Wallet = require('./wallet');
const Config = require('../util/config');
const ChainUtil = require('../util/chain-util');

const QueryEngine = require('@comunica/query-sparql-rdfjs').QueryEngine;
const Blockchain = require('../blockchain/blockchain');

const {
  DEFAULT_UI_HTML,
  DEFAULT_UI_JS,
  DEFAULT_DEMO_UI_HTML,
  DEFAULT_DEMO_UI_JS,
  DEFAULT_PORT_WALLET_API,
  DEFAULT_PORT_WALLET_CHAIN,
  DEFAULT_PORT_MINER_CHAIN
} = require('../util/constants');
const SensorRegistration = require('../blockchain/sensor-registration');
const BrokerRegistration = require('../blockchain/broker-registration');

'use strict';

const CONFIGS_STORAGE_LOCATION = "./settings.json";

const config = new Config(CONFIGS_STORAGE_LOCATION);

const wallet = new Wallet(config.get({
  key: "wallet-keypair",
  default: ChainUtil.genKeyPair(),
  transform: ChainUtil.deserializeKeyPair
}));
const apiPort = config.get({
  key: "wallet-api-port",
  default: DEFAULT_PORT_WALLET_API
});
const blockchainLocation = config.get({
  key: "wallet-blockchain-location",
  default: "./wallet_blockchain.json"
});
const chainServerPort = config.get({
  key: "wallet-chain-server-port",
  default: DEFAULT_PORT_WALLET_CHAIN
});
const chainServerPublicAddress = config.get({
  key: "wallet-chain-server-public-address",
  default: "-"
});
const chainServerPeers = config.get({
  key: "wallet-chain-server-peers",
  default: ["ws://127.0.0.1:" + DEFAULT_PORT_MINER_CHAIN]
});
const uiHtmlLocation = config.get({
  key: "wallet-ui-html",
  default: DEFAULT_UI_HTML
});
const uiJsLocation = config.get({
  key: "wallet-ui-js",
  default: DEFAULT_UI_JS
});
const demoUiHtmlLocation = config.get({
  key: "wallet-demo-ui-html",
  default: DEFAULT_DEMO_UI_HTML
});
const demoUiJsLocation = config.get({
  key: "wallet-demo-ui-js",
  default: DEFAULT_DEMO_UI_JS
});

const blockchain = Blockchain.loadFromDisk(blockchainLocation);

const chainServer = new BlockchainProp("Wallet-chain-server", blockchain);

chainServer.start(chainServerPort, chainServerPublicAddress, chainServerPeers);
const app = express();
app.use(bodyParser.json());

app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));

//UI

app.get('/logic.js', (req, res) => {
  res.type('.js').sendFile(uiJsLocation, {
    root:"./"
  });
});

app.get('/ui.html', (req, res) => {
  res.type('.html').sendFile(uiHtmlLocation, {
    root:"./"
  });
});

app.get('/demo-logic.js', (req, res) => {
  res.type('.js').sendFile(demoUiJsLocation, {
    root: "./"
  });
});

app.get('/demo-ui.html', (req, res) => {
  res.type('.html').sendFile(demoUiHtmlLocation, {
    root: "./"
  });
});

app.get('/ChainServer/sockets', (req, res) => {
  res.json(chainServer.sockets);
});
app.post('/ChainServer/connect', (req, res) => {
  chainServer.connect(req.body.url);
  res.json("Connecting");
});

app.get('/public-key', (req, res) => {
  res.json(wallet.publicKey);
});

app.get('/key-pair', (req, res) => {
  res.json(ChainUtil.serializeKeyPair(wallet.keyPair));
});

app.get('/MyBalance', (req, res) => {
  res.json(blockchain.getBalanceCopy(wallet.publicKey));
});
app.get('/chain-length', (req, res) => {
  res.json(blockchain.blocks().length);
});
app.get('/Balance', (req, res) => {
  const balance = blockchain.getBalanceCopy(req.body.publicKey);
  res.json(balance);
});
app.get('/Balances', (req, res) => {
  const balances = blockchain.chain.balances.current;
  res.json(balances);
});
app.get('/Sensors', (req, res) => {
  const returning = {};
  for (const [key, value] of Object.entries(blockchain.chain.sensors.current)) {
    const created = {};
    Object.assign(created, value);
    created.hash = SensorRegistration.hashToSign(created);
    returning[key] = created;
  }
  res.json(returning);
  console.log("/Sensors called");
  console.log(`Returned ${Object.entries(returning).length} sensors`);
});
app.get('/Brokers', (req, res) => {
  const returning = {};
  for (const [key, value] of Object.entries(blockchain.chain.brokers.current)) {
    const created = {};
    Object.assign(created, value);
    created.hash = BrokerRegistration.hashToSign(created);
    returning[key] = created;
  }
  res.json(returning);
});
app.get('/Integrations', (req, res) => {
  res.json(blockchain.chain.integrations.current);
});

app.post('/Payment', (req, res) => {
  console.log(JSON.stringify(req.body));
  const rewardAmount = req.body.rewardAmount;
  const outputs = req.body.outputs;

  const payment = wallet.createPaymentAsTransaction(
    blockchain,
    rewardAmount,
    outputs);

  chainServer.sendTx(payment);

  res.json(payment.transaction);
});

app.post('/Integration', (req, res) => {
  try {
    const integration = wallet.createIntegrationAsTransaction(
      blockchain,
      req.body.rewardAmount,
      req.body.witnessCount,
      req.body.outputs);

    chainServer.sendTx(integration);

    res.json({
      result: true,
      tx: integration.transaction,
      hash: integration.type.hashToSign(integration.transaction)
    });
  } catch (err) {
    console.log(err);
    res.json({
      result: false,
      reason: err.message
    });
  }
});

const brokerRegistrationValidators = {
  brokerName: ChainUtil.validateIsString,
  endpoint: ChainUtil.validateIsString,
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  extraNodeMetadata: ChainUtil.createValidateOptional(
    ChainUtil.validateIsObject),
  extraLiteralMetadata: ChainUtil.createValidateOptional(
    ChainUtil.validateIsObject)
};

app.post('/BrokerRegistration', (req, res) => {
  const validateRes = ChainUtil.validateObject(req.body, brokerRegistrationValidators);

  if (!validateRes.result) {
    res.json(validateRes.reason);
    return;
  }

  try {
    const reg = wallet.createBrokerRegistrationAsTransaction(
      blockchain,
      req.body.rewardAmount,
      req.body.brokerName,
      req.body.endpoint,
      req.body.extraNodeMetadata,
      req.body.extraLiteralMetadata);

    chainServer.sendTx(reg);

    res.json(reg.transaction);
  } catch (err) {
    console.log(err);
    res.json(err.message);
  }
});

const sensorRegistrationValidators = {
  sensorName: ChainUtil.validateIsString,
  costPerMinute: ChainUtil.createValidateIsIntegerWithMin(0),
  costPerKB: ChainUtil.createValidateIsIntegerWithMin(0),
  integrationBroker: ChainUtil.validateIsString,
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  extraNodeMetadata: ChainUtil.createValidateOptional(
    ChainUtil.validateIsObject),
  extraLiteralMetadata: ChainUtil.createValidateOptional(
    ChainUtil.validateIsObject)
};

app.post('/SensorRegistration', (req, res) => {
  const validateRes = ChainUtil.validateObject(req.body, sensorRegistrationValidators);

  if (!validateRes.result) {
    res.json({
      result: false,
      reason: validateRes.reason
    });
    return;
  }

  try {
    const reg = wallet.createSensorRegistrationAsTransaction(
      blockchain,
      req.body.rewardAmount,
      req.body.sensorName,
      req.body.costPerMinute,
      req.body.costPerKB,
      req.body.integrationBroker,
      req.body.extraNodeMetadata,
      req.body.extraLiteralMetadata);

    chainServer.sendTx(reg);

    res.json({
      result: true,
      tx: reg.transaction
    });
  } catch (err) {
    console.log(err);
    res.json({
      result: false,
      reason: err.message
    });
  }
});

const myEngine = new QueryEngine();

app.post('/sparql', (req, res) => {

  if (!("query" in req.body)) {
    res.json({
      result: false,
      reason:"No query supplied"});
    return;
  }
  const start = async function () {
    try {
      const result = [];
      const bindingsStream = await myEngine.queryBindings(
        req.body.query,
        {
          readOnly: true,
          sources: [blockchain.rdfSource()]
        });
      bindingsStream.on('data', (binding) => {
        result.push(binding.entries);
      });
      bindingsStream.on('end', () => {
        res.json({
          result: true,
          values: result
        });
      });
      bindingsStream.on('error', (err) => {
        res.json({
          result: false,
          reason: err
        });
      });
    } catch (err) {
      console.error("Exception!");
      console.error(err);
      res.json({
        result: false,
        reason: err.message
      });
    }
  };

  start();
});