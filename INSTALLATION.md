# Base Installation

## To run the base applications, node, and npm are required.

Node can be installed from the [node.js website](https://nodejs.org/en) or by following the [detailed instructions](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).

An `npm install` should find and install all base dependencies.
A typescript compile is then required to transpile the typescript to javascript.
This can be done with `tsc` or `npx tsc` from the repository directory.

### Compilation errors are expected in the ui/ folder.**

- 4 errors in ui/application.ts
- 2 errors in ui/broker.ts
- 4 errors in ui/provider.ts
- 1 error in ui/public-wallet.ts:14

We are working on fixing these errors.

### Results

You will then be left with 3 apps and multiple tools.

## Apps

The 3 apps are

- `broker-app`

  This is located at `broker/broker-app.js`. This application acts as a broker.

- `miner-app`

  This is located at `miner/miner-app.js`. This application acts as a miner.

- `public-wallet-app`
  
  This is located at `public__wallet/public-wallet-app.js`. This application acts as a wallet.

### Configuration

Each of these apps gets their configuration from a `./settings.json` file in the working directory.

This settings file is a json file, containing a key-value list of the settings to be used. 
Each setting is prefixed by the application that uses it, allowing multiple different applications to share the same settings.json.
For example, the `blockchain` setting is `public-wallet-blockchain` in `public-wallet-app`, `broker-blockchain` in `broker-app`, and `miner-blockchain` in `miner-app`.

- `broker-app`
  - `broker-keypair`

    This is the keypair of the owner of this broker. It is used to sign witnessed transactions when the broker believes an integration it is witnessing completed.

    No default. The app will fail to start without this.
  - `broker-name`

    This is the name of this broker. It is used to find out which integrations it should be brokering or witnessing.

    Default: The public key of the keypair serialized as a string.
  - `broker-fuseki`

    This is the URI of a fuseki instance to use.

    Default: null
  - `broker-api-port`

    This is the port the broker will expose it's user facing API to.

    Default: 5001
  - `broker-blockchain`

    This is where the app will persist blockchain information.

    Default: ./broker_blockchain.db
  - `broker-chain-server-port`

    This is the port on which the app listens to for people willing to share their blockchains

    Default: 5002
  - `broker-chain-server-peers`

    These are the URIs the broker will attempt to connect to on startup to share and recieve new copies of the blockchain.

    Default: `["ws://127.0.0.1:3002"]`. Port 3002 is the default miner chain-server-port
  - `broker-MQTT-port`

    This is the port the broker listens on for MQTT connections

    Default: 5003

- `miner-app`
  - `miner-public-key`

    This is the public key that will be rewarded for blocks mined by this miner

    Default: ""
  - `miner-blockchain`

    This is where the app will persist blockchain information.

    Default: ./miner_blockchain.db
  - `miner-fuseki`

    This is the URI of a fuseki instance to use.

    Default: null
  - `miner-chain-server-port`

    This is the port on which the app listens to for people willing to share their blockchains

    Default: 3002
  -  `miner-chain-server-peers`

    These are the URIs the broker will attempt to connect to on startup to share and recieve new copies of the blockchain.

    Default: `[]`.
  - `miner-api-port`
  
    This is the port the miner will expose it's user facing API to.

    Default: 3001

- `public-wallet-app`
  - `public-wallet-api-port`
  
    This is the port the public wallet will expose it's user facing API to.

    Default: 7001

  - `public-wallet-blockchain`

    This is where the app will persist blockchain information.

    Default: ./public_wallet_blockchain.db
  - `public-wallet-chain-server-port`

    This is the port on which the app listens to for people willing to share their blockchains

    Default: 7002
  - `public-wallet-fuseki`

    This is the URI of a fuseki instance to use.

    Default: null
  - `public-wallet-chain-server-peers`

    These are the URIs the broker will attempt to connect to on startup to share and recieve new copies of the blockchain.

    Default: `["ws://127.0.0.1:3002"]`. Port 3002 is the default miner chain-server-port
  - `wallet-ui-base`

    This is the directory in which to find javascript and html files that are served for the UI.

    Default: `./ui/`

### Recommended Configuration

We recommend the following settings be configured for the following apps:

- `broker-app`
  - `broker-keypair`

    This is required for the brokers functionality
  - `broker-name`

    This is required so that the app knows which broker it is.
  - `broker-chain-server-peers`
  
    This is recommended so that your broker can engage in the propogation of the blockchain.
- `miner-app`
  - `miner-public-key`
    
    This is recommended so that you can be compensated for the blocks the miner mines.
  - `miner-chain-server-peers`

    This is recommended so that your broker can engage in the propogation of the blockchain.
- `public-wallet-app`
  - `public-wallet-chain-server-peers`

    This is recommended so that your broker can engage in the propogation of the blockchain.

### Running

To run an app (for example a miner):

0. Make sure you've compiled them with typescript through calling `tsc`
1. Set the correct settings in the settings.json.
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
  It can be used to simulate a consumer.

- keygen

  This generates a new keypair, and outputs it to the console.
  It can be used to generate new keypairs without having to run a wallet.

## Install Fuseki / Enabling SPARQL support

A fuseki instance may be optionally linked to any of the apps.
If a fuseki instance is not linked, the app will run, but without SPARQL query support.

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