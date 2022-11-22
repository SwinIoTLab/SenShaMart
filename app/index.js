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

const express         = require('express');
const bodyParser      = require('body-parser');
const Blockchain      = require('../blockchain');
const P2pServer       = require('./p2p-server');
const Wallet          = require('../wallet');
const TransactionPool = require('../wallet/transaction-pool');
const Miner           = require('./miner');
const morgan          = require('morgan');//AddedM
const multer          = require('multer');
//const productRoutes   = require("./products");//addedM
const newEngine       = require('@comunica/actor-init-sparql').newEngine;
const N3              = require('n3');
const jsonld          = require('jsonld');
const DataFactory     = require('n3').DataFactory;
const fs              = require('fs');
const swaggerUi       = require('swagger-ui-express')
const swaggerFile     = require('./swagger_output.json')
var   lodash          = require('lodash');
var   mqtt            = require('mqtt');
var   aedes           = require('aedes')();
var   MQTTserver      = require('net').createServer(aedes.handle);
var   mosca           = require('mosca');
//var   awsIot          = require('aws-iot-device-sdk');
'use strict';// "use strict" is to indicate that the code should be executed in "strict mode".
             // With strict mode, you can not, for example, use undeclared variables.

const parser        = new N3.Parser({format: 'application/n-quads'});
const store         = new N3.Store();
const store2        = new N3.Store();
const myEngine      = newEngine();
const app           = express();
const bc            = new Blockchain();
const wallet        = new Wallet();
const tp            = new TransactionPool();
const p2pServer     = new P2pServer(bc, tp);
const miner         = new Miner(bc, tp, wallet, p2pServer);

//var   client        = mqtt.connect('mqtt://broker.hivemq.com');

var   MOSCAsettings = { MOSCAport:1883 }
//var   MOSCAserver   = new mosca.Server(MOSCAsettings);


//Mosca mqtt server intialization
// MOSCAserver.on('ready', function(){
// console.log("ready");
// });

//aedes mqtt server intialization
const MQTTport = process.env.MQTT_PORT || 1883;
MQTTserver.listen(MQTTport, function () {
	console.log('MQTTserver listening on port', MQTTport)
})

//
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, './uploads/');
  }, 
  filename: function(req, file, cb) {
    cb(null, new Date().toISOString() + file.originalname);
  }
});

 //filtering the type of uploaded files
const fileFilter = (req, file, cb) => { 
  // reject a file
  if (file.mimetype === 'application/json' || file.mimetype === 'text/plain' ) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 5
  },
 fileFilter: fileFilter 
});

const port = process.env.HTTP_PORT || 3001;
app.listen(port, () => console.log(`Listening on port ${port}`));
p2pServer.listen();

app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerFile))

function log(message) {
  console.log(`New block added: ${message.toString()}`);
  // fs.writeFileSync('./blocks.json', JSON.stringify(message),{'flags': 'a'}); //the problem with this function was overwrite even when i changed the flag to 'a'
  // fs.appendFile('./blocks.json', JSON.stringify(message) ,function(err){     //this function makes erorrs when the data is big
  //   if(err) throw err;
  //   console.log('IS WRITTEN')
    // });
  var BlockStream = fs.createWriteStream("blocks.json", {flags:'a'});
  BlockStream.write(message+ "\n");
}

function logQuery(message) {
  //console.log(`New block added: ${message.toString()}`);
  // fs.writeFileSync('./blocks.json', JSON.stringify(message),{'flags': 'a'}); //the problem with this function was overwrite even when i changed the flag to 'a'
  // fs.appendFile('./blocks.json', JSON.stringify(message) ,function(err){     //this function makes erorrs when the data is big
  //   if(err) throw err;
  //   console.log('IS WRITTEN')
    // });
  var QueryStream = fs.createWriteStream("Query.json", {flags:'a'});
  QueryStream.write(message+ "\n");
}


///////////////////////////////
app.use(morgan("dev"));//AddedM
app.use('/uploads', express.static('uploads'));
app.use(bodyParser.urlencoded({ extended: false }));//addedM
app.use(bodyParser.json());
//addedM
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET');
      return res.status(200).json({});
  }
  next();
});
//finished AddedM

//GET functions
app.get('/blocks', (req, res) => {
  res.json(bc.chain); 
});

app.get('/MetaDataTransactions', (req, res) => {
  res.json(tp.metaDataTransactions);
});

app.get('/CoinTransactions', (req, res) => {
  res.json(tp.cointransactions);
});

app.get('/Transactions', (req, res) => {
  res.json(tp);
});

app.get('/mine-transactions', (req, res) => {
  const block = miner.mine();
  console.log(`New block added: ${block.toString()}`);
  //res.redirect('/blocks'); 
  res.json("Block mined");
});

app.get('/public-key', (req, res) => {
  res.json({ publicKey: wallet.publicKey }); 
});

app.get('/Balance', (req, res) => {
   res.json({ Balance: wallet.balance });
});
/////////////////////////////

//POST functions
app.post('/mine', (req, res) => {
  const block = bc.addBlock(req.body.data);
  console.log(`New block added: ${block.toString()}`);

  p2pServer.syncChains();

  res.redirect('/blocks');
}); 

app.post('/RegistringIoTdevice', (req, res)=> {
  const {Name,Geo ,IP_URL , Topic_Token, Permission, RequestDetail, 
         OrgOwner, DepOwner,PrsnOwner, PaymentPerKbyte, 
         PaymentPerMinute,Protocol, MessageAttributes, Interval, 
         FurtherDetails} = req.body;
  fs.readdir('./uploads', function(err, files) {  
  console.log(files[files.length-2]); 
  var FileName = files[files.length-2];
  let rawdata             = fs.readFileSync(`./uploads/${FileName}`);  
  let SSNmetadata         = JSON.parse(rawdata); 
  let NameIn              = Name; 
  let GeoIn               = Geo;
  let IP_URLIn            = IP_URL;
  let Topic_TokenIn       = Topic_Token;
  let PermissionIn        = Permission;
  let RequestDetailIn     = RequestDetail;
  let OrgOwnerIn          = OrgOwner;
  let DepOwnerIn          = DepOwner;
  let PrsnOwnerIn         = PrsnOwner;
  let PaymentPerKbyteIn   = PaymentPerKbyte;
  let PaymentPerMinuteIn  = PaymentPerMinute;
  let ProtocolIn          = Protocol;
  let MessageAttributesIn = MessageAttributes;
  let IntervalIn          = Interval;
  let FurtherDetailsIn    = FurtherDetails; 
  var metaDataTransaction = wallet.createMetaDataTransaction(NameIn, 
                            GeoIn, IP_URLIn,Topic_TokenIn, 
                            PermissionIn, RequestDetailIn, OrgOwnerIn, 
                            DepOwnerIn, PrsnOwnerIn, PaymentPerKbyteIn,
                            PaymentPerMinuteIn,ProtocolIn,
                            MessageAttributesIn, IntervalIn, 
                            FurtherDetailsIn, 
                            SSNmetadata, tp);
    p2pServer.broadcastMetaDataTransaction(metaDataTransaction);});
   res.json("MetadataTransactionCreated");});

   /**
   * the following piece of code 
   * is for storing the metadata as a Nquad format inside the blockchain
   */
//  jsonld.toRDF(metaDataTransaction.SSNmetadata, {format: 'application/n-quads'}, 
//  (err, nquads) => {
//   // nquads is a string of N-Quads
//   parser.parse(
//      nquads,
//       (error, quadN, prefixes) => {
//       // console.log(quadN)
//       if (quadN)
//       //console.log(quadN.predicate)
//       store.addQuad(DataFactory.quad(
//          DataFactory.namedNode(quadN.subject.id), 
//          DataFactory.namedNode(quadN.predicate.id), 
//          DataFactory.namedNode(quadN.object.id)));       
//       });
//  });
//  metaDataTransaction.SSNmetadata= store;

app.post('/IoTdevicePaymentTransaction', (req, res) => {
  const { Recipient_payment_address, Amount_of_money, Payment_method,
          Further_details} = req.body;
  if (Payment_method == "SensorCoin"){
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

//////simple search engine 
app.post('/selectedMeta', (req, res) => {
  const {Name}= req.body;
 data =bc.chain.map (a => a.data);
 var PickedSensors = [];
 for (let i= 1; i<data.length; i++ ){
      //var pickeditems = [null];
     
       var metadata= data[i][1];
      //pickeditems.push(...metadata);
   // }
// return meta_array.Geo === 30;
//meta_array=bc.chain.map(b => b.input);

    var picked = lodash.find(metadata, x=> x.Name === Name);
    if (picked != null){
    PickedSensors.push(picked);
    }
 } 
     
 res.json(PickedSensors);   

});

//Start of comunica sparql query code
/**
 * this code under construction
 * try Comunica SPARQL RDFJS
 * I believe we need to change the way of storing the metadata
 */
app.post('/sparql', (req, res) => {
  const {Select,subject,predicate,object,Limit}= req.body; /**these 
  variable are used for the sparql query*/
  var meta = []//represents the array of all metadata inside  blockchain
  var queryResult
  BlockData =bc.chain.map (a => a.data); /** extracting the data section 
  from each block inside the whole blockchain */
  var i;//i represents the number of blocks inside the whole blockchain
  for ( i= 1; i < BlockData.length; i++ ){ 
    var j //represents number of metadata transaction inside each block
   for ( j= 0; j<BlockData[i][1].length ;j++){ 
     meta.push(BlockData[i][1][j]["SSNmetadata"]); } }  
     parser.parse(
       nquads,
        (error, quadN, prefixes) => {
        if (quadN)
           store.addQuad(DataFactory.quad(
           DataFactory.namedNode(quadN.subject.id), 
           DataFactory.namedNode(quadN.predicate.id), 
           DataFactory.namedNode(quadN.object.id)));
        else {(console.log("no metadata"))
          store.addQuad(DataFactory.quad(
          DataFactory.namedNode('http://ex.org/null'), 
          DataFactory.namedNode('http://ex.org/null'),
          DataFactory.namedNode('http://ex.org/null')));}});   
        const start = async function (a,b){  
        const result = await myEngine.query(`SELECT ${Select} WHERE 
                       {${subject} ${predicate} ${object}} LIMIT 
                       ${Limit}`, { sources: [{ type: 'rdfjsSource', 
                       value: store}] }) 
              result.bindingsStream.on('data', (data) => 
              console.log(data.toObject()));
              queryResult= result.bindingsStream};
        start() 
        logQuery(queryResult);
        res.json(queryResult);});



// this code to query the nquad data straight forward from the blockchain without changing the formt
app.post('/sparql2', (req, res) => {
  //find a way to define default values for the comming variables
  const {Select,subject,predicate,object,Limit}= req.body; // these variable are used for the sparql query
  var meta = [] // represents the array of all metadata inside the blockchain
  var queryResult
  /**
   * change the following code to custome map function to remove the for loop 
   * and make the code faster
   */
  BlockData =bc.chain.map (a => a.data); //extracting the data section from each block inside the whole blockchain
  var i;//i represents the number of blocks inside the whole blockchain
  for ( i= 1; i < BlockData.length; i++ ){ /**the purpose of this for loop is passing each BlockData to check for metadata
                                              this loop could be avoided if we used custome map function */ 
   
    var j // j represents the number of metadata transaction inside each block
   for ( j= 0; j<BlockData[i][1].length ;j++){ /** the purpose of this for loop is passing each metadata transaction inside each block
                                                   this loop could be avoided if we used custome map function  */ 
     meta.push(BlockData[i][1][j]["SSNmetadata"]); /**this array depends on the structure of the data section from chain from bc
                                                      i represents the number of blocks inside the whole blockchain
                                                      j represents the number of metadarta transaction inside each block */ 
   }
     
  } 
  console.log(meta) // printing the metadata just for testing purposes
  
 // jsonld.toRDF(meta, {format: 'application/n-quads'}, (err, nquads) => { /**

    //  parser.parse(  /**this piece of code is used for parse the metadata and store it in N3store */
    //    nquads,
    //     (error, quadN, prefixes) => {
    //     // console.log(quadN)
    //     if (quadN)
        // store2.addQuad(DataFactory.quad(
        //    DataFactory.namedNode(meta.subject.id), DataFactory.namedNode(meta.predicate.id), DataFactory.namedNode(meta.object.id)));
    //      //  console.log(store)
    //      });
        
        // const start = async function (a,b){ // we need this line of code to allow "await" function to work because it requires async function
        //   const result = await myEngine.query(`SELECT ${Select} WHERE {${subject} ${predicate} ${object}} LIMIT ${Limit}`,
        //     { sources: [{ type: 'rdfjsSource', value: meta}] }) 
        //   result.bindingsStream.on('data', (data) => console.log(data.toObject()));
        //   queryResult= result.bindingsStream
        //  // console.log(queryResult)
        //   };
        //   start()
        //   res.json(queryResult); 
 
  });
 
//try to make it return the query results insted of the metadata

  
//});

/**
 * this part is an implementation for sparql-engine
 * any line code will be added for this reason will have a comment of "sparql-engne" 
 * 
*/
// const {Parser, Store }=require('n3');
// const {Graph, HashMapDataset, PlanBuilder}= require('sparql-engine');//sparql-engine related
// const CustomGraph =require(/*import your Grapg subclass */);

 
// // Format a triple pattern acccording to N3 API
// // SPARQL variables must be replaced by `null` values
// function formatTriplePattern (triple){
//   let subject = null
//   let predicate = null
//   let object = null
//   if (!triple.subject.startWith('?')){
//     subject = triple.subject
//   }
//   if (!triple.predicate.startWith('?')){
//     predicate = triple.predicate 
//   }
//   if(!triple.object.startWith('?')){
//     object = triple.object
//   }
//   return { subject, predicate, object}
// }
//////////////////////END OF SPARQL_ENGINE CODE


// ////////////////sparqle-engine code startred/////////
// /**
//  * the following code is for checking sparql-engine
//   */

//   // class CustomGraph extends Graph {

//   //  /**
//   //    * Returns an iterator that finds RDF triples matching a triple pattern in the graph.
//   //    * @param  triple - Triple pattern to find
//   //    * @return An observable which finds RDF triples matching a triple pattern
//   //    */
//   //   find (triple:TripleObject, options: Object): Observable<TripleObject> {/*       */} 
//   // }

//   class N3Graph extends Graph {
//     constructor (){
//       super()
//       this._store = store()
//     }

//     insert (triple){
//       return new Promise((resolve, reject) => {
//         try {
//           this._store.addTriple(triple.subject, triple.predicate, triple.object)
//           resolve()
        
//         } catch (e) {
//           reject (e)
//         }
//       })
//     }

//     find (triple) {
//       const {subject, predicate, object}= formatTriplePattern(triple)
//       return this._store.getTriple (subject, predicate, object)
//     }

//     estimateCardinality (triple){
//       const {subject,predicate,object} = formatTriplePattern(triple)
//       return Promise.resolve(this._store.countTriples(subject,predicate,object))
//     }

//   }


// const graph = new N3Graph()
// const dataset = new HashMapDataset ('http://example.org#default', graph)

// //load some RDF data into the graph
// const parser = new Parser()
// parser.parse(`
// @prefix foaf: <http://xmlns.com/foaf/0.1/> .
// @prefic : <http://example.org#> .
// :a foaf:name "a" .
// :b foaf:name "b" .
// `).forEach(t => {graph._store.addTriple(t)
// })


// // const GRAPH_A_IRI ='http://example.org#graph-a';
// // const GRAPH_B_IRI ='http://example.org#graph-b';
// // const graph_a =new CustomGraph(/* */);
// // const graph_b = new CustomGraph(/* */);

// // //we set graph_a as a defualt RDF dataset
// // const dataset = new HashMapDataset(GRAPH_A_IRI, graph_a);
// // //insert graph_b as a Named Grapg
// // dataset.addNamedGraph(GRAPH_B_IRI, graph_b);

// //Get the Name of all the people in the default Graph 
// // const query= `
// // PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
// // PREFIX foaf: <http://xmlns.com/foaf/0.1>
// // SELECT ?name
// // WHERE{
// //   ?s a foaf:Person .
// //   ?s rdfs:label ?label .
// // }`
// const query = `
//   PREFIX foaf: <http://xmlns.com/foaf/0.1/>
//   SELECT ?name
//   WHERE {
//     ?s foaf:name ?name .
//   }`

// // Creates a plan builder for the RDF dataset
// const builder = new PlanBuilder(dataset);

// // Get an iterator to evaluate the query
// const iterator = builder.build(query);

// //read results
// iterator.subscribe(
//   binding => console.log(bindings),
//   err => console.error(err),
//   () => console.log('Query evaluation complete')
// );
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
