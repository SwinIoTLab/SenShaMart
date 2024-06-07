# Base Installation

## To run the base applications, node, and npm are required.

An npm install should find and install all base dependencies.
A typescript compile is then required to transpile the typescript to javascript.
This can be done with tsc from the repository directory.

You will then be left with 3 apps and 3 tools.

### Fuseki

A fuseki instance may be optionally linked to any of the apps.
If a fuseki instance is not linked, the app will run, but without SPARQL query support.
Fuseki installation and linking an app to it will be covered later in this document.

## Apps

The 3 apps are

- broker/broker-app.js
- miner/miner-app.js
- public-wallet/public-wallet-app.js

Each of these apps gets their configuration from a ./settings.json file in the working directory.

This settings file is a json file, containing a key-value list of the settings to be used. 
Each setting is prefixed by the application that uses it, allowing multiple different applications to share the same settings.json.
For example, the `blockchain` setting is `public-wallet-blockchain` in `public-wallet-app`, `broker-blockchain` in `broker-app`, and `miner-blockchain` in `miner-app`.

The settings and their default values can be found just after the imports in each of the respective app typescript files. 
We list some important ones below:

- blockchain
  This is the location of the blockchain for the particular app.

  Default: `./public_wallet_blockchain.db`, `./broker_blockchain.db`, `./miner_blockchain.db` in their respective apps_
- fuseki
  This is the location of the fuseki instance to use to store RDF triples, and for SPARQL querying.
  This is an optional setting.

  Default: `null`
- chain-server-peers
  This is an array of URIs that the app will try to connect to and exchange blockchain information with.

  Default: `["ws://127.0.0.1:3002"]` This is the default miner port.
- chain-server-port
  This is the port on which the app will listen to chain-server-peers
  Default: Depends on app, check `util/constants.ts`

### Running

To run an app (for example a miner):

0. Make sure you've compiled them with typescript through calling `tsc`
1. Set the correct settings in the settings.json. The miner and the broker require keys so they can identify themselves.
2. Run the app using node (e.g. `node miner/miner-app.js`)

## Tools

We also provide some tools to help with some administrative actions. These are found in tools

- regenerate_fuseki

  This takes an existing persisted blockchain, and writes all its RDF triples into the specified Fuseki Instance.
  This is useful for when you need to recreate the Fuseki database.

- gen_blockchain

  This generates a new blockchain at `./test_blockchain.db` of the specified depth for use in testing

- clean_fuseki

  This deletes all RDF triples and data stores from a fuseki instance.
  This can be used to fully remove a dataset from fuseki, so that you can then regenerate a new blockchain into it for testing.

- dummy_sensor

  This sends timestamps to the specified MQTT broker and topic.
  It can be used to simulate a sensor.

- dummy_consumer

  This connects to the specific MQTT broker and topic and prints recieved messsages to the console.
  It can be used to simulate a consumer._

## Install Fuseki

If you want to support SPARQL queries, an Apache Fuseki instance must be available and configured. 
Installation instructions can be found at [Apache Jena Fuseki](https://jena.apache.org/documentation/fuseki2/).

We will summarise the main points here:

- Apache Jena Fuseki requires Java 17 or later
- [Download Apache Jena Fuseki](https://jena.apache.org/documentation/fuseki2/#download-fuseki-with-ui)
- Unpack the archive into a folder
- Run the server with `fuseki-server [--loc=DIR] [[--update] /NAME]` or `fuseki-server --mem /NAME`
  
  e.g. `fuseki-server --mem /public-wallet-app` is what is what we use during testing, as it creates an in-memory database that is lost on restart.
  `fuseki-server --update /public-wallet-app` creates a persistent version of the database that allows updates.
  Updates are required as we write triples for each block.

### Linking an app to a fuseki instance

To tell an app to use a fuseki instance, set its `fuseki` option to point to the fuseki service.
e.g. `"public-wallet-fuseki": "http://127.0.0.1:3030/public-wallet-app"`