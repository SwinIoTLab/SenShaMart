#  SenShaMart - A Global Marketplace for Sharing Sensors in IoT
Sensor Sharing Marketplace (SenShaMart) is a global and decentralised marketplace built on a collection of distributed nodes that interact via a peer-to-peer communication supported by a spesialised semantic Blockchain called SenShaMart (SSM)Blockchain. These distributed nodes are public, and anyone can join the pool of the distributed nodes. Note that these nodes are not same as the IoT sensors. IoT sensors only shares data and do not require to contribute to the SenShaMart Blockchain. 
SenShaMart enables the owners of IoT sensors (i.e., providers) to share their data and get paid for them. Also, enables client IoT applications (i.e., consumers) to find available IoT sensors, pay them, and use their data. 
SenShaMart is a self-managed marketplace that does not need any individual/organisation to control it or own it. It relies on decentralisation and semantic technology to support autonomic share of data between providers and consumers.

![Picture 1](https://github.com/SwinIoTLab/SenShaMart/assets/43335798/7254ce7b-64a7-4332-8a61-9c3e86888855)


## SenShaMart Components

### SSM Blockchain
SSM Blockchain is a semantic-based blockchain that provides self-managment for sharing IoT sensors. SSM Blockchain comprises of a collection of nodes. These nodes can play three main roles, which are Miners, Wallets, and Brokers. Each node can select one or more roles.
#### Miners
  
Miners mine blocks onto the SSM Blockchain.

#### Wallets
  
Wallets belong to users of the SenShaMart. They create, sign, and propagate new transactions to miners who then mine them into the chain.

#### Brokers (SSM Brokers)
  
Brokers act as proxies for sensor data and sit in between sensors and IoT applications. 

Brokers act as access control for the sensors' data, only allowing IoT applications owned by users who paied to access the appropriate sensor data. Some sensors are lightweight and cannot support the computational and storage requirements of managing the chain, and so the broker handles the chain management for them.
Random subsets of brokers can also act as witnesses of integrations.
These witnessing brokers can then vote on whether the integration completed successfully, or vote to refund the user if they believe the sensor misbehaved in some way.

#### RDF Store (uses SSM Ontology)

SSM Blockchain has embedded distributed RDF store in all SSM Blockchain nodes. This RDF store uses our developed ontology (i.e., an extension of Semantic Sensor Netwrok (SSN) https://www.w3.org/TR/vocab-ssn/) to store the semantic metadata of IoT sensors.  The blockchain implementation in blockchain/blockchain.ts only holds the count of various RDF triples, but does not allow for efficient querying.
To allow for efficient querying, the app can be told of the location of a apache fuseki instance, which it will populate with the RDF triples.
SPARQL queries can then be ran against the fuseki instance directly, or by using the query API to make the app act as a proxy.

If the app is configured to use a fuseki instance, and it cannot connect during updating the blockchain, it will panic and stop.
This helps stop the internal representation of the blockchain from diverging the state stored in the fuseki instance.
A hardened version of this utilising the atomic nature of the sqlite3 store used to store persistence information is in the works.

#### Transaction Types

##### Payment
  This transaction moves coins from one wallet to another

##### Broker Registration
  This transaction registers a broker into the system

##### Sensor Registration
  This transaction registers a sensor into the system

##### Integration
  This transaction pays for sensor data

##### Commit
  This transaction is a witness voting that an integration has been completed successfully. Note that the witnesses will be used later for developing the compensation transactions.

##### Compensation
  This transaction is a witness voting that an integration has been completed but the sensor misbehaved and the buyer should be compensated. Please note that the compensation transaction still under development.
  
### User Interface (SSM UI)
The SSM User Interface runs on top of the the blockchain to ensure its self-managment. The SSM UI provides several services for sensor providers and consumers (IoT applications). the SSM Ui comes with the software and can run on your machine. However, we are providing a public SSM UI to explore SenShaMart through this link 'http://136.186.108.87:7001/wallet.html'.

### Sensors

Sensors create the data that are to be shared, searched for, and paid for. We expect sensor providers to register thier sensors in SenShaMart to make them avaialble for sharing,

### IoT Applications
  
IoT Applications are the clients of sensor data. We expect IoT applications to query required sensors, select them, pay them and use their data.

## Repository Structure

The repository is split into multiple parts

- blockchain/

  This is where the logic for managing the blockchain is stored.
  The blockchain logic is in blockchain.ts, and the blocks are in block.ts.
  Each type of transaction has its own source file.
  Utility types and constant strings are stored in transaction_base, transaction_wrapper, and uris.

- broker/

  This is where the logic for the broker is.
  All logic for the broker is contained inside broker-app.
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

## Installation, Configuration, and Running

Please refer to our [install guide](./INSTALLATION.md)

## APIs
to access any of these APIs, you need to know 1) the IP of the machine that is running as a server (peer), 2) HTTP_PORT, and 3) the API name. For example: http://127.0.0.1, 3002, /gen-key for http://127.0.0.1:3002/gen-key.

A list of APIs provided by public-wallet-app is provided in our [APIs guide](./APIs.md) in this folder

## Public UI

We also have a public node on the ARDC Nectar Research Cloud. 
You can access it at [http://136.186.108.87:7001/wallet.html](http://136.186.108.87:7001/wallet.html).

## Contributions
Conceptualisation: Anas Dawod, Dimitrios Georgakopoulos, Prem P. Jayaraman, Josip Milovac, and Ampalavanapillai Nirmalathas.

Software Engineering: Anas Dawod and Josip Milovac.

## Fund
This project is fundded by ARC discovery grand DP220101420. 

Origanaly, it was funded by The University of Melbourne Scholarship as part of Anas Dawod's PhD.
