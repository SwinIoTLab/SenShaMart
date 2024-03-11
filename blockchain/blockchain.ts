import  Block from './block.js';
import Payment from './payment.js';
import SensorRegistration from './sensor-registration.js';
import BrokerRegistration from './broker-registration.js';
import { Integration } from './integration.js';
import Compensation from './compensation.js';
import { type Result, type ResultFailure, type ResultSuccess, isFailure, type LiteralMetadata, type NodeMetadata } from '../util/chain-util.js';
import {
  MINING_REWARD,
  SENSHAMART_URI_REPLACE,
  MINE_RATE } from '../util/constants.js';

import URIS from './uris.js';
import type Persistence from './persistence.js';

function makeIntegrationKey(input: string, counter: number) {
  return input + '/' + String(counter);
}

const DATA_TYPE = {
  BALANCE: "BALANCE",
  SENSOR: "SENSOR",
  BROKER: "BROKER",
  INTEGRATION: "INTEGRATION",
  COUNTER: "COUNTER"
} as const;

type Data_type = typeof DATA_TYPE[keyof typeof DATA_TYPE];

const ALL_DATA_TYPES = [
  DATA_TYPE.BALANCE,
  DATA_TYPE.SENSOR,
  DATA_TYPE.BROKER,
  DATA_TYPE.INTEGRATION,
  DATA_TYPE.COUNTER
] as const;

interface IntegrationOutputExtra {
  sensorCostPerMin: number;
  sensorCostPerKB: number;
  broker: string;
}

interface IntegrationExpanded extends Integration {
  witnesses: Map<string,boolean>;
  compensationCount: number;
  outputsExtra: IntegrationOutputExtra[];
}

type Datas = {
  BALANCE: Map<string, number>;
  SENSOR: Map<string, SensorRegistration>;
  BROKER: Map<string, BrokerRegistration>;
  INTEGRATION: Map<string, IntegrationExpanded>;
  COUNTER: Map<string, number>;
  //[index: Data_type]: Map<string, unknown>;
}

const ERROR_REPLACECHAIN = {
  SUCCESS: 0,
  //given chain is shorter than current chain
  SHORTER: 1,
  //given chain doesn't overlap with current chain
  OVERLAP: 2,
  //given chain diverges before what was given
  DIVERGENCE: 3,
  //given chain failed verify
  VERIFY: 4,
  //given chain failed update
  UPDATER: 5,
  //given chain diverges before what is in memory, temporary limitation
  CACHED: 6,
  //bad arguments passed to a function
  BAD_ARG: 7,
} as const;

type TripleCounts = {
  nodes: Map<NodeMetadata, number>;
  literals: Map<LiteralMetadata, number>;
}

function genTripleCounts(): TripleCounts {
  return {
    nodes: new Map<NodeMetadata, number>(),
    literals: new Map<LiteralMetadata, number>()
  };
}

type Error_replacechain = typeof ERROR_REPLACECHAIN[keyof typeof ERROR_REPLACECHAIN];

function genDatas(): Datas {
  return {
    BALANCE: new Map<string, number>(),
    SENSOR: new Map<string, SensorRegistration>(),
    BROKER: new Map<string, BrokerRegistration>(),
    INTEGRATION: new Map<string, IntegrationExpanded>(),
    COUNTER: new Map<string, number>()
  };
}

function literal<T>(t: T): T {
  return t;
}

//store 24 hours worth in memory
const MAX_BLOCKS_IN_MEMORY = Math.ceil(24*60*60*1000/MINE_RATE);
class ChainLink {
  block: Block;
  undos: Datas;
  constructor(block: Block) {
    this.block = block;
    this.undos = genDatas();
  }
}

function mergeDatas(from: Datas, to:Datas) {
  for (const data of ALL_DATA_TYPES) {
    for (const [key, value] of Object.entries(from[data])) {
      if (value === null) {
        to[data].delete(key);
      } else {
        to[data].set(key, value);
      }
    }
  }
}

function getDatas<T>(type: Data_type, key: string, _default: T, datas: Datas[]):T {
  for (const data of datas) {
    if (data[type].has(key)) {
      const gotten = data[type].get(key);
      if (gotten === null) {
        return _default;
      } else if (gotten instanceof Object) {
        return Object.assign({}, gotten) as T;
      } else {
        return gotten as T;
      }
    }
  }
  return _default;
}

function forEveryData<T>(type: Data_type, datas: Datas[], transform: (k:string, v:T)=>void) {
  for (const data of datas) {
    for (const [key, value] of data[type]) {
      transform(key, value as T);
    }
  }
}

type UpdaterChanges = {
  [Property in keyof Datas]: Set<string>
};

function genChanges(): UpdaterChanges {
  return {
    BALANCE: new Set<string>(),
    SENSOR: new Set<string>(),
    BROKER: new Set<string>(),
    INTEGRATION: new Set<string>(),
    COUNTER: new Set<string>()
  };
}

function addDataToChanges(data: Datas, changes: UpdaterChanges) {
  for (const key in data.BALANCE) {
    changes.BALANCE.add(key);
  }
  for (const key in data.SENSOR) {
    changes.SENSOR.add(key);
  }
  for (const key in data.BROKER) {
    changes.BROKER.add(key);
  }
  for (const key in data.INTEGRATION) {
    changes.INTEGRATION.add(key);
  }
  for (const key in data.COUNTER) {
    changes.COUNTER.add(key);
  }
}

type UpdateCb = (err: Error, newBlocks: ChainLink[], changes: UpdaterChanges) => void;

const CREATE_QUERY_INITIAL = "INSERT DATA {" as const;
const DELETE_QUERY_INITIAL = "DELETE DATA {" as const;

function onUpdateFinish(updater: Updater, persist: boolean, err: Error, cb: UpdateCb) {
  if (err) {
    cb(err, null, null);
    return;
  }

  if (updater.parent.fuseki_location === null) {
    persist = false;
  }

  const chain = updater.parent;

  //debug checks
  let foundBad = false;
  for (let i = 0; i < chain.links.length - 1; i++) {
    if (!verifyBlockHash(chain.links[i].block, chain.links[i + 1].block).result) {
      console.log(`Bad internal link at ${i}->${i + 1}`);
      console.log(`hash: ${chain.links[i].block.hash}, lastHash: ${chain.links[i + 1].block.lastHash} `);
      foundBad = true;
    }
  }
  if (foundBad) {
    console.trace(`Pre Found bad, updater.startIndex: ${updater.startIndex}, updater.links.length: ${updater.links.length}, chain.linksStartI: ${chain.linksStartI}, chain.links.length: ${chain.links.length}`);
    process.exit(-1);
  }
  //debug checks end

  if (updater.links.length >= MAX_BLOCKS_IN_MEMORY) { //if the new links are larger than MAX BLOCKS IN MEMORY
    //only the tail end of links will fit, adjust linksStartI and slice links accordingly
    chain.linksStartI = updater.startIndex + updater.links.length - MAX_BLOCKS_IN_MEMORY;
    chain.links = updater.links.slice(-MAX_BLOCKS_IN_MEMORY);
  } else if (updater.startIndex >= chain.linksStartI) { //else if we start after linksStartI
    //we're going to have to do some chopping, using a certain amount of tail of current blockchain links, concattenated with our links
    const oldLinksStartI = chain.linksStartI;
    chain.linksStartI = Math.max(chain.linksStartI + (chain.links.length - (updater.startIndex - chain.linksStartI)) + updater.links.length - MAX_BLOCKS_IN_MEMORY, oldLinksStartI);
    if (updater.startIndex === chain.linksStartI) {
      chain.links = updater.links;
    } else {
      //we want to add the upder.links, with as much of the existing chain as we can
      //updater.links starts at updater.startIndex, so we want everything before that
      let constructing = chain.links.slice(0, updater.startIndex - chain.linksStartI);
      //then we need to cull from the start of this to make it fit in MAX_BLOCKS_IN_MEMORY
      if (constructing.length + updater.links.length > MAX_BLOCKS_IN_MEMORY) {
        constructing = constructing.slice(updater.links.length + constructing.length - MAX_BLOCKS_IN_MEMORY);
      }
      //finally concat it
      chain.links = constructing.concat(updater.links);
    }
  } else {
    chain.linksStartI = updater.startIndex;
    chain.links = updater.links;
  }

  //debug checks
  for (let i = 0; i < chain.links.length - 1; i++) {
    if (!verifyBlockHash(chain.links[i].block, chain.links[i + 1].block).result) {
      console.log(`Bad internal link at ${i}->${i + 1}`);
      console.log(`hash: ${chain.links[i].block.hash}, lastHash: ${chain.links[i + 1].block.lastHash} `);
      foundBad = true;
    }
  }
  if (foundBad) {
    console.trace(`Post Found bad, updater.startIndex: ${updater.startIndex}, updater.links.length: ${updater.links.length}, chain.linksStartI: ${chain.linksStartI}, chain.links.length: ${chain.links.length}`);
    process.exit(-1);
  }
  //debug checks end

  const changes: UpdaterChanges = genChanges();

  updater.startIndex = updater.parent.length(); //move the updater start index up to be where the blockchain now ends

  addDataToChanges(updater.prevData, changes); //update data and changes
  mergeDatas(updater.prevData, chain.data);
  addDataToChanges(updater.curData, changes);
  mergeDatas(updater.curData, chain.data);

  updater.curData = genDatas(); //reset cur and prev data
  updater.prevData = genDatas();

  //start creating update statements for fuseki
  let create_query = CREATE_QUERY_INITIAL;
  let delete_query = DELETE_QUERY_INITIAL;
  for (const [triple, count] of updater.store.nodes) {
    let existing = chain.store.nodes.get(triple);
    if (existing === undefined) {
      existing = 0;
    }
    if (existing + count < 0) {
      console.error("Negative rdf reached during update");
      process.exit(-1);
    }
    if (persist) {
      if (existing === 0 && existing + count > 0) {
        create_query += `<${triple.s}> <${triple.p}> <${triple.o}>.`;
      }
      if (existing > 0 && existing + count === 0) {
        delete_query += `<${triple.s}> <${triple.p}> <${triple.o}>.`;
      }
    }
    chain.store.nodes.set(triple, existing + count);
  }
  for (const [triple, count] of updater.store.literals) {
    let existing = chain.store.literals.get(triple);
    if (existing === undefined) {
      existing = 0;
    }
    if (existing + count < 0) {
      console.error("Negative rdf reached during update");
      process.exit(-1);
    }
    if (persist) {
      if(existing === 0 && existing + count > 0) {
        if (typeof triple.o === "string") {
          create_query += `<${triple.s}> <${triple.p}> "${triple.o}".`;
        } else {
          create_query += `<${triple.s}> <${triple.p}> "${triple.o}".`;
        }
      }
      if (existing > 0 && existing + count === 0) {
        if (typeof triple.o === "string") {
          delete_query += `<${triple.s}> <${triple.p}> "${triple.o}".`;
        } else {
          delete_query += `<${triple.s}> <${triple.p}> "${triple.o}".`;
        }
      }
    }
    chain.store.literals.set(triple, existing + count);
  }

  if (persist) {
    let sending = "";
    if (create_query.length > CREATE_QUERY_INITIAL.length) {
      sending += create_query + "};";
    }
    if (delete_query.length > DELETE_QUERY_INITIAL.length) {
      sending += delete_query + "};";
    }

    fetch(updater.parent.fuseki_location + "/update", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: 'update=' + encodeURIComponent(sending)
    });
  }

  const newLinks = updater.links;
  updater.links = [];
  cb(null, newLinks, changes);
}

function makeBlockName(block: Block): string {
  return URIS.OBJECT.BLOCK + '/' + block.hash;
}

function makePaymentTransactionName(payment: Payment): string {
  return URIS.OBJECT.PAYMENT + '/' + Payment.hashToSign(payment);
}

function makeIntegrationTransactionName(integration: Integration): string {
  return URIS.OBJECT.INTEGRATION + '/' + Integration.hashToSign(integration);
}

function makeCompensationTransactionName(compensation: Compensation): string {
  return URIS.OBJECT.COMPENSATION + '/' + Compensation.hashToSign(compensation);
}

function makeSensorTransactionName(sensorRegistration: SensorRegistration): string {
  return URIS.OBJECT.SENSOR_REGISTRATION + '/' + SensorRegistration.hashToSign(sensorRegistration);
}

function makeBrokerTransactionName(brokerName: BrokerRegistration): string {
  return URIS.OBJECT.BROKER_REGISTRATION + '/' + BrokerRegistration.hashToSign(brokerName);
}

function makeWalletName(input: string): string {
  return URIS.OBJECT.WALLET + '/' + input;
}

function genBlockHeaderRDF(triples: TripleCounts, block: Block, prevBlockName: string, count:number = 1): void {
  const blockName = makeBlockName(block);
  addToLiteralTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.TYPE,
    o: URIS.OBJECT.BLOCK
  }, count);
  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.LAST_BLOCK,
    o: prevBlockName
  }, count);
  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.MINED_BY,
    o: makeWalletName(block.reward)
  }, count);
}

class Updater {
  parent: Blockchain;
  links: ChainLink[];
  prevData: Datas;
  curData: Datas;
  startIndex: number;
  on: number;
  store: TripleCounts;
  constructor(parent: Blockchain) {
    this.parent = parent;
    this.links = [];
    this.prevData = genDatas();
    this.curData = genDatas();
    this.startIndex = parent.length();
    this.on = this.startIndex;
    this.store = genTripleCounts();
  }

  prevBlock(): Block {
    return this.prevLink().block;
  }

  prevLink(): ChainLink {
    if (this.links.length > 0) {
      return this.links[this.links.length - 1];
    }

    if (this.on === 0) {
      return new ChainLink(Block.genesis());
    }

    if (this.on - 1 < this.parent.linksStartI) {
      console.error("Currently can't go backwards through blocks that aren't in memory");
      process.exit(-1);
    }

    return this.parent.links[this.on - this.parent.linksStartI - 1];
  }

  newBlock(block: Block): void {
    const prevBlock = this.prevBlock();
    if (this.links.length >= MAX_BLOCKS_IN_MEMORY) {
      this.links.shift();
    }
    this.links.push(new ChainLink(block));
    this.on++;

    mergeDatas(this.curData, this.prevData);
    this.curData = genDatas();

    genBlockHeaderRDF(this.store, block, makeBlockName(prevBlock));
  }

  undoBlock(): void {
    if (this.on === 0) {
      console.error("Tried to undo beyond genesis");
      process.exit(-1);
    }

    const undoing = this.prevLink();
    this.on--;
    const prev = this.prevBlock();

    mergeDatas(this.curData, this.prevData);
    this.curData = genDatas();
    mergeDatas(undoing.undos, this.prevData);
    genBlockRDF(this.store, undoing.block, prev);

    if (this.links.length > 0) {
      this.links.pop();
    }
  }

  get<T>(type: Data_type, key: string, _default: T): T {
    return getDatas(type, key, _default, [this.curData, this.prevData, this.parent.data]);
  }

  set<T>(type: Data_type, key: string, value: T): void {

    const existing = getDatas(type, key, null, [this.prevData, this.parent.data]);

    (this.curData[type] as Map<string,T>).set(key, value);

    if (this.links.length !== 0) {
      //if this value is same as before this block, remove any undo if it exists and return early
      if (typeof existing === "number" && typeof value === "number") {
        if (existing == value) {
          this.links[this.links.length - 1].undos[type].delete(key);
          return;
        }
      }
      //otherwise set the undo
      this.links[this.links.length - 1].undos[type].set(key, existing);
    }
  }

  plus(type: Data_type, key: string, _default: number, value:number): void {
    if (value === 0) {
      return;
    }
    this.set(type, key, this.get(type, key, _default) + value);
  }

  getBrokerPublicKeys(): string[] {
    const keys = new Set<string>();

    forEveryData<BrokerRegistration>(DATA_TYPE.BROKER, [this.curData, this.prevData, this.parent.data], (_key, value) => {
      keys.add(value.input);
    });

    return Array.from(keys);
  }

  finish(persist: boolean, cb: UpdateCb) {
    //persist blockchain first
    if (persist) {
      this.parent.persistence.writeBlocks(this.startIndex, this.links, (err:Error) => onUpdateFinish(this, persist, err, cb));
    } else {
      setImmediate(() => onUpdateFinish(this, persist, null, cb));
    }
  }
}

function addToLiteralTripleCounts(triples: TripleCounts, triple: LiteralMetadata, count?: number): void {
  if (count === undefined || count === null) {
    count = 1;
  }

  if (triples.literals.has(triple)) {
    const returning = triples.literals.get(triple) + count;
    if (returning === 0) {
      triples.literals.delete(triple);
    } else {
      triples.literals.set(triple, returning);
    }
  } else {
    triples.literals.set(triple, count);
  }
}

function addToNodeTripleCounts(triples: TripleCounts, triple: NodeMetadata, count?: number): void {
  if (count === undefined || count === null) {
    count = 1;
  }

  if (triples.nodes.has(triple)) {
    const returning = triples.nodes.get(triple) + count;
    if (returning === 0) {
      triples.nodes.delete(triple);
    } else {
      triples.nodes.set(triple, returning);
    }
  } else {
    triples.nodes.set(triple, count);
  }
}

function uriReplacePrefix(testing:string, sensorName:string):string {
  if (testing.startsWith(SENSHAMART_URI_REPLACE)) {
    return sensorName.concat(testing.slice(SENSHAMART_URI_REPLACE.length));
  } else {
    return testing;
  }
}

function genPaymentRDF(triples: TripleCounts, blockName: string, tx: Payment, count: number = 1): void{

  const transactionName = makePaymentTransactionName(tx);

  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.CONTAINS_TRANSACTION,
    o: transactionName
  }, count);
  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.CONTAINS_PAYMENT,
    o: transactionName
  }, count);

  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.REWARDED,
    o: tx.rewardAmount
  }, count);

  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.TYPE,
    o: URIS.OBJECT.PAYMENT
  }, count);
}

function stepPayment(updater: Updater, reward:string, tx:Payment):Result {
  const verifyRes = Payment.verify(tx);
  if (isFailure(verifyRes)) {
    return {
      result: false,
      reason: "couldn't verify a payment: " + verifyRes.reason
    };
  }

  if (tx.counter <= updater.get(DATA_TYPE.COUNTER, tx.input, 0)) {
    return {
      result: false,
      reason: "payment has invalid counter"
    };
  }
  updater.set(DATA_TYPE.COUNTER, tx.input, tx.counter);

  let inputBalance = updater.get(DATA_TYPE.BALANCE, tx.input, 0);

  //first loop is to check it can be payed, and spends, second loop does the paying
  if (inputBalance < tx.rewardAmount) {
    return {
      result: false,
      reason: "payment rewarding more than they have"
    };
  }
  inputBalance -= tx.rewardAmount;

  for (const output of tx.outputs) {
    if (inputBalance < output.amount) {
      return {
        result: false,
        reason: "payment spending more than they have"
      };
    }
    inputBalance -= output.amount;
  }

  updater.set(DATA_TYPE.BALANCE, tx.input, inputBalance);

  for (const output of tx.outputs) {
    updater.plus(DATA_TYPE.BALANCE, output.publicKey, 0, output.amount);
  }
  updater.plus(DATA_TYPE.BALANCE, reward, 0, tx.rewardAmount);

  genPaymentRDF(updater.store, makeBlockName(updater.prevBlock()), tx);

  return {
    result: true
  };
}

function genIntegrationRDF(triples: TripleCounts, blockName: string, tx: Integration, count: number = 1): void {

  const transactionName = makeIntegrationTransactionName(tx);

  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.CONTAINS_TRANSACTION,
    o: transactionName
  }, count);
  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.CONTAINS_INTEGRATION,
    o: transactionName
  }, count);

  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.REWARDED,
    o: tx.rewardAmount
  }, count);

  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.TYPE,
    o: URIS.OBJECT.INTEGRATION
  }, count);
}

function stepIntegration(updater:Updater, reward:string, tx:Integration):Result {
  const verifyRes = Integration.verify(tx);
  if (isFailure(verifyRes)) {
    return {
      result: false,
      reason: "couldn't verify a integration: " + verifyRes.reason
    };
  }

  if (tx.counter <= updater.get(DATA_TYPE.COUNTER, tx.input, 0)) {
    return {
      result: false,
      reason: "integration has invalid counter"
    };
  }

  updater.set(DATA_TYPE.COUNTER, tx.input, tx.counter);

  let inputBalance = updater.get(DATA_TYPE.BALANCE, tx.input, 0);

  //first loop is to check it can be payed, and spends, second loop does the paying
  if (inputBalance < tx.rewardAmount) {
    return {
      result: false,
      reason: "integration rewarding more than they have"
    };
  }
  inputBalance -= tx.rewardAmount;

  const outputsExtra: IntegrationOutputExtra[] = [];

  for (const output of tx.outputs) {
    const foundSensor = updater.get(DATA_TYPE.SENSOR, output.sensorName, null);

    if (foundSensor === null) {
      return {
        result: false,
        reason: `Integration references non-existant sensor: ${output.sensorName}`
      };
    }
    if (SensorRegistration.hashToSign(foundSensor) !== output.sensorHash) {
      return {
        result: false,
        reason: "Integration references non-current version of sensor"
      };
    }

    const foundBroker = updater.get(DATA_TYPE.BROKER, SensorRegistration.getIntegrationBroker(foundSensor), null);

    if (foundBroker === null) {
      return {
        result: false,
        reason: "Internal consitency error, can't find broker referenced by commited sensor registration"
      };
    }

    if (BrokerRegistration.hashToSign(foundBroker) !== output.brokerHash) {
      return {
        result: false,
        reason: "Integration references non-current version of sensor's broker"
      };
    }

    if (inputBalance < output.amount) {
      return {
        result: false,
        reason: "integration spending more than they have"
      };
    }
    inputBalance -= output.amount;

    outputsExtra.push({
      sensorCostPerKB: SensorRegistration.getCostPerKB(foundSensor),
      sensorCostPerMin: SensorRegistration.getCostPerMinute(foundSensor),
      broker: SensorRegistration.getIntegrationBroker(foundSensor)
    });
  }
  updater.set(DATA_TYPE.BALANCE, tx.input, inputBalance);

  updater.plus(DATA_TYPE.BALANCE, reward, 0, tx.rewardAmount);

  const txCopy: IntegrationExpanded = Object.assign({
    witnesses: new Map<string,boolean>,
    compensationCount: 0,
    outputsExtra: outputsExtra
  }, tx);
  const brokers = updater.getBrokerPublicKeys();

  const witnesses = Integration.chooseWitnesses(tx, brokers);

  if (isFailure(witnesses)) {
    return {
      result: false,
      reason: "Couldn't choose witnesses: " + witnesses.reason
    };
  }

  for (const witness of witnesses.witnesses) {
    txCopy.witnesses.set(witness, false);
  }

  updater.set(DATA_TYPE.INTEGRATION, makeIntegrationKey(txCopy.input, txCopy.counter), txCopy);

  genIntegrationRDF(updater.store, makeBlockName(updater.prevBlock()), txCopy);

  return {
    result: true
  };
}

function genCompensationRDF(triples: TripleCounts, blockName: string, tx: Compensation, count: number = 1): void {
  const transactionName = makeCompensationTransactionName(tx);

  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.CONTAINS_TRANSACTION,
    o: transactionName
  }, count);
  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.CONTAINS_COMPENSATION,
    o: transactionName
  }, count);

  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.TYPE,
    o: URIS.OBJECT.COMPENSATION
  }, count);
}

function stepCompensation(updater: Updater, tx: Compensation): Result {
  const verifyRes = Compensation.verify(tx);

  if (isFailure(verifyRes)) {
    return {
      result: false,
      reason: "Couldn't verify a compensation: " + verifyRes.reason
    };
  }

  const integrationKey = makeIntegrationKey(tx.integration.input, tx.integration.counter);

  const foundIntegration = updater.get<IntegrationExpanded>(DATA_TYPE.INTEGRATION, integrationKey, null);

  if (foundIntegration === null) {
    return {
      result: false,
      reason: `Couldn't find integration '${integrationKey}' referenced by compensation`
    };
  }

  //TODO: this is probably broken on undo, as witnesses won't get copied, probably move this into a new data
  const foundBroker = updater.get<BrokerRegistration>(DATA_TYPE.BROKER, tx.brokerName, null);

  if (foundBroker === null) {
    return {
      result: false,
      reason: `Couldn't find broker '${tx.brokerName}' referenced by compensation`
    };
  }

  if (foundBroker.input !== tx.input) {
    return {
      result: false,
      reason: "Broker's owner doesn't match compensation's input"
    };
  }

  if (!foundIntegration.witnesses.has(tx.brokerName)) {
    return {
      result: false,
      reason: "Broker that is compensating isn't a witness for the integration"
    };
  }

  if (foundIntegration.witnesses.get(tx.brokerName)) {
    return {
      result: false,
      reason: "Broker that is compensating has already compensated"
    };
  }

  foundIntegration.witnesses.set(tx.brokerName, true);
  ++foundIntegration.compensationCount;

  if (foundIntegration.compensationCount === Math.ceil(foundIntegration.witnessCount / 2)) {
    let integrateeBalance = updater.get(DATA_TYPE.BROKER, foundIntegration.input, 0);
    for (const output of foundIntegration.outputs) {
      integrateeBalance += output.amount;
    }
    updater.set(DATA_TYPE.BALANCE, foundIntegration.input, integrateeBalance);
  }

  updater.set(DATA_TYPE.INTEGRATION, integrationKey, foundIntegration);

  genCompensationRDF(updater.store, makeBlockName(updater.prevBlock()), tx);

  return {
    result: true
  };
}

function genSensorRegistrationRDF(triples: TripleCounts, blockName: string, tx: SensorRegistration, count: number = 1): void {
  const sensorName = SensorRegistration.getSensorName(tx);

  //TODO, maybe the replacements shouldn't be to sensorName
  for (const triple of SensorRegistration.getExtraNodeMetadata(tx)) {
    addToNodeTripleCounts(triples, {
      s: uriReplacePrefix(triple.s, sensorName),
      p: uriReplacePrefix(triple.p, sensorName),
      o: uriReplacePrefix(triple.o, sensorName)
    }, count);
  }
  for (const triple of SensorRegistration.getExtraLiteralMetadata(tx)) {
    addToLiteralTripleCounts(triples, {
      s: uriReplacePrefix(triple.s, sensorName),
      p: uriReplacePrefix(triple.p, sensorName),
      o: literal(triple.o)
    }, count);
  }

  const transactionName = makeSensorTransactionName(tx);

  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.CONTAINS_TRANSACTION,
    o: transactionName
  }, count);
  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.CONTAINS_SENSOR_REGISTRATION,
    o: transactionName
  }, count);

  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.REWARDED,
    o: tx.rewardAmount
  }, count);

  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.TYPE,
    o: URIS.OBJECT.SENSOR_REGISTRATION
  }, count);
  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.HAS_COUNTER,
    o: tx.counter
  }, count);
  addToNodeTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.IS_OWNED_BY,
    o: makeWalletName(tx.input)
  }, count);
  addToNodeTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.DEFINES,
    o: sensorName
  }, count);
  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.COSTS_PER_MINUTE,
    o: SensorRegistration.getCostPerMinute(tx)
  }, count);
  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.COSTS_PER_KB,
    o: SensorRegistration.getCostPerKB(tx)
  }, count);
  addToNodeTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.USES_BROKER,
    o: SensorRegistration.getIntegrationBroker(tx)
  }, count);
}

function stepSensorRegistration(updater: Updater, reward: string, tx: SensorRegistration):Result {
  const verifyRes = SensorRegistration.verify(tx);
  if (isFailure(verifyRes)) {
    return {
      result: false,
      reason: "Couldn't verify a sensor registration: " + verifyRes.reason
    };
  }

  const foundBroker = updater.get(DATA_TYPE.BROKER, SensorRegistration.getIntegrationBroker(tx), null);

  if (foundBroker === null) {
    return {
      result: false,
      reason: "Couldn't find sensor registration's nominated broker in the broker list"
    };
  }

  if (tx.counter <= updater.get(DATA_TYPE.COUNTER, tx.input, 0)) {
    return {
      result: false,
      reason: "Sensor registration has invalid counter"
    };
  }
  updater.set(DATA_TYPE.COUNTER, tx.input, tx.counter);

  const inputBalance = updater.get(DATA_TYPE.BALANCE, tx.input, 0);
  if (inputBalance < tx.rewardAmount) {
    return {
      result: false,
      reason: "Sensor registration rewarding more than they have"
    };
  }
  updater.set(DATA_TYPE.BALANCE, tx.input, inputBalance - tx.rewardAmount);

  updater.plus(DATA_TYPE.BALANCE, reward, 0, tx.rewardAmount);

  const sensorName = SensorRegistration.getSensorName(tx);

  const foundExistingSensor = updater.get(DATA_TYPE.SENSOR, sensorName, null);

  if (foundExistingSensor !== null) {
    if (foundExistingSensor.input !== tx.input) {
      return {
        result: false,
        reason: "A sensor has already been defined with this name"
      };
    }
  }

  updater.set(DATA_TYPE.SENSOR, sensorName, tx);

  genSensorRegistrationRDF(updater.store, makeBlockName(updater.prevBlock()), tx);

  return {
    result: true
  };
}

function genBrokerRegistrationRDF(triples: TripleCounts, blockName: string, tx: BrokerRegistration, count: number = 1): void {
  //TODO, maybe the replacements shouldn't be to brokerName
  const brokerName = BrokerRegistration.getBrokerName(tx);

  for (const triple of BrokerRegistration.getExtraNodeMetadata(tx)) {
    addToNodeTripleCounts(triples, {
      s: uriReplacePrefix(triple.s, brokerName),
      p: uriReplacePrefix(triple.p, brokerName),
      o: uriReplacePrefix(triple.o, brokerName)
    }, count);
  }
  for (const triple of BrokerRegistration.getExtraLiteralMetadata(tx)) {
    addToLiteralTripleCounts(triples, {
      s: uriReplacePrefix(triple.s, brokerName),
      p: uriReplacePrefix(triple.p, brokerName),
      o: literal(triple.o)
    }, count);
  }

  const transactionName = makeBrokerTransactionName(tx);

  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.CONTAINS_TRANSACTION,
    o: transactionName
  }, count);
  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.CONTAINS_BROKER_REGISTRATION,
    o: transactionName
  }, count);

  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.REWARDED,
    o: tx.rewardAmount
  }, count);

  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.TYPE,
    o: URIS.OBJECT.BROKER_REGISTRATION
  }, count);
  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.HAS_COUNTER,
    o: tx.counter
  }, count);
  addToNodeTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.IS_OWNED_BY,
    o: makeWalletName(tx.input)
  }, count);
  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.DEFINES,
    o: brokerName
  }, count);
  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.HAS_ENDPOINT,
    o: BrokerRegistration.getEndpoint(tx)
  }, count);
}

function stepBrokerRegistration(updater: Updater, reward: string, tx: BrokerRegistration): Result {
  const verifyRes = BrokerRegistration.verify(tx);
  if (isFailure(verifyRes)) {
    return {
      result: false,
      reason: "Couldn't verify a broker registration: " + verifyRes.reason
    };
  }

  if (tx.counter <= updater.get(DATA_TYPE.COUNTER, tx.input, 0)) {
    return {
      result: false,
      reason: "Broker registration has invalid counter"
    };
  }
  updater.set(DATA_TYPE.COUNTER, tx.input, tx.counter);

  const inputBalance = updater.get(DATA_TYPE.BALANCE, tx.input, 0);
  if (inputBalance < tx.rewardAmount) {
    return {
      result: false,
      reason: "Broker registration rewarding more than they have"
    };
  }
  updater.set(DATA_TYPE.BALANCE, tx.input, inputBalance - tx.rewardAmount);

  updater.plus(DATA_TYPE.BALANCE, reward, 0, tx.rewardAmount);

  const brokerName = BrokerRegistration.getBrokerName(tx);

  const foundExistingBroker = updater.get(DATA_TYPE.BROKER, brokerName, null);

  if (foundExistingBroker !== null) {
    if (foundExistingBroker.input !== tx.input) {
      return {
        result: false,
        reason: "A broker has already been defined with this name"
      };
    }
  }

  updater.set(DATA_TYPE.BROKER,BrokerRegistration.getBrokerName(tx), tx);

  genBrokerRegistrationRDF(updater.store, makeBlockName(updater.prevBlock()), tx);

  return {
    result: true
  };
}

function genBlockRDF(triples: TripleCounts, block: Block, prevBlock: Block) : void {
  const blockName = makeBlockName(block);
  const prevBlockName = makeBlockName(prevBlock);

  genBlockHeaderRDF(triples, block, prevBlockName, -1);

  for (const tx of Block.getPayments(block)) {
    genPaymentRDF(triples, blockName, tx, -1);
  }
  for (const tx of Block.getIntegrations(block)) {
    genIntegrationRDF(triples, blockName, tx, -1);
  }
  for (const tx of Block.getCompensations(block)) {
    genCompensationRDF(triples, blockName, tx, -1);
  }
  for (const tx of Block.getSensorRegistrations(block)) {
    genSensorRegistrationRDF(triples, blockName, tx, -1);
  }
  for (const tx of Block.getBrokerRegistrations(block)) {
    genBrokerRegistrationRDF(triples, blockName, tx, -1);
  }
}
function verifyTxs(updater: Updater, reward: string, payments: Payment[], sensorRegistrations: SensorRegistration[], brokerRegistrations: BrokerRegistration[], integrations: Integration[], compensations: Compensation[]): Result {
  updater.plus(DATA_TYPE.BALANCE, reward, 0, MINING_REWARD);

  for (const payment of payments) {
    const res = stepPayment(updater, reward, payment);
    if (!res.result) {
      return res;
    }
  }

  for (const integration of integrations) {
    const res = stepIntegration(updater, reward, integration);
    if (!res.result) {
      return res;
    }
  }

  for (const compensation of compensations) {
    const res = stepCompensation(updater, compensation);
    if (!res.result) {
      return res;
    }
  }

  for (const brokerRegistration of brokerRegistrations) {
    const res = stepBrokerRegistration(updater, reward, brokerRegistration);
    if (!res.result) {
      return res;
    }
  }

  for (const sensorRegistration of sensorRegistrations) {
    const res = stepSensorRegistration(updater, reward, sensorRegistration);
    if (!res.result) {
      return res;
    }
  }

  return {
    result: true,
  };
}

function verifyBlockHash(prevBlock: Block, block: Block): Result {
  if (block.lastHash !== prevBlock.hash) {
    return {
      result: false,
      reason: "last hash didn't match our last hash"
    };
  }
  //TODO how to check if new block's timestamp is believable
  if (block.difficulty !== Block.adjustDifficulty(prevBlock, block.timestamp)) {
    return {
      result: false,
      reason: "difficulty is incorrect"
    };
  }
  if (!Block.checkHash(block)) {
    return {
      result: false,
      reason: "hash is invalid failed"
    };
  }

  return {
    result: true
  };
}

function verifyBlock(updater: Updater, verifyingBlock: Block): Result {
  const verifyHashRes = verifyBlockHash(updater.prevBlock(), verifyingBlock);

  if (!verifyHashRes.result) {
    return verifyHashRes;
  }

  updater.newBlock(verifyingBlock);

  return verifyTxs(updater, verifyingBlock.reward,
    Block.getPayments(verifyingBlock),
    Block.getSensorRegistrations(verifyingBlock),
    Block.getBrokerRegistrations(verifyingBlock),
    Block.getIntegrations(verifyingBlock),
    Block.getCompensations(verifyingBlock));
}

function verifyBlocks(updater: Updater, blocks: Block[]) : Result {
  if (blocks.length === 0) {
    return {
      result: false,
      reason: "zero length"
    };
  }

  for (let i = 0; i < blocks.length; i++) {
    const verifyResult = verifyBlock(updater, blocks[i]);

    if (verifyResult.result === false) {
      return {
        result: false,
        reason: `Chain is invalid at block ${i}: ${verifyResult.reason}`
      };
    }
  }

  return {
    result: true
  };
}

function onChange(blockchain: Blockchain, newBlocks: Block[], changes: UpdaterChanges, difference: number): void {
  for (const listener of blockchain.listeners) {
    listener(newBlocks, changes, difference);
  }
}

function onInitFinish(updater: Updater, i: number, maxI: number, err: Error, cb: (err: Error)=>void): void {
  if (err) {
    cb(err);
    return;
  }
  if (i % 100 === 0) {
    //require('v8').writeHeapSnapshot();
  }

  if (i + 1 < maxI) {
    updater.parent.persistence.readBlock(i + 1, (err: Error, data:object) => onInitRead(updater, i + 1, maxI, err, data, cb));
  } else {
    cb(null);
  }
}

function onInitRead(updater: Updater, i: number, maxI: number, err: Error, data: object, cb: (err:Error)=>void) {
  if (err) {
    cb(err);
    return;
  }

  const res = verifyBlock(updater, (data as ChainLink).block);
  if (isFailure(res)) {
    cb(new Error(res.reason));
  } else {
    updater.finish(false, (err) => onInitFinish(updater, i, maxI, err, cb));
  }
}

type CheckForDivergenceCb = (err: Error, i: number)=>void;

function handleCheckForDivergenceImplRead(chain: Blockchain, i: number, blocks: Block[], startIndex: number, cb: CheckForDivergenceCb, err: Error, data: ChainLink) {
  if (err) {
    cb(err, null);
    return;
  }

  if (data.block.hash !== blocks[i].hash) {
    cb(null, i);
  } else {
    checkForDivergenceImpl(chain, i + 1, blocks, startIndex, cb);
  }
}

function checkForDivergenceImpl(chain: Blockchain, i: number, blocks: Block[], startIndex: number, cb: CheckForDivergenceCb) {
  if (i >= blocks.length) {
    setImmediate(() => cb(null, blocks.length));
    return;
  }
  if (i + startIndex >= chain.linksStartI + chain.links.length) {
    setImmediate(() => cb(null, i));
    return;
  }
  if (i + startIndex >= chain.linksStartI) {
    while (i < blocks.length && i + startIndex < chain.linksStartI + chain.links.length) {
      if (chain.links[i + startIndex - chain.linksStartI].block.hash !== blocks[i].hash) {
        setImmediate(() => cb(null, i));
        return;
      }
      i++;
    }
    setImmediate(() => cb(null, i));
  } else {
    chain.persistence.readBlock(startIndex + i, (err, data) => handleCheckForDivergenceImplRead(chain, i, blocks, startIndex, cb, err, data as ChainLink));
  }
}

interface OpResultFailure extends ResultFailure {
  code: Error_replacechain;
}

type OpResult = ResultSuccess | OpResultFailure;

type OpCb = (result: OpResult) => void;

type OpFunc = (chain: Blockchain) => void;
interface Op {
  op: OpFunc;
}

class ReplaceChainOp implements Op {
  op: OpFunc;
  newChain: Block[];
  startI: number;
  cb: OpCb;
  accumulatedUndos: Datas;
  constructor(newChain: Block[], startI: number, cb: OpCb) {
    this.op = replaceImpl;
    this.newChain = newChain;
    this.startI = startI;
    this.cb = cb;
    this.accumulatedUndos = genDatas();
  }
}

function opFinish(blockchain: Blockchain): void {
  blockchain.queue.shift();
  if (blockchain.queue.length > 0) {
    blockchain.queue[0].op(blockchain);
  }
}

function replaceImpl(blockchain: Blockchain): void {
  const op = blockchain.queue[0] as ReplaceChainOp;

  if (op.newChain.length + op.startI <= blockchain.linksStartI + blockchain.links.length) { //if the new chain wouldn't be longer than the current
    setImmediate(() => op.cb({ //error
      result: false,
      code: ERROR_REPLACECHAIN.SHORTER,
      reason: "Received chain is not longer than the current chain."
    }));
    return;
  }
  if (op.startI > blockchain.linksStartI + blockchain.links.length) { //if we start before what we have in memory
    setImmediate(() => op.cb({ //error
      result: false,
      code: ERROR_REPLACECHAIN.OVERLAP,
      reason: `NewBlocks start after our current chain ends, we're missing bits in the middle. op.startI: ${op.startI}, blockchain.linksStartI: ${blockchain.linksStartI}, blockchain.links.length: ${blockchain.links.length}`
    }));
    return;
  }

  //as newblocks must be longer then current, we start from current and walk backwards
  //start with blocks in memory, then start reading from disk (when we implement it)

  let index = blockchain.linksStartI + blockchain.links.length; //current block we're looking at

  const updater = new Updater(blockchain);

  while (index > 0) { //while we have blocks to look at
    if (index < op.startI) { //if we are looking at blocks before what we have in memory
      setImmediate(() => { //NYI, error
        op.cb({
          result: false,
          code: ERROR_REPLACECHAIN.DIVERGENCE,
          reason: `Received chain diverges from our chain before received chain's start. recved chain start: ${op.startI}`
        });
        process.exit(-1);
      });
      return;
    }
    if (index > blockchain.linksStartI + 1) { //if links in memory. +1 as we need to be able to access the block before this for prevblock rdf reasons
      if (blockchain.links[index - blockchain.linksStartI - 1].block.hash !== op.newChain[index - op.startI].lastHash) { //if the hashes don't match, so we are still divergent
        updater.undoBlock();
      } else { //else we've found where we have a common ancestor, so we replace everything from here
        const res = verifyBlocks(updater, op.newChain.slice(index - op.startI)); //verify the blocks
        if (isFailure(res)) { //if verify failed
          setImmediate(() => op.cb({ //error
            result: false,
            code: ERROR_REPLACECHAIN.VERIFY,
            reason: res.reason
          }));
          return;
        }

        updater.finish(true, (err, newLinks, changes) => { //finish the update
          if (err) { //if the update errored
            op.cb({ //error
              result: false,
              code: ERROR_REPLACECHAIN.UPDATER,
              reason: err.message
            });
            return;
          }

          //post here, we've succeeded

          //apply rdf changes



          const newBlocks : Block[] = []; //make blocks array
          for (const link of newLinks) { //for every link
            newBlocks.push(link.block); //add it to newBlocks
          }

          onChange(blockchain, newBlocks, changes, blockchain.linksStartI + blockchain.links.length - newBlocks.length); //call handlers
          op.cb({ //and cb with success
            result: true
          });
        });
        return;
      }
    } else { //if links out of memory
      //we currently don't do this, return an error
      setImmediate(() => op.cb({
        result: false,
        code: ERROR_REPLACECHAIN.CACHED,
        reason: "We currently can't replace the chain if the divergence happens out of memory"
      }));
      return;
    }
    --index;
  }

  //if we get here, we're diverging at genesis
  
  const res = verifyBlocks(updater, op.newChain); //verify blocks
  if (isFailure(res)) {
    setImmediate(() => op.cb({
      result: false,
      code: ERROR_REPLACECHAIN.VERIFY,
      reason: res.reason
    }));
    return;
  }
  updater.finish(true, (err, newLinks, changes) => { //update
    if (err) {
      op.cb({
        result: false,
        code: ERROR_REPLACECHAIN.UPDATER,
        reason: err.message
      });
      return;
    }

    const newBlocks = [];
    for (const link of newLinks) {
      newBlocks.push(link.block);
    }

    onChange(blockchain, newBlocks, changes, 0);
    op.cb({
      result: true
    });
  });
}

class AddBlockOp implements Op {
  op: OpFunc;
  newBlock: Block;
  cb: OpCb;
  constructor(newBlock: Block, cb: OpCb) {
    this.op = addBlockImpl;
    this.newBlock = newBlock;
    this.cb = cb;
  }
}

function addBlockImpl(blockchain: Blockchain): void {
  const op = blockchain.queue[0] as AddBlockOp;

  const updater = new Updater(blockchain);

  const verifyResult = verifyBlock(updater, op.newBlock);

  if (isFailure(verifyResult)) {
    setImmediate(() => op.cb({
      result: false,
      code: ERROR_REPLACECHAIN.VERIFY,
      reason: verifyResult.reason
    }));
    return;
  }

  updater.finish(true, (err: Error, newLinks: ChainLink[], changes) => {
    if (err) {
      op.cb({
        result: false,
        code: ERROR_REPLACECHAIN.UPDATER,
        reason: err.message
      });
      return;
    }


    const newBlocks : Block[] = [];
    for (const link of newLinks) {
      const block = link.block;
      newBlocks.push(block);
    }

    onChange(blockchain, newBlocks, changes, blockchain.linksStartI + blockchain.links.length - 1);
    op.cb({
      result: true
    });
  });

  return;
}

type Listener = (newBlocks: Block[], changes: UpdaterChanges, difference: number) => void;

class Blockchain {
  static MAX_BLOCKS_IN_MEMORY = MAX_BLOCKS_IN_MEMORY;

  static ERROR_REPLACEHCHAIN = ERROR_REPLACECHAIN;

  data: Datas;
  links: ChainLink[];
  linksStartI: number;
  listeners: Listener[];
  persistence: Persistence;
  queue: Op[];
  store: TripleCounts;
  fuseki_location: string | null;

  constructor(persistence: Persistence, fuseki_location: string | null, readyCb: (err:Error)=>void) {
    this.data = genDatas();
    this.links = [];
    this.linksStartI = 0;
    this.listeners = [];
    this.persistence = persistence;
    this.queue = [];
    this.fuseki_location = fuseki_location;

    this.store = genTripleCounts();

    const blockCount = this.persistence.blockCount();

    const updater = new Updater(this);

    if (blockCount > 0) {
      this.persistence.readBlock(0, (err: Error, data: object) => onInitRead(updater, 0, blockCount, err, data, readyCb));
    } else {
      setImmediate(() => readyCb(null));
    }
  }

  get<T>(type: Data_type, key: string, _default: T): T {
    return getDatas<T>(type, key, _default, [this.data]);
  }

  getAll<T>(type: Data_type): Map<string,T> {
    return this.data[type] as Map<string,T>;
  }

  getBalanceCopy(publicKey: string): number {
    return this.get<number>(DATA_TYPE.BALANCE, publicKey, 0);
  }

  getSensorInfo(sensorName: string): SensorRegistration {
    return this.get<SensorRegistration>(DATA_TYPE.SENSOR, sensorName, null);
  }

  getSensors(): Map<string, SensorRegistration> {
    return this.getAll<SensorRegistration>(DATA_TYPE.SENSOR);
  }

  getBrokerInfo(brokerName: string): BrokerRegistration {
    return this.get<BrokerRegistration>(DATA_TYPE.BROKER, brokerName, null);
  }
  getCounterCopy(publicKey: string): number {
    return this.get<number>(DATA_TYPE.COUNTER, publicKey, 0);
  }

  getIntegration(integrationKey: string): IntegrationExpanded {
    return this.get<IntegrationExpanded>(DATA_TYPE.INTEGRATION, integrationKey, null);
  }

  getIntegrations(): Map<string, IntegrationExpanded> {
    return this.getAll<IntegrationExpanded>(DATA_TYPE.INTEGRATION);
  }

  lastBlock() {
    if (this.links.length !== 0) {
      return this.links[this.links.length - 1].block;
    }
    return Block.genesis();
  }

  getCachedStartIndex() {
    return this.linksStartI;
  }

  length() {
    return this.linksStartI + this.links.length;
  }

  getBlock(i: number, cb: (err:Error,block:Block)=>void) {
    if (i >= this.linksStartI + this.links.length) {
      setImmediate(() => cb(new Error("i is out of range"), null));
      return;
    }
    if (i >= this.linksStartI) {
      setImmediate(() => cb(null, this.links[i - this.linksStartI].block));
    } else {
      this.persistence.readBlock(i, cb);
    }
  }

  getCachedBlocks() {
    return {
      start: this.linksStartI,
      blocks: this.links.map((x) => x.block)
    };
  }

  //adds an existing block to the blockchain, returns false if the block can't be added, true if it was added
  addBlock(newBlock: Block, cb: OpCb) {
    this.queue.push(new AddBlockOp(newBlock, (err) => {
      cb(err);
      opFinish(this);
    }));

    if (this.queue.length === 1) {
      addBlockImpl(this);
    }
  }

  wouldBeValidBlock(rewardee: string, payments: Payment[], sensorRegistrations: SensorRegistration[], brokerRegistrations: BrokerRegistration[], integrations: Integration[], compensations: Compensation[]) {
    const updater = new Updater(this);
    return verifyTxs(updater, rewardee, payments, sensorRegistrations, brokerRegistrations, integrations, compensations).result;
  }

  //static isValidChain(blocks: Block[]) {
  //  const updater = new Updater([genDatas()], [new ChainLink(Block.genesis())], 0, false);
  //  const res = verifyBlocks(updater, blocks);

  //  return res.result;
  //}

  replaceChain(newBlocks: Block[], startIndex: number, cb: OpCb): void {
    if (newBlocks.length === 0) {
      setImmediate(() => cb({
        result: false,
        code: ERROR_REPLACECHAIN.BAD_ARG,
        reason: "Recieved chain is empty"
      }));
      return;
    }

    this.queue.push(new ReplaceChainOp(newBlocks, startIndex, (err) => {
      cb(err);
      opFinish(this);
    }));

    if (this.queue.length === 1) {
      replaceImpl(this);
    }
  }

  checkForDivergence(blocks: Block[], startIndex: number, cb: (err:Error)=>void): void {
    checkForDivergenceImpl(this, 0, blocks, startIndex, cb);
  }

  addListener(listener:Listener): void {
    this.listeners.push(listener);
  }

  triples(): TripleCounts {
    return this.store;
  }
}

export default Blockchain;
export { Blockchain, type Data_type, ALL_DATA_TYPES, DATA_TYPE, type UpdaterChanges };