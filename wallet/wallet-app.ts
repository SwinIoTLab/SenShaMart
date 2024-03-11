//WALLET
import express from 'express';
import bodyParser from 'body-parser';
import { PropServer as BlockchainProp, type Provider as WsProvider } from '../network/blockchain-prop.js';

import Wallet from './wallet.js';
import Config from '../util/config.js';
import { ChainUtil, isFailure } from '../util/chain-util.js';

import Blockchain from '../blockchain/blockchain.js';
import { Persistence, type Underlying as UnderlyingPersistence } from '../blockchain/persistence.js';
import fs from 'fs';
import ws from 'ws';

import {
  DEFAULT_UI_HTML,
  DEFAULT_UI_JS,
  DEFAULT_DEMO_UI_HTML,
  DEFAULT_DEMO_UI_JS,
  DEFAULT_PROVIDER_UI_HTML,
  DEFAULT_PROVIDER_UI_JS,
  DEFAULT_BROKER_UI_HTML,
  DEFAULT_BROKER_UI_JS,
  DEFAULT_APPLICATION_UI_HTML,
  DEFAULT_APPLICATION_UI_JS,
  DEFAULT_PORT_WALLET_API,
  DEFAULT_PORT_WALLET_CHAIN,
  DEFAULT_PORT_MINER_CHAIN
} from '../util/constants.js';
import SensorRegistration from '../blockchain/sensor-registration.js';
import BrokerRegistration from '../blockchain/broker-registration.js';
import Integration from '../blockchain/integration.js';

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
const persistencePrefix = config.get({
  key: "wallet-persistence-prefix",
  default: "./wallet_blockchain/"
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
const providerUiHtmlLocation = config.get({
  key: "wallet-provider-ui-html",
  default: DEFAULT_PROVIDER_UI_HTML
});
const providerUiJsLocation = config.get({
  key: "wallet-provider-ui-js",
  default: DEFAULT_PROVIDER_UI_JS
});
const brokerUiHtmlLocation = config.get({
  key: "wallet-broker-ui-html",
  default: DEFAULT_BROKER_UI_HTML
});
const brokerUiJsLocation = config.get({
  key: "wallet-broker-ui-js",
  default: DEFAULT_BROKER_UI_JS
});
const applicationUiHtmlLocation = config.get({
  key: "wallet-application-ui-html",
  default: DEFAULT_APPLICATION_UI_HTML
});
const applicationUiJsLocation = config.get({
  key: "wallet-application-ui-js",
  default: DEFAULT_APPLICATION_UI_JS
});

let blockchain: null | Blockchain = null;
let chainServer: null | BlockchainProp = null;
const app = express();

app.use(bodyParser.json());

app.use(function (_req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Method', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});


app.get('/logic.js', (_req, res) => {
  res.type('.js').sendFile(uiJsLocation, {
    root: "./"
  });
});
app.get('/ui.html', (_req, res) => {
  res.type('.html').sendFile(uiHtmlLocation, {
    root: "./"
  });
});

app.get('/demo-logic.js', (_req, res) => {
  res.type('.js').sendFile(demoUiJsLocation, {
    root: "./"
  });
});
app.get('/demo-ui.html', (_req, res) => {
  res.type('.html').sendFile(demoUiHtmlLocation, {
    root: "./"
  });
});

app.get('/provider.js', (_req, res) => {
  res.type('.js').sendFile(providerUiJsLocation, {
    root: "./"
  });
});
app.get('/provider.html', (_req, res) => {
  res.type('.html').sendFile(providerUiHtmlLocation, {
    root: "./"
  });
});

app.get('/broker.js', (_req, res) => {
  res.type('.js').sendFile(brokerUiJsLocation, {
    root: "./"
  });
});
app.get('/broker.html', (_req, res) => {
  res.type('.html').sendFile(brokerUiHtmlLocation, {
    root: "./"
  });
});

app.get('/application.js', (_req, res) => {
  res.type('.js').sendFile(applicationUiJsLocation, {
    root: "./"
  });
});
app.get('/application.html', (_req, res) => {
  res.type('.html').sendFile(applicationUiHtmlLocation, {
    root: "./"
  });
});


app.post('/ChainServer/connect', (req, res) => {
  chainServer.connect(req.body.url);
  res.json("Connecting");
});

app.get('/gen-key', (_req, res) => {
  res.json(ChainUtil.serializeKeyPair(ChainUtil.genKeyPair()));
});

app.get('/public-key', (_req, res) => {
  res.json(wallet.publicKey);
});

app.get('/key-pair', (_req, res) => {
  res.json(ChainUtil.serializeKeyPair(wallet.keyPair));
});

app.get('/MyBalance', (_req, res) => {
  res.json(blockchain.getBalanceCopy(wallet.publicKey));
});
app.get('/chain-length', (_req, res) => {
  res.json(blockchain.length());
});
app.get('/Balance', (req, res) => {
  const balance = blockchain.getBalanceCopy(req.body.publicKey);
  res.json(balance);
});
app.get('/Balances', (_req, res) => {
  const returning: { [index: string]: number } = {};
  for (const [key, amount] of blockchain.data.BALANCE) {
    returning[key] = amount;
  }
  res.json(returning);
});
app.get('/Sensors', (_req, res) => {
  const returning: {
    [index: string]: { [index: string]: unknown }
  } = {};
  for (const [key, value] of Object.entries(blockchain.data.SENSOR)) {
    returning[key] = Object.assign({}, value);
    returning[key].hash = SensorRegistration.hashToSign(value);
  }
  res.json(returning);
  console.log("/Sensors called");
  console.log(`Returned ${Object.entries(returning).length} sensors`);
});
app.get('/Brokers', (_req, res) => {
  const returning: {
    [index: string]: { [index: string]: unknown }
  } = {};
  for (const [key, value] of Object.entries(blockchain.data.BROKER)) {
    returning[key] = Object.assign({}, value);
    returning[key].hash = BrokerRegistration.hashToSign(value);
  }
  res.json(returning);
});
app.get('/Integrations', (_req, res) => {
  const returning: { [index: string]: Integration } = {};
  for (const [key, integration] of blockchain.data.INTEGRATION) {
    returning[key] = integration;
  }
  res.json(returning);
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

  res.json(payment.tx);
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
      tx: integration.tx,
      hash: integration.type.hashToSign(integration.tx)
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

  if (isFailure(validateRes)) {
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

    res.json(reg.tx);
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

  if (isFailure(validateRes)) {
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
      tx: reg.tx
    });
  } catch (err) {
    console.log(err);
    res.json({
      result: false,
      reason: err.message
    });
  }
});

const persistence = new Persistence(persistencePrefix, (err) => {
  if (err) {
    console.log(`Couldn't load persistence: ${err}`);
    return;
  }
  blockchain = new Blockchain(persistence, null, (err) => {
    if (err) {
      console.log(`Couldn't load blockchain: ${err}`);
      return;
    }
    chainServer = new BlockchainProp("Wallet-chain-server", blockchain, ws as unknown as WsProvider);
    chainServer.start(chainServerPort, chainServerPublicAddress, chainServerPeers); 

    app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));
  });
}, fs as UnderlyingPersistence);

