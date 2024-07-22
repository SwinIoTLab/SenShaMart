# Instaling, configuring, and Running SenShaMart
There are two ways to use SenShaMart software. The first one is to create your own network. The second one is to join our established network.

## Installation
To install SenShaMart, node and npm are required. Node can be installed from the [node.js website](https://nodejs.org/en) or by following the [detailed instructions](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).

An `npm install` should find and install all base dependencies.
A typescript compile is then required to transpile the typescript to javascript.
This can be done with `tsc` or `npx tsc`(for mac users) from the repository directory.

### Compilation errors are expected in the ui/ folder.           

- 4 errors in ui/application.ts
- 2 errors in ui/broker.ts
- 4 errors in ui/provider.ts
- 1 error in ui/public-wallet.ts:14

Please ignore these errors, we are working on fixing them.

## Essential Configuration
The default configuration dosenot include a keypair. Therefore, there is a need to create a keypair and update `settings.json`. To do that, you need to:

1- Use the keygen.js tool to creat a keypair by using this command `node tool/keygen.js`.
2- copy the output keypair and paste it in `settings.json`. More spesific, under the
    - `broker-app`
       - `broker-keypair`


## Running
There are two methods to run SenShaMart. the first method is to create your own infrustructure and network. The second method is to join our established network. 


### Run your own Infrustrcute and Network
The following comand is used to run a SenShaAmrt node on your computer. 

```

node miner/miner-app.js > miner.out &
node public__wallet/public-wallet-app.js > wallet.out &
node broker/broker-app.js > broker.out &

```

Now, your computer is running all the required applications for SenShaMart which are: 
1- Miner app to mine blocks and process sensor registration transactions and payment transactions.
2- Broker app to help fetching data from IoT sensors and forward them to Sensor clients.
3- Public Wallet app to allow submitting transactions and running the User Interface. You can open the UI by going to `http://127.0.0.1:7001/wallet.html` in your web browser.

You can now run multiple SenShaMart nodes to creat a network.

### Run and connect to our testing network
Runing SenShaMart to connect to our testing network gives you the flexibility to run the apps you need only. For example, you don't have to run the Miner app and Broker app as we have already nodes that running them. However, you still able to run them and contribute to our network.
#### Running Apps Individually

- `Broker app`

  This is located at `broker/broker-app.js`. This application acts as a broker.

  You can run it by `node broker/broker-app.js`

- `Miner app`

  This is located at `miner/miner-app.js`. This application acts as a miner.

  You can run it by `node miner/miner-app.js`

- `public-wallet-app`
  
  This is located at `public__wallet/public-wallet-app.js`.

  You can run it by `node public__wallet/public-wallet-app.js`
  This application acts as a wallet.
  It exposes a html based UI at /wallet.html.
  If the public-wallet-app is running on your local computer, and using the default API port of 7001, you can open the UI by going to `http://127.0.0.1:7001/wallet.html` in your favourite web browser.



#### Connect to our Testing Network

We have nodes running on the ARDC Nectar Research Cloud.
You can connect your nodes to our network by setting their `chain-server-peers` to one (or all) of the following miners:

```
[
  "ws://136.186.108.192:3002",
  "ws://136.186.108.83:3002"
]
```

Our replication algorithm is currently limited to half of the blocks that are in memory. 
We only store an expected 7 days worth of blocks in memory at a time.
This can be changed by changing the MAX_BLOCKS_IN_MEMORY constant in blockchain/blockchain.ts.

We want to change our replication algorithm and implementation (currently in network/blockchain-prop.ts) to be RPC based using something like grpc.
This is an item of future work.


## Enabling SPARQL support (Using Fuseki)

A fuseki instance may be optionally linked to any of the apps.
If a fuseki instance is not linked, the app will still run, but without SPARQL query support.
This SPARQL query support is most important for the public wallet app, as the integration flow uses SPARQL to query for sensors.

If you want to support SPARQL queries, an Apache Fuseki instance must be available and configured. 
Installation instructions can be found at [Apache Jena Fuseki](https://jena.apache.org/documentation/fuseki2/).

We will summarise the main points here:

- Apache Jena Fuseki requires Java 17 or later
- [Download Apache Jena Fuseki with ui](https://jena.apache.org/documentation/fuseki2/#download-fuseki-with-ui).
  We tested with [5.0.0-rc1](https://repo1.maven.org/maven2/org/apache/jena/jena-fuseki-server/5.0.0-rc1/jena-fuseki-server-5.0.0-rc1.jar)
- Run the server with `java -jar jena-fuseki-server-5.0.0-rc1.jar [--loc=DIR] [[--update] /NAME]` or `java -jar jena-fuseki-server-5.0.0-rc1.jar --mem /NAME`.
  `/NAME` is the name of the database created, `DIR` is the location where the data will be persisted, `--update` allows updates.
  
  e.g. `java -jar jena-fuseki-server-5.0.0-rc1.jar --mem /public-wallet-app` is what is what we use during testing, as it creates an in-memory database that is lost on restart.
  `java -jar jena-fuseki-server-5.0.0-rc1.jar --update /public-wallet-app` creates a persistent version of the database that allows updates.
  **Updates are required as we write triples for each block**.

### Linking an app to a fuseki instance

To tell an app to use a fuseki instance, set its `fuseki` setting in its settings.json file to point to the fuseki service.
e.g. `"public-wallet-fuseki": "http://127.0.0.1:3030/public-wallet-app"`. 
This is the `/public-wallet-app` database on the default fuseki port on the local machine.

## Other Configuration

Each of these apps gets their configuration from a `./settings.json` file in the working directory.

This settings file is a json file, containing a key-value list of the settings to be used. 
Each setting is prefixed by the application that uses it, allowing multiple different applications to share the same settings.json.
For example, the `blockchain` setting is `public-wallet-blockchain` in `public-wallet-app`, `broker-blockchain` in `broker-app`, and `miner-blockchain` in `miner-app`.

- `broker-app`
  - `broker-keypair`

    This is the keypair of the owner of this broker. It is used to sign completed transactions.

    No default. The app will fail to start without this.
  - `broker-name`

    This is the name of this broker. It is used to find out which integrations it should be brokering or witnessing.

    Default: The public key of the keypair serialized as a string.
  - `broker-fuseki`

    This is the URI of a fuseki instance to use. How, and why to use it is explained in the later section 'Install Fuseki / Enabling SPARQL support'

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

    This is the URI of a fuseki instance to use. How, and why to use it is explained in the later section 'Install Fuseki / Enabling SPARQL support'

    Default: null
  - `miner-chain-server-port`

    This is the port on which the app listens to for people willing to share their blockchains

    Default: 3002
  - `miner-chain-server-peers`
  
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

    This is the URI of a fuseki instance to use. How, and why to use it is explained in the later section 'Install Fuseki / Enabling SPARQL support'

    Default: null
  - `public-wallet-chain-server-peers`

    These are the URIs the broker will attempt to connect to on startup to share and recieve new copies of the blockchain.

    Default: `["ws://127.0.0.1:3002"]`. Port 3002 is the default miner chain-server-port
  - `wallet-ui-base`

    This is the directory in which to find javascript and html files that are served for the UI.

    Default: `./ui/`



## Tools

We also provide some tools to help with some administrative actions. These are found in tools

- regenerate_fuseki.js

  This takes an existing persisted blockchain, and writes all its RDF triples into the specified Fuseki Instance.
  This is useful for when you need to recreate the Fuseki database.

- gen_blockchain.js

  This generates a new blockchain at `./test_blockchain.db` of the specified depth for use in testing

- clean_fuseki.js

  This deletes all RDF triples and data stores from a fuseki instance.
  This can be used to fully remove a dataset from fuseki, so that you can then regenerate a new blockchain into it for testing.

- dummy_sensor.js

  This sends timestamps to the specified MQTT broker and topic.
  It can be used to simulate a sensor.

- dummy_consumer.js

  This connects to the specific MQTT broker and topic and prints recieved messsages to the console.
  It can be used to simulate a consumer.

- keygen.js

  This generates a new keypair, and outputs it to the console.
  It can be used to generate new keypairs without having to run a wallet.

- blockchain_sharer.js

  This can be used to share a copy of the chain. 
  It makes a copy of the active chain every hour, and this copied chain can be downloaded through `/blockchain.db`.
  It is used to work around limitations in our current propogation protocol.


## Work around

If two nodes diverge by more than MAX_BLOCKS_IN_MEMORY / 2 blocks, the best way to reconcile them is to:
- stop the node with the smallest chain
- copy the longest chain to the other node and rename it if necessary
- clean the fuseki database and remake the dataset if necessary
- regenerate the fuseki dataset if necessary
- start the stopped node again

We provide a blockchain sharer node running at http://136.186.108.19:6002/blockchain.db to download a copy of the blockchain made hourly.
