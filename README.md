# Senshamart
Senshamart is software to create a blockchain based Internet-of-Things (IoT) distributed system to share, search for, and pay for sensor data.

## System Components

A deployed Senshamart System comprises of 5 components


### Sensor

Sensors create the sensor data that is to be shared, searched for and paid for.


### Miner
  
Miners mine blocks onto the senshamart chain.


### Wallets
  
Wallets belong to users of the system. They create, sign, and propagate new transactions to miners who then mine them into the chain.


### IoT Applications
  
Iot Applications are the consumers of sensor data.


### Brokers
  
Brokers act as proxies for sensor data and sit inbetween sensors and IoT applications. 

Brokers act as access control for the sensors data, only allowing IoT applications owned by users with valid integration transactions to access the appropriate sensor data. Some sensors are lightweight and cannot support the computational and storage requirements of managing the chain, and so the broker handles the chain management for them.
Random subsets of brokers can also act as witnesses of integrations.
These witnessing brokers can then vote on whether the integration completed successfully, or vote to refund the user if they believe the sensor misbehaved in some way.

## Transaction Types

### Payment
  This transaction moves coins from one wallet to another

### Broker Registration
  This transaction registers a broker into the system

### Sensor Registration
  This transaction registers a sensor into the system

### Integration
  This transaction pays for sensor data

### Commit
  This transaction is a witness voting that an integration has completed successfully

### Compensation
  This transaction is a witness voting that an integration has completed but the sensor misbehaved and the buyer should be compensated

## Repository Structure

The repository is split into multiple parts

- blockchain/

  This is where the logic for manging the blockchain is stored.
  The blockchain logic is in blockchain.ts, and the blocks are in block.ts.
  Each type of transaction has its own source file.
  Utility types and constant strings are stored in transaction_base, transaction_wrapper, and uris.

- broker/

  This is where the logic for the broker is.
  All logic for the broker is contained inside broker-app
Most of the applications are split into two parts when appropriate.
A library file, and an -app file that drives the library

- miner/

  This is where the logic for the miner is.
  The logic to control the mining is in miner.ts. The application that uses this logic is miner-app

- wallet/

  This is where the logic for a personal UI is.
  The logic to create and sign the transactions is in wallet. The application that uses this logic is in wallet-app

- public_wallet/

  This is where the logic for a public UI is. This UI isn't safe for actual use, and is for demo purposes. A user must enter their private key into the UI.
  The logic to create and sign the transactions is in public-wallet. The application that uses this logic is in public-wallet-app

- ui/

  The html and js files for the frontend of the UI are in here. Each page is split into a html and JS file. These are used by wallet and public_wallet
  
- network/

  This is where the P2P logic is. It handles distributing unsigned transactions, and signed blocks

- util/

  This where shared utility logic such as validation of data and reading settings is.

## Configuration

System components are configured via a settings file.
All setings have defaults in /util/constants.ts.
The settings themselves are listed at the top of every -app file, along with what their default settings is.
The default settings file is 'settings.json'.
Each application's settings is prefixed by which application it belongs to, allowing all settings to coexist in the same file.

### Common configuration

- miner-public-key

    The public key that the miner will give the block mining reward to
    
- wallet-keypair / broker-keypair

    The keypair for the wallet and the broker.
    
- broker-name

    The name of the broker that the app will act as
    
- public-wallet-chain-server-peers / miner-chain-server-peers / broker-chain-server-peers / wallet-chain-server-peers

    The peers to which the app will try and connect to on start.
    
- public-wallet-fuseki / miner-fuseki / broker-fuseki / wallet-fuseki

    The location of the fuseki instance to use for SPARQL queries.
    
## RDF Store

The blockchain implementation in blockchain/blockchain.ts only holds the count of various RDF triples, but does not allow for efficient querying.
To allow for efficient querying, the app can be told of the location of a apache fuseki instance, which it will populate with the RDF triples.
SPARQL queries can then be ran against the fuseki instance directly, or by using the query API to make the app act as a proxy.

If the app is configured to use a fuseki instance, and it cannot connect during updating the blockchain, it will panic and stop.
This helps stop the internal representation of the blockchain from diverging from the state stored in the fuseki instance.
A hardened version of this utilising the atomic nature of the sqlite3 store used to store persistence information is in the works.

## Running

As this project is a typescript node project, be sure to install all dependencies first (`npm install`), and then run the typescript compiler (`tsc`).

The working directory is assumed to be the root of the repository.
As such, starting the miner can be done with `node ./miner/miner-app.js`, broker with `node ./broker/broker-app.js`, etc.