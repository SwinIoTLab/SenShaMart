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
const P2pServer = require('../p2p-server');
const QueryEngine = require('@comunica/query-sparql-rdfjs').QueryEngine;

const Blockchain = require('../blockchain/blockchain');
const Miner = require('./miner');
'use strict';/* "use strict" is to indicate that the code should be executed in "strict mode".
              With strict mode, you can not, for example, use undeclared variables.*/

const Config = require('../config');

const Payment = require('../blockchain/payment');
const Integration = require('../blockchain/integration');
const SensorRegistration = require('../blockchain/sensor-registration');
const BrokerRegistration = require('../blockchain/broker-registration');
const Transaction = require('../blockchain/transaction');

const {
  DEFAULT_PORT_MINER_API,
  DEFAULT_PORT_MINER_CHAIN,
  DEFAULT_PORT_MINER_TX_SHARE,
  DEFAULT_PORT_MINER_TX_RECV
} = require('../constants');

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
const txShareServerPort = config.get({
  key: "miner-tx-share-server-port",
  default: DEFAULT_PORT_MINER_TX_SHARE
});
const txShareServerPeers = config.get({
  key: "miner-tx-share-server-peers",
  default: []
});
const txRecvServerPort = config.get({
  key: "miner-tx-recv-port",
  default: DEFAULT_PORT_MINER_TX_RECV
});
const apiPort = config.get({
  key: "miner-api-port",
  default: DEFAULT_PORT_MINER_API
});

const blockchain = Blockchain.loadFromDisk(blockchainLocation);

function onMined(block) {
  if (!blockchain.addBlock(block)) {
    //invalid block, return
    return;
  }

  miner.onNewBlock(block);
  blockchain.saveToDisk(blockchainLocation);
  chainServer.broadcast(blockchain.serialize());
}

function onChainServerConnect(socket) {
  console.log("onChainServerConnect");
  P2pServer.send(socket, blockchain.serialize());
}

function onChainServerRecv(data) {
  const replaceResult = blockchain.replaceChain(data);
  if (!replaceResult.result) {
    //failed to replace
    return;
  }

  for (let i = replaceResult.chainDifference; i < blockchain.chain.length; i++) {
    miner.onNewBlock(blockchain.chain[i]);
  }

  blockchain.saveToDisk(blockchainLocation);
}

const chainServer = new P2pServer("Chain-server");
const txShareServer = new P2pServer("Tx-share-server");
const txRecvServer = new P2pServer("Tx-share-server");
const miner = new Miner(blockchain, minerPublicKey, onMined);

chainServer.start(chainServerPort, chainServerPeers, onChainServerConnect, onChainServerRecv);

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
          sources: blockchain.stores
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

/*        ///////////////////////////////////////////////////////////Integration///////////////////////////////////////////////////////////
DistributedBrokers      = ["mqtt.eclipse.org", "test.mosquitto.org","broker.hivemq.com"];
DistributedBrokersPorts = [1883,1883,1883];
function makeTopic(length) {
var result           = '';
var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
var charactersLength = characters.length;
for ( var i = 0; i < length; i++ ) {
   result += characters.charAt(Math.floor(Math.random() * charactersLength));
}
return result;
}
paymentAmount = [];
paymentAddress = [];
IoTDeviceAddress = [];
IoTApplicationAddress=[];
MassagiesRecived = [];
var MiddlewareClients =[];
MassageCounter =[];
StartSending = [];
MiddlewareTracking =[];
Durations = [];
Intervals = [];
i = 0;//RequestsIndex

app.post('/IoTdeviceIntegration-Control', (req, res) => {
  const {IoTDeviceID,paymentTransactionID,Duration,Protocol}= req.body; 
  Durations.push(Duration);
  MassageCounter.push(0)
  MassagiesRecived.push(false);
  data =bc.chain.map (a => a.data);
  MetaANDTransFound = false;
  for (let j= data.length-1; j>0; j-- ){
  //this for loop load 
  //Blockchain and search for metadata and payment transaction that match 
  //the provided MetadataID and TransactionID 
      var metadata     = data[j][1];
      var transaction  = data [j][0];
      var pickedMetadata   = lodash.find(metadata, x=> 
          x.id === IoTDeviceID); 
      var pickedTransction = lodash.find(transaction, x=> 
          x.id === paymentTransactionID);
      if (pickedMetadata != null && pickedTransction !=null){
          MetaANDTransFound = true;
          break;} }
  if (MetaANDTransFound){
    //Loading the IoTdevice parameters in order to connect to it
    var IoTDeviceBroker = pickedMetadata.IP_URL.toString();//mqtt broker
    var IoTDeviceTopic  = pickedMetadata.Topic_Token;// mqtt topic
    paymentAmount.push(pickedTransction.outputs[1].amount);
    paymentAddress.push(pickedTransction.outputs[1].address);
    IoTDeviceAddress.push(pickedMetadata.Signiture.address);
    IoTApplicationAddress.push(pickedTransction.input.address); 
    Intervals.push(pickedMetadata.Interval)
    if (paymentAddress[i] == wallet.publicKey){
        res.redirect('/IoTdataObtainingAndForward');}
      else{
        console.log("payment Address not match")}}            
   else{
     console.log("Metadata or Transaction not found")
       if (pickedMetadata == null){
         console.log("metadata not found")}
       if (pickedTransction == null){
         console.log("Transaction not found")} }
     MetaANDTransFound = false;
     i++;
     res.json("true");});



app.get ('/IoTdataObtainingAndForward', (req, res) => {
      console.log (`transaction of IoT Application ${i} approved`)
      BrokerRandomNumber = (Math.floor(
      Math.random()*DistributedBrokers.length)+1)-1 //collect a random number to select a random broker
      MiddlewareBroker = DistributedBrokers[BrokerRandomNumber];
      MiddlewareTopic = makeTopic(5);// generate random topic
      MiddlewarePort = DistributedBrokersPorts[BrokerRandomNumber];
      //loading the configuration massage
      configurationMessage = {"host/broker":MiddlewareBroker,
                              "topic":MiddlewareTopic,
                              "port":MiddlewarePort, 
                              "duration":Duration} //add pk of the node connect to the IoT device and send the configuration massage 
      var   IoTDeviceClient = mqtt.connect(IoTDeviceBroker);
      MiddlewareClients.push(mqtt.connect(`mqtt://${MiddlewareBroker}`))
      var MiddlewareClient = MiddlewareClients[i]
      IoTDeviceClient.on("connect", ack => {
        console.log("connected! to IoT Device Client");
        IoTDeviceClient.subscribe(IoTDeviceTopic, err => {
          console.log(err); });
        IoTDeviceClient.publish(IoTDeviceTopic, JSON.stringify(
                                configurationMessage));});
      IoTDeviceClient.on("error", err => {
        console.log(err);});
      IoTDeviceClient.on("message", (topic, message) => {
        console.log(message.toString())
        IoTDeviceClient.end(true)});
      //connect the randomly choosed mqtt middlware broker to listen to the transmitted massagies
      MiddlewareClient.on("connect", ack => {
        console.log("connected!");
        console.log(MiddlewareBroker)
        StartSending.push(Date.now());
        MiddlewareClient.subscribe(MiddlewareTopic, err => {
              console.log(err); });}); 
      MiddlewareTracking.push({index:i, 
      TrackingTopic:MiddlewareTopic}) //this used to track the connection in case there are multiple conection at the same time
      MiddlewareClient.on("message", (topic, message) => {
      //call back,
      //will run each time a massage recived, I did it in a way if there are
      //multiple connections, it will run for all the massagies, then truck the 
      //massagies by MiddlwareTracking Array
        var MiddlewareFound = MiddlewareTracking.filter(function(item) {
          return item.TrackingTopic == topic;}); 
        console.log(MiddlewareFound);
        console.log(message.toString());
        MiddlewareIndex = MiddlewareFound[0].index//  this is the index of the connection or the Middleware
        console.log(MiddlewareIndex)
        MassageCounter[MiddlewareIndex]++;//this used to track the number of recived massagies of each connection
        console.log(Date.now()-StartSending[MiddlewareIndex])
        if (Date.now() - StartSending[MiddlewareIndex] >= 
            (Durations[MiddlewareIndex]*1000)
            -Intervals[MiddlewareIndex]*1000){
          console.log("sending time finished")
          if (MassageCounter[MiddlewareIndex] > 0.75*(
              Durations[MiddlewareIndex]/Intervals[MiddlewareIndex])
              ){// which means most of massagies have been sent
            console.log("massages recived")
            MassagiesRecived[MiddlewareIndex] = true;}
          if (MassagiesRecived[MiddlewareIndex]){// if massagies recived, pay the 10% as service fees
            const PaymentTransaction = wallet.createPaymentTransaction(
            NodeAddress,(0.1*paymentAmount[MiddlewareIndex]) , bc, tp);
            p2pServer.broadcastPaymentTransaction(PaymentTransaction);
            console.log("amount paid to the IoT device")
            console.log(MiddlewareIndex)
            MiddlewareClient = MiddlewareClients[MiddlewareIndex];
            //disconnect the middleware mqtt broker
            MiddlewareClient.end(true)}
          else{// if massagies not recived, pay the IoT application back
            res.redirect('/IoTapplicationCompensationTransaction')}};});

      
      app.post('/IoTApplicationCompensationTransaction', (req, res) => {
        const { Recipient_payment_address, Amount_of_money, Payment_method,
                Further_details} = req.body;
        if (Payment_method == "SensorCoin"){
        const PaymentTransaction = wallet.createPaymentTransaction(
              Recipient_payment_address, Amount_of_money, bc, tp);
        p2pServer.broadcastPaymentTransaction(PaymentTransaction);
        res.json("PaymentTransactionCreated");
        }
        else if (Payment_method == "Bitcoin") {
           res.redirect('/BitcoinTransaction')
        }
        else if (Payment_method == "PayPal") {
           res.redirect('/PayPalTransaction')
        }
      });
      

          app.post ('/IoTapplicationCompensation', (req, res) => {
            const PaymentTransaction = wallet.createPaymentTransaction(IoTApplicationAddress[MiddlewareIndex],
            (paymentAmount[MiddlewareIndex]) , bc, tp);
            p2pServer.broadcastPaymentTransaction(PaymentTransaction);
            console.log("amount paid back to the IoT Application")
          });         
          
  













var IoTDeviceMassage ="test"
app.post('/integrateVirtual', (req, res) => {
  const {IoTDeviceID,paymentTransactionID,Duration,Protocol}= req.body; 

  Durations.push(Duration);
  MassageCounter.push(0)
  MassagiesRecived.push(false);
  
  data =bc.chain.map (a => a.data);
  MetaANDTransFound = true;
  // for (let j= 1; j<data.length; j++ ){// this for loop load the Blockchain and search for metadata and payment transaction that match the provided MetadataID and TransactionID   
  //     var metadata     = data[j][1];
  //     var transaction  = data [j][0];
  //     var pickedMetadata   = lodash.find(metadata, x=> x.id === IoTDeviceID); ////one thing to consider, what if the IoT device has multiple meatadata (updated metadata)??
  //     var pickedTransction = lodash.find(transaction, x=> x.id === paymentTransactionID);
  //     if (pickedMetadata != null && pickedTransction !=null){
  //         MetaANDTransFound = true;
  //         break;
  //       }
  //     }
  if (MetaANDTransFound){
    //Loading the IoTdevice parameters in order to connect to it
   // var IoTDeviceBroker = pickedMetadata.IP_URL.toString();//mqtt broker
   // var IoTDeviceTopic  = pickedMetadata.Topic_Token;// mqtt topic
    paymentAmount.push(10)//pickedTransction.outputs[1].amount);
    paymentAddress.push("ADsf")//pickedTransction.outputs[1].address);
    IoTDeviceAddress.push("fth")//pickedMetadata.Signiture.address);
    IoTApplicationAddress.push("dtyuyf")//pickedTransction.input.address); 
    Intervals.push(10)//pickedMetadata.Interval)
    var device = awsIot.device({
      keyPath: './aws-iot-device-sdk/node_modules/certs/private.pem.key',
     certPath: './aws-iot-device-sdk/node_modules/certs/certificate.pem.crt',
       caPath: './aws-iot-device-sdk/node_modules/certs/RootCA1.pem',
     clientId: 'arn:aws:iot:us-east-1:712303746524:thing/SecondVirtualIoTdevice',
         host: 'a11joipjrff8s7-ats.iot.us-east-1.amazonaws.com'
   });
    //if (paymentAddress[i] == wallet.publicKey){
      console.log (`transaction of IoT Application ${i} approved`) // add later the check if the amount is match with the required duration
      BrokerRandomNumber = (Math.floor(Math.random()*DistributedBrokers.length)+1)-1 // collect a random number to select a random broker
      MiddlewareBroker = DistributedBrokers[BrokerRandomNumber];
      MiddlewareTopic = makeTopic(5);// generate random topic
      MiddlewarePort = DistributedBrokersPorts[BrokerRandomNumber];
      //loading the configuration massage
     // configurationMessage = {"host/broker":MiddlewareBroker,"topic":MiddlewareTopic, "port":MiddlewarePort, "duration":Duration} // add pk of the node
      // connect to the IoT device and send the configuration massage
          // var   IoTDeviceClient = mqtt.connect(IoTDeviceBroker);
          // MiddlewareClients.push(mqtt.connect(`mqtt://${MiddlewareBroker}`))
          // var MiddlewareClient = MiddlewareClients[i]
          // IoTDeviceClient.on("connect", ack => {
          //   console.log("connected! to IoT Device Client");
          //   IoTDeviceClient.subscribe(IoTDeviceTopic, err => {
          //     console.log(err);
          //   });
          //   IoTDeviceClient.publish(IoTDeviceTopic, JSON.stringify(configurationMessage));
          // });
          
          // IoTDeviceClient.on("error", err => {
          //   console.log(err);
          // });

          // IoTDeviceClient.on("message", (topic, message) => {
          //   console.log(message.toString())
          //   IoTDeviceClient.end(true)
          // });
      // IoTDeviceClient.on("close", ack => {
      //   console.log("Disconnected from IoT Device Client");
      // });
      
      device
      .on('connect', function() {
        console.log('connect');
        device.subscribe('/weather/data');// change it to a topic from the metadata
      //  device.publish('/weather/data', JSON.stringify({ test_data: 2}));
      });
     
      device
      .on('message', function(topic, payload) {
       // console.log('message', topic, payload.toString());
       IoTDeviceMassage = payload.toString();
       MiddlewareClient.publish(MiddlewareTopic,IoTDeviceMassage)
      });

      // connect the randomly choosed mqtt middlware broker to listen to the transmitted massagies
      MiddlewareClients.push(mqtt.connect(`mqtt://${MiddlewareBroker}`))
      var MiddlewareClient = MiddlewareClients[i]
      MiddlewareClient.on("connect", ack => {
        console.log("connected!");
        console.log(MiddlewareBroker)
        StartSending.push(Date.now());
        MiddlewareClient.subscribe(MiddlewareTopic, err => {
          console.log(err); 
        });
        MiddlewareClient.publish(MiddlewareTopic,IoTDeviceMassage)
      }); 
    
      MiddlewareTracking.push({index:i, TrackingTopic:MiddlewareTopic})// this used to track the connection in case there are multiple conection at the same time

      MiddlewareClient.on("message", (topic, message) => {// call back, will run each time a massage recived, I did it in a way if there are multiple connections, it will run for all the massagies, then we truck the massahies by MiddlwareTracking Array
        console.log(message.toString());
        var MiddlewareFound = MiddlewareTracking.filter(function(item) {
          return item.TrackingTopic == topic;
        }); 
        console.log(MiddlewareFound);
        MiddlewareIndex = MiddlewareFound[0].index;// this is the index of the connection or the Middleware
        console.log(MiddlewareIndex);
        MassageCounter[MiddlewareIndex]++;// this used to track the number of recived massagies of each connection
        console.log(Date.now()-StartSending[MiddlewareIndex])
        if (Date.now() - StartSending[MiddlewareIndex] >= (Durations[MiddlewareIndex]*1000)-Intervals[MiddlewareIndex]*1000){
          console.log("sending time finished")
          if (MassageCounter[MiddlewareIndex] > 0.75*(Durations[MiddlewareIndex]/Intervals[MiddlewareIndex])){// which means most of massagies have been sent
            console.log("massages recived")
            MassagiesRecived[MiddlewareIndex] = true;
          }
          if (MassagiesRecived[MiddlewareIndex]){// if massagies recived, pay the IoT device and substract 10% as service fees
            const cointransaction = wallet.createCoinTransaction(IoTDeviceAddress[MiddlewareIndex],(paymentAmount[MiddlewareIndex]-0.1*paymentAmount[MiddlewareIndex]) , bc, tp);
            p2pServer.broadcastCoinTransaction(cointransaction);
            console.log("amount paid to the IoT device")
            console.log(MiddlewareIndex)
            MiddlewareClient = MiddlewareClients[MiddlewareIndex];// disconnect the middleware mqtt broker
            MiddlewareClient.end(true)
          }
          else{// if massagies not recived, pay the ioT application back
            const cointransaction = wallet.createCoinTransaction(IoTApplicationAddress[MiddlewareIndex],(paymentAmount[MiddlewareIndex]) , bc, tp);
            p2pServer.broadcastCoinTransaction(cointransaction);
            console.log("amount paid back to the IoT Application")
            console.log(MiddlewareIndex)
            MiddlewareClient = MiddlewareClients[MiddlewareIndex];// disconnect the middleware mqtt broker
            MiddlewareClient.end(true)
          }
        }
            
          });
  //   }
  // else{
  //   console.log("payment Address not match")
  // }
  }
          
else{
  console.log("Metadata or Transaction not found")
    if (pickedMetadata == null){
      console.log("metadata not found")
    }
    if (pickedTransction == null){
      console.log("Transaction not found")
    }
  }

MetaANDTransFound = false;
i++;





 
 //
 // Device is an instance returned by mqtt.Client(), see mqtt.js for full
 // documentation.
 //
 
 

   res.json("true"); 
});


});*/
