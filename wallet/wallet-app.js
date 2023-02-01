//WALLET
const express = require('express');
const bodyParser = require('body-parser');
const P2pServer = require('../p2p-server');

const N3 = require('n3');

const Wallet = require('./wallet');
const Config = require('../config');
const ChainUtil = require('../chain-util');

const QueryEngine = require('@comunica/query-sparql-rdfjs').QueryEngine;
const Blockchain = require('../blockchain/blockchain');

const {
  DEFAULT_PORT_WALLET_API,
  DEFAULT_PORT_WALLET_CHAIN,
  DEFAULT_PORT_MINER_CHAIN
} = require('../constants');

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
const chainServerPeers = config.get({
  key: "wallet-chain-server-peers",
  default: ["ws://127.0.0.1:" + DEFAULT_PORT_MINER_CHAIN]
});

const blockchain = Blockchain.loadFromDisk(blockchainLocation);

function onChainServerRecv(data) {
  const replaceResult = blockchain.replaceChain(Blockchain.deserialize(data));
  if (!replaceResult.result) {
    console.log(`Failed to replace chain: ${replaceResult.reason}`);
    //failed to replace
    return;
  }

  blockchain.saveToDisk(blockchainLocation);
}

const chainServer = new P2pServer("Chain-server");

chainServer.start(chainServerPort, chainServerPeers, (_) => { }, onChainServerRecv);
const app = express();
app.use(bodyParser.json());

app.listen(apiPort, () => console.log(`Listening on port ${apiPort}`));

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
app.get('/Balance', (req, res) => {
  const balance = blockchain.getBalanceCopy(req.body.publicKey);
  res.json(balance);
});
app.get('/Balances', (req, res) => {
  const balances = blockchain.balances;
  res.json(balances);
});

app.post('/Payment', (req, res) => {
  res.json(wallet.createPayment(
    req.body.rewardAmount,
    req.body.outputs,
    blockchain));
});

app.post('/Integration', (req, res) => {
  res.json(wallet.createIntegration(
    req.body.rewardAmount,
    req.body.outputs,
    blockchain));
});

function extToRdf(triples, sensorId, parentString, obj) {
  for (const key in obj) {
    const value = obj[key];

    const type = typeof value;

    switch (typeof value) {
      case "string":
        triples.push({
          s: sensorId,
          p: parentString + key,
          o: value
        });
        break;
      case "object":
        extToRdf(triples, sensorId, parentString + key + '/', value);
        break;
      default:
        console.log("Unsupported value type: " + type);
        break;
    }
  }
}

const brokerRegistrationValidators = {
  ssnMetadata: ChainUtil.validateIsString,
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  extMetadata: ChainUtil.validateIsObject
};

app.post('/BrokerRegistration', (req, res) => {
  const validateRes = ChainUtil.validateObject(req.body, brokerRegistrationValidators);

  if (!validateRes.result) {
    res.json(validateRes.reason);
    return;
  }

  const brokers = [];
  const triples = [];

  const parser = new N3.Parser();
  parser.parse(
    req.body.ssnMetadata,
    (error, quad, prefixes) => {
      if (error) {
        res.json(error);
        return;
      }
      if (quad) {
        triples.push({
          s: quad.subject.id,
          p: quad.predicate.id,
          o: quad.object.id
        });

        if (quad.predicate.id === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
          && quad.object.id === "SSM/Broker") {
          brokers.push(quad.subject.id);
        }
        return;
      }
      //quad is null, we come here, and we are finished parsing
      if (brokers.length === 0) {
        res.json("Couldn't find a defined broker");
        return;
      } else if (brokers.length > 1) {
        res.json("Found multiple defined brokers");
        return;
      }

      extToRdf(triples, brokers[0], "", req.body.extMetadata);

      try {
        res.json(wallet.createBrokerRegistration(
          triples,
          req.body.rewardAmount,
          blockchain));
      } catch (err) {
        console.log(err);
        res.json(err.message);
      }
    });
});

const sensorRegistrationValidators = {
  ssnMetadata: ChainUtil.validateIsString,
  rewardAmount: ChainUtil.createValidateIsIntegerWithMin(0),
  extMetadata: ChainUtil.validateIsObject
};

app.post('/SensorRegistration', (req, res) => {
  const validateRes = ChainUtil.validateObject(req.body, sensorRegistrationValidators);

  if (!validateRes.result) {
    res.json(validateRes.reason);
    return;
  }

  const sensors = [];
  const triples = [];

  const parser = new N3.Parser();
  parser.parse(
    req.body.ssnMetadata,
    (error, quad, prefixes) => {
      if (error) {
        res.json(error);
        return;
      }
      if (quad) {
        triples.push({
          s: quad.subject.id,
          p: quad.predicate.id,
          o: quad.object.id
        });

        if (quad.predicate.id === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
          && quad.object.id === "http://www.w3.org/ns/sosa/Sensor") {
          sensors.push(quad.subject.id);
        }
        return;
      }
      //quad is null, we come here, and we are finished parsing
      if (sensors.length === 0) {
        res.json("Couldn't find a defined sensor");
        return;
      } else if (sensors.length > 1) {
        res.json("Found multiple defined sensors");
        return;
      }

      extToRdf(triples, sensors[0], "", req.body.extMetadata);

      try {
        res.json(wallet.createSensorRegistration(
          triples,
          req.body.rewardAmount,
          blockchain));
      } catch (err) {
        console.log(err);
        res.json(err.message);
      }
    });
});

const myEngine = new QueryEngine();

app.post('/sparql', (req, res) => {
  const start = async function () {
    try {
      let result = [];
      const bindingsStream = await myEngine.queryBindings(
        req.body.query,
        {
          readOnly: true,
          sources: blockchain.stores
        });
      bindingsStream.on('data', (binding) => {
        result.push(binding);
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