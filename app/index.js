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
const Blockchain = require('../blockchain');
const P2pServer = require('./p2p-server');
const Wallet = require('../wallet');
const TransactionPool = require('../wallet/transaction-pool');
const QueryEngine = require('@comunica/query-sparql').QueryEngine;
const ChainUtil = require('../chain-util');

const N3              = require('n3');
const jsonld          = require('jsonld');
var   mqtt            = require('mqtt');
var   aedes           = require('aedes')(); /* aedes is a stream-based MQTT broker */
var   MQTTserver      = require('net').createServer(aedes.handle);
const fs              = require('fs'); /* file system (fs) module allows you to work with 
                                          the file system on your computer*/
const multer          = require('multer');/* Multer is a node.js middleware for handling multipart/form-data
                                          , which is primarily used for uploading files.*/
'use strict';/* "use strict" is to indicate that the code should be executed in "strict mode".
              With strict mode, you can not, for example, use undeclared variables.*/


const app = express();
const bc = new Blockchain();
//currently gen a new keypair per run, we probably want to load this from something else in the future
const wallet = new Wallet(ChainUtil.genKeyPair());
const tp = new TransactionPool();
const p2pServer = new P2pServer(bc, tp, wallet, './persist_block_chain.json');

const parser        = new N3.Parser(); //({format: 'application/n-quads'});
const myEngine = new QueryEngine();

app.use(bodyParser.json());

//initialising a local storage for storing metadata file initially before storing it in the tripple store
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, './uploads/');
  }, 
  filename: function(req, file, cb) {
    cb(null, new Date().toISOString() + file.originalname); 
  }
});
 //filtering the type of uploaded Metadata files
 const fileFilter = (req, file, cb) => { 
  // reject a file
  if (file.mimetype === 'application/json' || file.mimetype === 'text/plain' || file.mimettype === 'turtle') {
    cb(null, true);
  } else {
    cb(null, false);
  }
};
// defining a storage and setup limits for storing metadata file initially before storing it in the tripple store
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 5
  },
 fileFilter: fileFilter 
});

// innitialising the HTTP PORT to listen 
const port = process.env.HTTP_PORT || 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));
p2pServer.listen();

//aedes mqtt server intialization
const MQTTport = process.env.MQTT_PORT || 1882;
MQTTserver.listen(MQTTport, function () {
	console.log('MQTTserver listening on port', MQTTport)
})

app.use('/uploads', express.static('uploads')); // to store uploaded metadata to '/uploads' folder
app.use(bodyParser.json()); //

// GET APIs
app.get('/blocks', (req, res) => {
  res.json(bc.chain);
});
///////////////
app.get('/MetaDataTransactions', (req, res) => {
  res.json(tp.metadataS);
});
///////////////
app.get('/PaymentTransactions', (req, res) => {
  res.json(tp.transactions);
});
///////////////
app.get('/Transactions', (req, res) => {
  res.json(tp);
});
///////////////
//app.get('/mine-transactions', (req, res) => {
//  const block = miner.mine();
//  console.log(`New block added: ${block.toString()}`);
//  res.redirect('/blocks'); 
// // res.json("Block mined");
//});
///////////////
app.get('/public-key', (req, res) => {
  res.json({ publicKey: wallet.publicKey }); 
});
///////////////
app.get('/Balance', (req, res) => {
   res.json({ Balance: wallet.balance });
});

///////////////
//this API prints all the quads stored in the RDF store and returns the entire store
app.get('/quads', (req, res) => {
  //for (const quad of store)
  //console.log(quad);
  res.json(store);

});

app.get('/IoTdeviceRegistration', (req, res)=> {
  fs.readdir('./uploads', function(err, files) {  
    //console.log(files[files.length-2]); 
    var FileName = files[files.length-2];
    let rawdata             = fs.readFileSync(`./uploads/${FileName}`);  
    let SenShaMartDesc      = JSON.parse(rawdata); 
  /* the following piece of code is used to genrate JSON object out of name-value pairs submitted
    let SenShaMartExtNames  = ['Name','Geo' ,'IP_URL' , 'Topic_Token', 'Permission', 'RequestDetail', 
                               'OrgOwner', 'DepOwner','PrsnOwner', 'PaymentPerKbyte', 
                               'PaymentPerMinute','Protocol', 'MessageAttributes', 'Interval', 
                               'FurtherDetails']
    let SenShaMartExtValues = [Name,Geo ,IP_URL , Topic_Token, Permission, RequestDetail, 
                              OrgOwner, DepOwner,PrsnOwner, PaymentPerKbyte, 
                              PaymentPerMinute,Protocol, MessageAttributes, Interval, 
                              FurtherDetails]                           
    let SenSHaMArtExt = {};
    for (let i =0; i <SenShaMartExtNames.length; i++){
      SenSHaMArtExt[`${SenShaMartExtNames[i]}`]= SenShaMartExtValues[i] 
     
      } 
  //let SenShaMartOnt = SSNmetadata;
  //SenShaMartOnt.push(SenSHaMArtExt); */
      //console.log(SenShaMartDesc);
    jsonld.toRDF(SenShaMartDesc, {format: 'application/n-quads'}, 
      (err, nquads) => {
        //console.log(nquads)
        var metadata = wallet.createMetadata( 
          nquads, tp);
        p2pServer.newMetadata(metadata);
      });
    });
    res.json("MetadataTransactionCreated");
  });

//////////////////////////////////////////////////
// POST APIs
//this doesn't work well with the continious miner
//app.post('/mine', (req, res) => {
//  const block = bc.addBlock(req.body.data);
//  console.log(`New block added: ${block.toString()}`);

//  p2pServer.newBlock(block);

//  res.redirect('/blocks');
//});
///////////////
app.post('/PaymentTransaction', (req, res) => {
  const { recipient, amount } = req.body;
  const transaction = wallet.createTransaction(recipient, amount, bc, tp);
  if (transaction === null) {
    res.json("Couldn't create transaction");
    return;
  }
  p2pServer.newTransaction(transaction);
  res.redirect('/transactions');
}); 

///////////////
app.post('/IoTdevicePaymentTransaction', (req, res) => {
  const { Recipient_payment_address, Amount_of_money, Payment_method,
          Further_details} = req.body;
  if (Payment_method == "SensorCoin") {
    //create coin transaction doesn't exist yet
    const PaymentTransaction = wallet.createCoinTransaction(
      Recipient_payment_address, Amount_of_money, bc, tp);
    p2pServer.broadcastCoinTransaction(PaymentTransaction);
    res.json("PaymentTransactionCreated");
  }
  else if (Payment_method == "Bitcoin") {
     res.redirect('/BitcoinTransaction')
  }
  else if (Payment_method == "PayPal") {
     res.redirect('/PayPalTransaction')
  }
});
///////////////
app.post("/UploadMetafile", upload.single('file'), (req, res) => {
  //  recipient: req.body.recipient, 
  //  amount   : req.body.amount,
 // const Geo            = req.body.Geo;
 // const IPSO           = req.body.IPSO;
 // const Type           = req.body.Type;
 // const Permission     = req.body.Permission;
 // const OrgOwner       = req.body.OrgOwner;
  const file           = req.file;
    //file    : req.body.file
  
  res.status(201).json({
  message: 'Uploading Metadata was successful',
  MetadataFile : file
});
});

/////////////////////
//Start of comunica sparql query code
app.post('/sparql', (req, res) => {
  console.log(req.body);
  const start = async function () {
    try {
      let result = [];
      const bindingsStream = await myEngine.queryBindings(
        req.body,
        {
          readOnly: true,
          sources: [{
            type: 'rdfjsSource',
            value: p2pServer.store
          }]
        });
      bindingsStream.on('data', (binding) => {
        console.log(binding.toString());
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

        ///////////////////////////////////////////////////////////Integration///////////////////////////////////////////////////////////
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
  for (let j= data.length-1; j>0; j-- ){/** this for loop load 
  Blockchain and search for metadata and payment transaction that match 
  the provided MetadataID and TransactionID  */ 
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
      Math.random()*DistributedBrokers.length)+1)-1 /**  collect 
      a random number to select a random broker*/
      MiddlewareBroker = DistributedBrokers[BrokerRandomNumber];
      MiddlewareTopic = makeTopic(5);// generate random topic
      MiddlewarePort = DistributedBrokersPorts[BrokerRandomNumber];
      //loading the configuration massage
      configurationMessage = {"host/broker":MiddlewareBroker,
                              "topic":MiddlewareTopic,
                              "port":MiddlewarePort, 
                              "duration":Duration} /** add pk of the node
      connect to the IoT device and send the configuration massage*/ 
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
      /**  connect the randomly choosed mqtt middlware broker to 
       * listen to the transmitted massagies */
      MiddlewareClient.on("connect", ack => {
        console.log("connected!");
        console.log(MiddlewareBroker)
        StartSending.push(Date.now());
        MiddlewareClient.subscribe(MiddlewareTopic, err => {
              console.log(err); });}); 
      MiddlewareTracking.push({index:i, 
      TrackingTopic:MiddlewareTopic})/** this used to track the connection
      in case there are multiple conection at the same time */ 
      MiddlewareClient.on("message", (topic, message) => {/**  call back,
      will run each time a massage recived, I did it in a way if there are
      multiple connections, it will run for all the massagies, then truck the 
      massagies by MiddlwareTracking Array */
        var MiddlewareFound = MiddlewareTracking.filter(function(item) {
          return item.TrackingTopic == topic;}); 
        console.log(MiddlewareFound);
        console.log(message.toString());
        MiddlewareIndex = MiddlewareFound[0].index/**  this is the index of 
        the connection or the Middleware*/
        console.log(MiddlewareIndex)
        MassageCounter[MiddlewareIndex]++;/** this used to track the number 
        of recived massagies of each connection */ 
        console.log(Date.now()-StartSending[MiddlewareIndex])
        if (Date.now() - StartSending[MiddlewareIndex] >= 
            (Durations[MiddlewareIndex]*1000)
            -Intervals[MiddlewareIndex]*1000){
          console.log("sending time finished")
          if (MassageCounter[MiddlewareIndex] > 0.75*(
              Durations[MiddlewareIndex]/Intervals[MiddlewareIndex])
              ){/** which means most of massagies have been sent */
            console.log("massages recived")
            MassagiesRecived[MiddlewareIndex] = true;}
          if (MassagiesRecived[MiddlewareIndex]){/** if massagies recived,
             pay the 10% as service fees */
            const PaymentTransaction = wallet.createPaymentTransaction(
            NodeAddress,(0.1*paymentAmount[MiddlewareIndex]) , bc, tp);
            p2pServer.broadcastPaymentTransaction(PaymentTransaction);
            console.log("amount paid to the IoT device")
            console.log(MiddlewareIndex)
            MiddlewareClient = MiddlewareClients[MiddlewareIndex];
            /**  disconnect the middleware mqtt broker */
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


});
