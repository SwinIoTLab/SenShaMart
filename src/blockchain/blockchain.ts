/**
 *    Copyright (c) 2022-2024, SenShaMart
 *
 *    This file is part of SenShaMart.
 *
 *    SenShaMart is free software: you can redistribute it and/or modify
 *    it under the terms of the GNU Lesser General Public License.
 *
 *    SenShaMart is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Lesser General Public License for more details.
 *
 *    You should have received a copy of the GNU Lesser General Public License
 *    along with SenShaMart.  If not, see <http://www.gnu.org/licenses/>.

/**
 * @author Anas Dawod e-mail: adawod@swin.edu.au
 */
import { Block, BlockTxs } from './block.js';
import { Payment as PaymentTx } from './payment.js';
import { default as SensorTx } from './sensor-registration.js';
import { default as BrokerTx } from './broker-registration.js';
import { default as CommitTx } from './commit.js';
import { Integration as IntegrationTx } from './integration.js';
//import Commit from './commit.js';
import {
  type Result,
  isFailure,
  ChainUtil,
  type LiteralMetadata,
  type NodeMetadata,
  type ResultFailure
  //type ValuedResult
} from '../util/chain-util.js';
import {
  //MINING_REWARD,
  //SENSHAMART_URI_REPLACE,
  //MINE_RATE,
  INITIAL_MINE_DIFFICULTY,
  INITIAL_COUNTER,
  INITIAL_BALANCE,
  MINING_REWARD,
  BROKER_DEAD_BUFFER_TIME_MS,
  MINUTE_MS,
  BROKER_COMMISION
} from '../util/constants.js';

import { default as Persistence} from './persistence.js';

import URIS from './uris.js';
//import { verify } from 'crypto';

//expected version of the db, if it is less than this, we need to upgrade
const DB_EXPECTED_VERSION = '3' as const;

//query to create the persistent db
const DB_CREATE_QUERY = [
`CREATE TABLE Configs(
  id INTEGER NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  value TEXT NOT NULL);`,

`INSERT INTO Configs(name,value) VALUES
  ('version','${DB_EXPECTED_VERSION}');`,

//`CREATE INDEX idx_literaltriples_spo ON LiteralTriplies(subject,predicate,object);`,

`CREATE TABLE String(
  id INTEGER NOT NULL PRIMARY KEY,
  min INTEGER NOT NULL,
  prev INTEGER NULL REFERENCES String(id));`,

`CREATE TABLE Blocks(
  id INTEGER NOT NULL PRIMARY KEY,
  string INTEGER NOT NULL REFERENCES String(id),
  depth INTEGER NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  timestamp INTEGER NOT NULL,
  lastHash TEXT NOT NULL,
  reward TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  difficulty INTEGER NOT NULL,
  raw TEXT NOT NULL,
  UNIQUE(string,depth));`,

`CREATE TABLE NodeTriples(
  depth INTEGER NOT NULL,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  value INTEGER NOT NULL);`,

`CREATE TABLE LiteralTriples(
  depth INTEGER NOT NULL,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL);`,

`CREATE UNIQUE INDEX idx_blocks_hash ON Blocks(hash);`, 
`CREATE UNIQUE INDEX idx_blocks_string_depth ON Blocks(string,depth);`,

`CREATE TABLE Head(
  id INTEGER NOT NULL PRIMARY KEY,
  block INTEGER NOT NULL REFERENCES Blocks(id),
  lastSeen INTEGER NOT NULL);`,  

`CREATE TABLE Wallet(
  string INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  key TEXT NOT NULL,
  balance INTEGER NOT NULL,
  counter INTEGER NOT NULL,
  PRIMARY KEY(string,depth,key),
  FOREIGN KEY(string,depth) REFERENCES Blocks(string,depth) ON UPDATE CASCADE);`,

`CREATE TABLE Broker(
  string INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY(string,depth,name),
  FOREIGN KEY(string,depth) REFERENCES Blocks(string,depth) ON UPDATE CASCADE);`,

`CREATE TABLE Sensor(
  string INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  hash TEXT NOT NULL,
  broker TEXT NOT NULL,
  costPerKB INTEGER NOT NULL,
  costPerMin INTEGER NOT NULL,
  PRIMARY KEY(string,depth,name),
  FOREIGN KEY(string,depth) REFERENCES Blocks(string,depth) ON UPDATE CASCADE);`,

`CREATE TABLE Integration(
  string INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  timeoutTime INTEGER NOT NULL,
  uncommittedCount INTEGER NOT NULL,
  outputsRaw TEXT NOT NULL,
  state INTEGER NOT NULL,
  PRIMARY KEY(string,depth,name),
  FOREIGN KEY(string,depth) REFERENCES Blocks(string,depth) ON UPDATE CASCADE);`,

//`CREATE UNIQUE INDEX idx_Wallet_key_depth ON Wallet(key, depth);`

//`CREATE TABLE Broker(
//  name TEXT NOT NULL,
//  depth INTEGER NOT NULL REFERENCES Blocks(depth),
//  hash TEXT NOT NULL UNIQUE,
//  parseable TEXT NOT NULL);`,

//`CREATE INDEX idx_broker_name ON Broker(name);`

//`CREATE TABLE Sensor(
//  name TEXT NOT NULL PRIMARY KEY,
//  parseable TEXT NOT NULL);`,

//`CREATE UNIQUE INDEX idx_sensor_name ON Sensor(name);`,

//`CREATE TABLE Integration(
//  id INTEGER NOT NULL PRIMARY KEY,
  //  parseable TEXT NOT NULL);`
];

//Make the key into integration datas for an integration
function makeIntegrationKey(input: string, counter: number) {
  return input + '/' + String(counter);
}

//A wallet has the balance and current counter for a wallet
class Wallet {
  counter: number;
  balance: number;
  constructor(counter: number, balance: number) {
    this.counter = counter;
    this.balance = balance;
  }

  differs(o: Wallet | null): boolean {
    return o === null
      || this.counter !== o.counter
      || this.balance !== o.balance;
  }
}

class Broker {
  owner: string;
  endpoint: string;
  hash: string;
  constructor(owner: string, endpoint: string, hash: string) {
    this.owner = owner;
    this.endpoint = endpoint;
    this.hash = hash;
  }

  differs(o: Broker | null): boolean {
    return o === null
      || this.owner !== o.owner
      || this.endpoint !== o.endpoint
      || this.hash !== o.hash;
  }
}

class Sensor {
  owner: string;
  hash: string;
  broker: string;
  costPerKB: number;
  costPerMin: number;
  constructor(owner: string, hash: string, broker: string, costPerKB: number, costPerMin: number) {
    this.owner = owner;
    this.hash = hash;
    this.broker = broker;
    this.costPerKB = costPerKB;
    this.costPerMin = costPerMin;
  }

  differs(o: Sensor | null): boolean {
    return o === null
      || this.owner !== o.owner
      || this.hash !== o.hash
      || this.broker !== o.broker
      || this.costPerKB !== o.costPerKB
      || this.costPerMin !== o.costPerMin;
  }
}

export const INTEGRATION_STATE = {
  RUNNING: 0,
  COMMITTED: 1,
  TIMED_OUT: 2
} as const;

export type Integrate_state = typeof INTEGRATION_STATE[keyof typeof INTEGRATION_STATE];

//Extra information that is held about an integration output. A cache to simplify processing
type IntegrationOutput = {
  sensorCostPerMin: number; //cost of the sensor at the time the integration started
  sensorCostPerKB: number; //cost of the sensor at the time the integration started
  broker: string; //name of broker of the sensor at the time the integration started
  brokerOwner: string; //public key of the broker of the sensor at the time the integration started
  sensorOwner: string; //public key of the sensor
  witnesses: {
    [index: string]: boolean //map of whether a (public key)->(has voted)
  };
  amount: number; //amount the buyer is paying for this output
  compensationTotal: number; //total ratio of to compensate (.e.g., 3 voted to compensate at 0.2, 0.4, and 0.5, then this would be 1.1)
}

//Extra information that is held about integrations. A cache to simplify processing
class Integration {
  owner: string; //the wallet which created this tx
  timeoutTime: number; //when this integration times out
  uncommittedCount: number; //total number of witnesses who are yet to vote to commit
  outputs: IntegrationOutput[]; //extra information for each output
  state: Integrate_state; //current state of the integration
  constructor(owner: string, timeoutTime: number, uncommittedCount: number, outputs: IntegrationOutput[], state: Integrate_state) {
    this.owner = owner;
    this.timeoutTime = timeoutTime;
    this.uncommittedCount = uncommittedCount;
    this.outputs = outputs;
    this.state = state;
  }

  differs(o: Integration | null): boolean {
    if (o === null
      || this.owner !== o.owner
      || this.timeoutTime !== o.timeoutTime
      || this.uncommittedCount !== o.uncommittedCount
      || this.outputs.length !== o.outputs.length
      || this.state !== o.state) {
      return true;
    }

    for (let i = 0; i < this.outputs.length; ++i) {
      const our = this.outputs[i];
      const their = o.outputs[i];
      if (our.sensorCostPerMin !== their.sensorCostPerMin
        || our.sensorCostPerKB !== their.sensorCostPerKB
        || our.broker !== their.broker
        || our.brokerOwner !== their.brokerOwner
        || our.sensorOwner !== their.sensorOwner
        || Object.keys(our.witnesses).length !== Object.keys(their.witnesses).length
        || our.compensationTotal !== their.compensationTotal) {
        return true;
      }
      const our_witness_keys = Object.keys(our.witnesses);
      for (const witness_key of our_witness_keys) {
        if (!Object.hasOwn(their.witnesses, witness_key)) {
          return true;
        }
        if (our.witnesses[witness_key] !== their.witnesses[witness_key]) {
          return true;
        }
      }
    }

    return false;
  }
}
//function escapeNodeMetadata(escaping: NodeMetadata): string {
//  let returning = escaping.s.replaceAll('\\', '\\\\');
//  returning += '\\n';
//  returning += escaping.p.replaceAll('\\', '\\\\');
//  returning += '\\n';
//  returning += escaping.o;
//  return returning;
//}

function findDelim(searchee: string, on: number) {
  let on_slash = false;
  for (; on < searchee.length; ++on) {
    if (!on_slash) {
      if (searchee[on] === '\\') {
        on_slash = true;
      }
    } else {
      if (searchee[on] === 'n') {
        return on - 1;
      } else {
        on_slash = false;
      }
    }
  }
  return on;
}

export function unEscapeNodeMetadata(escaping: string): NodeMetadata {
  let prevI = 0;
  let newI = findDelim(escaping, prevI);
  if (newI === escaping.length) {
    throw new Error(`Couldn't unescape triple: '${escaping}'`);
  }
  const returning_s = escaping.substring(prevI, newI).replaceAll('\\\\', '\\');
  prevI = newI + 2;
  newI = findDelim(escaping, prevI);
  if (newI === escaping.length) {
    throw new Error(`Couldn't unescape triple: '${escaping}'`);
  }
  const returning_p = escaping.substring(prevI, newI).replaceAll('\\\\', '\\');
  prevI = newI + 2;
  const returning_o = escaping.substring(prevI); 

  return {
    s: returning_s,
    p: returning_p,
    o: returning_o
  };
}

//function escapeLiteralMetadata(escaping: LiteralMetadata): string {
//  let returning = escaping.s.replaceAll('\\', '\\\\');
//  returning += '\\n';
//  returning += escaping.p.replaceAll('\\', '\\\\');
//  returning += '\\n';
//  returning += escaping.o;
//  return returning;
//}

export function unEscapeLiteralMetadata(escaping: string): LiteralMetadata {

  let prevI = 0;
  let newI = findDelim(escaping, prevI);
  if (newI === escaping.length) {
    throw new Error(`Couldn't unescape triple: '${escaping}'`);
  }
  const returning_s = escaping.substring(prevI, newI).replaceAll('\\\\', '\\');
  prevI = newI + 2;
  newI = findDelim(escaping, prevI);
  if (newI === escaping.length) {
    throw new Error(`Couldn't unescape triple: '${escaping}'`);
  }
  const returning_p = escaping.substring(prevI, newI).replaceAll('\\\\', '\\');
  prevI = newI + 2;
  const returning_o = escaping.substring(prevI);

  return {
    s: returning_s,
    p: returning_p,
    o: returning_o
  };
}

//function plusNodeRdf(updater: Updater, s: string, p: string, o: string) {
//  updater.plus(DATA_TYPE.NODE_RDF, escapeNodeMetadata({ s: s, p: p, o: o }), 0, 1);
//}
//function plusLiteralRdf(updater: Updater, s: string, p: string, o: string) {
//  updater.plus(DATA_TYPE.LITERAL_RDF, escapeLiteralMetadata({ s: s, p: p, o: o }), 0, 1);
//}

//generate empty datas without db id
//function genDatas(): Datas {
//  return {
//    WALLET: new Map<string, Wallet>(),
//    SENSOR: new Map<string, SensorRegistration>(),
//    BROKER: new Map<string, BrokerRegistration>(),
//    INTEGRATION: new Map<string, IntegrationExpanded>(),
//    NODE_RDF: new Map<string, number>(),
//    LITERAL_RDF: new Map<string, number>()
//  };
//}

//merge a datas into another
//function mergeData<K, V>(from: Map<K, V>, to: Map<K, V>) {
//  for (const [key, value] of from.entries()) {
//    if (value === null) {
//      to.delete(key);
//    } else {
//      to.set(key, value);
//    }
//  }
//}

//function mergeDatas(from: Datas, to: Datas) {
//  mergeData(from.WALLET, to.WALLET);
//  mergeData(from.SENSOR, to.SENSOR);
//  mergeData(from.BROKER, to.BROKER);
//  mergeData(from.INTEGRATION, to.INTEGRATION);
//  mergeData(from.NODE_RDF, to.NODE_RDF);
//  mergeData(from.LITERAL_RDF, to.LITERAL_RDF);
//}

//get a value from a particular type of datas
//function getDatas<T>(type: Data_type, key: string, _default: T, datas: Datas[], parent: DatasWithDbId): T {
//  for (const data of datas) {
//    if (data[type].has(key)) {
//      return makeCopy(data[type].get(key) as T);
//    }
//  }
//  if (parent[type].has(key)) {
//    return makeCopy(parent[type].get(key).base as T);
//  }
//  return _default;
//}

//do something for a every instance of a particular type of datas
//function forEveryData<T>(type: Data_type, datas: Datas[], parent: DatasWithDbId, transform: (k:string, v:T)=>void) {
//  for (const data of datas) {
//    for (const [key, value] of data[type]) {
//      transform(key, value as T);
//    }
//  }
//  for (const [key, value] of parent[type]) {
//    transform(key, value.base as T);
//  }
//}

function makeBlockName(hash: string): string {
  return URIS.OBJECT.BLOCK + '/' + hash;
}

//function makePaymentTransactionName(payment: Payment): string {
//  return URIS.OBJECT.PAYMENT_TX + '/' + ChainUtil.hash(Payment.toHash(payment));
//}

//function makeIntegrationTransactionName(integration: Integration): string {
//  return URIS.OBJECT.INTEGRATION_TX + '/' + ChainUtil.hash(Integration.toHash(integration));
//}

//function makeCommitTransactionName(commit: Commit): string {
//  return URIS.OBJECT.COMPENSATION_TX + '/' + ChainUtil.hash(Commit.toHash(commit));
//}

//function makeSensorTransactionName(sensorRegistration: SensorRegistration): string {
//  return URIS.OBJECT.SENSOR_REGISTRATION_TX + '/' + ChainUtil.hash(SensorRegistration.toHash(sensorRegistration));
//}

//function makeBrokerTransactionName(brokerName: BrokerRegistration): string {
//  return URIS.OBJECT.BROKER_REGISTRATION_TX + '/' + ChainUtil.hash(BrokerRegistration.toHash(brokerName));
//}

//function makeWalletName(input: string): string {
//  return URIS.OBJECT.WALLET + '/' + input;
//}

//creates RDF triples to describe a block header
//function genBlockHeaderRDF(updater: Updater, block: Block): void {
//  const blockName = makeBlockName(block.hash);
//  const prevBlockName = makeBlockName(block.lastHash);


//  plusLiteralRdf(updater, blockName, URIS.PREDICATE.TYPE, URIS.OBJECT.BLOCK);
//  plusNodeRdf(updater, blockName, URIS.PREDICATE.LAST_BLOCK, prevBlockName);
//  plusNodeRdf(updater, blockName, URIS.PREDICATE.MINED_BY, makeWalletName(block.reward));
//}

//this object carries all state needed to update a chain
//class Updater {
//  parent: Blockchain; //the blockchain it's updating
//  links: ChainLink[]; //new links it's adding
//  prevData: Datas; //previous steps datas
//  curData: Datas; //current steps datas
//  startIndex: number; //where the new links are inserting
//  on: number; //index in the chain we're currently on
//  constructor(parent: Blockchain) {
//    this.parent = parent;
//    this.links = [];
//    this.prevData = genDatas();
//    this.curData = genDatas();
//    this.startIndex = parent.length();
//    this.on = this.startIndex;
//  }

//  //add a new block
//  newBlock(block: Block): void {
//    if (this.links.length >= MAX_BLOCKS_IN_MEMORY) {
//      this.links.shift();
//    }
//    this.links.push(new ChainLink(block));
//    this.on++;

//    mergeDatas(this.curData, this.prevData);
//    this.curData = genDatas();

//    genBlockHeaderRDF(this, block);
//  }

//  //remove a block
//  undoBlock(): void {
//    if (this.on === 0) {
//      console.error("Tried to undo beyond genesis");
//      process.exit(-1);
//    }

//    const undoing = this.prevLink();
//    this.on--;
//    if (this.on < this.startIndex) {
//      this.startIndex = this.on;
//    }

//    mergeDatas(this.curData, this.prevData);
//    this.curData = genDatas();
//    mergeDatas(undoing.undos, this.prevData);

//    if (this.links.length > 0) {
//      this.links.pop();
//    }
//  }

//  //get a datum
//  get<T>(type: Data_type, key: string, _default: T): T {
//    return getDatas(type, key, _default, [this.curData, this.prevData], this.parent.data);
//  }

//  //set a datum
//  set<T>(type: Data_type, key: string, value: T): void {
//    const existing = getDatas(type, key, null, [this.prevData], this.parent.data);

//    (this.curData[type] as Map<string,T>).set(key, value);

//    if (this.links.length !== 0) {
//      //if this value is same as before this block, remove any undo if it exists and return early
//      if (typeof existing === "number" && typeof value === "number") {
//        if (existing == value) {
//          this.links[this.links.length - 1].undos[type].delete(key);
//          return;
//        }
//      }
//      //otherwise set the undo
//      this.links[this.links.length - 1].undos[type].set(key, existing);
//    }
//  }

//  //add a numeric value to an existing numeric value
//  plus(type: Data_type, key: string, _default: number, value:number): void {
//    if (value === 0) {
//      return;
//    }
//    this.set(type, key, this.get(type, key, _default) + value);
//  }

//  //get the public keys of all current brokers
//  getBrokerPublicKeys(): string[] {
//    const keys = new Set<string>();

//    forEveryData<BrokerRegistration>(DATA_TYPE.BROKER, [this.curData, this.prevData], this.parent.data, (_key, value) => {
//      keys.add(value.input);
//    });

//    return Array.from(keys);
//  }

//  //finish updating and persist the changes if persist is true
//  async persist(): Promise<UpdateFinish> {
//    //persist blockchain first
//    await this.parent.persistence.run("BEGIN;");
//    try {
//      await writeBlocks(this.parent, this.startIndex, this.links);
//      return await onUpdateFinish(this);
//    } catch (err) {
//      await rollbackErr(this.parent, err);
//      throw err;
//    }
//  }
//}

//replace the SESHAMART_URI_REPLACE prefix with the sensor name, if it is prefixed
type StepperValue<T> = {
  cur: T;
  orig: T;
}
type Holder<T> = { v: T | null }
type HeldStepperValue<T> = {
  cur: Holder<T>;
  orig: T | null;
}

type IdDbRes = { id: number; };

type NewBlockInfo = {
  blockId: number;
  stringId: number;
  headId: number;
}

type StringInfo = {
  id: number;
  min: number;
};
type PathInfo = {
  id: number;
  max: number;
};

type BlockInfo = {
  id: number;
  hash: string;
  stringId: number | null;
  stringPath: PathInfo[];
  stringifiedStringPath: string;
  depth: number;
  timestamp: number;
  difficulty: number;
};

async function getWallet(persistence: Persistence, key: string, path: string): Promise<Wallet> {
  type Raw = { balance: number, counter: number };
  const raw = await persistence.get<Raw>(`
    WITH path(id,max) AS (
      SELECT json_extract(value, '$.id'),json_extract(value, '$.max') FROM json_each(?)
    )
    SELECT balance,counter
      FROM Wallet
    INNER JOIN path ON Wallet.string = path.id AND Wallet.depth < path.max
    WHERE key = ?
    ORDER BY depth DESC LIMIT 1;`, path, key);
  if (raw === undefined) {
    return new Wallet(INITIAL_COUNTER, INITIAL_BALANCE);
  } else {
    return new Wallet(raw.counter, raw.balance);
  }
}

async function getWallets(persistence: Persistence, path: string, cb: (key: string, wallet: Wallet) => void): Promise<void> {
  type Raw = { key: string, balance: number, counter: number };
  await persistence.each<Raw>(`
    WITH path(id,max) AS (
      SELECT json_extract(value, '$.id'),json_extract(value, '$.max') FROM json_each(?)
    )
    SELECT DISTINCT key, MAX(depth), balance, counter
      FROM Wallet
    INNER JOIN path ON Wallet.string = path.id AND Wallet.depth < path.max
    GROUP BY key;`, (row: Raw) => {
    cb(row.key, new Wallet(row.counter, row.balance));
  }, path);
}

async function getBroker(persistence: Persistence, key: string, path: string): Promise<Broker | null> {
  type Raw = { owner: string, endpoint: string, hash: string };
  const raw = await persistence.get<Raw>(`
    WITH path(id,max) AS (
      SELECT json_extract(value, '$.id'),json_extract(value, '$.max') FROM json_each(?)
    )
    SELECT owner,endpoint,hash
      FROM Broker
    INNER JOIN path ON Broker.string = path.id AND Broker.depth < path.max
    WHERE name = ?
    ORDER BY depth DESC LIMIT 1;`, path, key);

  if (raw === undefined) {
    return null;
  } else {
    return new Broker(raw.owner, raw.endpoint, raw.hash);
  }
}

async function getBrokers(persistence: Persistence, path: string, cb: (key: string, broker: Broker) => void): Promise<void> {
  type Raw = { name: string, owner: string, endpoint: string, hash: string };
  await persistence.each<Raw>(`
    WITH path(id,max) AS (
      SELECT json_extract(value, '$.id'),json_extract(value, '$.max') FROM json_each(?)
    )
    SELECT DISTINCT name,MAX(depth),owner,endpoint,hash
      FROM Broker
    INNER JOIN path ON Broker.string = path.id AND Broker.depth < path.max
    GROUP BY name;`, (row: Raw) => {
    cb(row.name, new Broker(row.owner, row.endpoint, row.hash));
  }, path);
}

async function getSensor(persistence: Persistence, key: string, path: string): Promise<Sensor | null> {
  type Raw = { owner: string, hash: string, broker: string, costPerKB: number, costPerMin: number };
  const raw = await persistence.get<Raw>(`
    WITH path(id,max) AS (
      SELECT json_extract(value, '$.id'),json_extract(value, '$.max') FROM json_each(?)
    )
    SELECT owner,hash,broker,costPerKB,costPerMin
      FROM Sensor
    INNER JOIN path ON Sensor.string = path.id AND Sensor.depth < path.max
    WHERE name = ?
    ORDER BY depth DESC LIMIT 1;`, path, key);
  if (raw === undefined) {
    return null;
  } else {
    return new Sensor(raw.owner, raw.hash, raw.broker, raw.costPerKB, raw.costPerMin);
  }
}

async function getSensors(persistence: Persistence, path: string, cb: (key: string, sensor: Sensor) => void): Promise<void> {
  type Raw = { name: string, owner: string, hash: string, broker: string, costPerKB: number, costPerMin: number };
  await persistence.each<Raw>(`
    WITH path(id,max) AS (
      SELECT json_extract(value, '$.id'),json_extract(value, '$.max') FROM json_each(?)
    )
    SELECT DISTINCT name,MAX(depth),owner,hash,broker,costPerKB,costPerMin
      FROM Sensor
    INNER JOIN path ON Sensor.string = path.id AND Sensor.depth < path.max
    GROUP BY name;`, (row: Raw) => {
    cb(row.name, new Sensor(row.owner, row.hash, row.broker, row.costPerKB, row.costPerMin));
  }, path);
}

async function getIntegration(persistence: Persistence, key: string, path: string): Promise<Integration | null> {
  type Raw = { owner: string, timeoutTime: number, uncommittedCount: number, outputsRaw: string, state: Integrate_state };
  const raw = await persistence.get<Raw>(`
    WITH path(id,max) AS (
      SELECT json_extract(value, '$.id'),json_extract(value, '$.max') FROM json_each(?)
    )
    SELECT owner,timeoutTime,uncommittedCount,outputsRaw,state
      FROM Integration
    INNER JOIN path ON Integration.string = path.id AND Integration.depth < path.max
    WHERE name = ?
    ORDER BY depth DESC LIMIT 1;`, path, key);
  if (raw === undefined) {
    return null;
  } else {
    return new Integration(raw.owner, raw.timeoutTime, raw.uncommittedCount, JSON.parse(raw.outputsRaw) as IntegrationOutput[], raw.state);
  }
}

async function getIntegrations(persistence: Persistence, path: string, cb: (key: string, integration: Integration) => void): Promise<void> {
  type Raw = { name: string, owner: string, timeoutTime: number, uncommittedCount: number, outputsRaw: string, state: Integrate_state };
  await persistence.each<Raw>(`
    WITH path(id,max) AS (
      SELECT json_extract(value, '$.id'),json_extract(value, '$.max') FROM json_each(?)
    )  
    SELECT name,MAX(depth),owner,timeoutTime,uncommittedCount,outputsRaw,state
      FROM Integration
    INNER JOIN path ON Integration.string = path.id AND Integration.depth < path.max
    GROUP BY name;`, (row: Raw) => {
    cb(row.name, new Integration(row.owner, row.timeoutTime, row.uncommittedCount, JSON.parse(row.outputsRaw) as IntegrationOutput[], row.state));
  }, path);
}

type Getter<T> = (persistence: Persistence, key: string, path: string) => Promise<T | null>;

type RetrievedValue<T> = {
  headHash: string;
  val: T;
};

class Stepper {
  cache: {
    wallet: Map<string, StepperValue<Wallet> | Promise<StepperValue<Wallet>>>;
    broker: Map<string, HeldStepperValue<Broker> | Promise<HeldStepperValue<Broker>>>;
    sensor: Map<string, HeldStepperValue<Sensor> | Promise<HeldStepperValue<Sensor>>>;
    integration: Map<string, HeldStepperValue<Integration> | Promise<HeldStepperValue<Integration>>>;
    brokerPublicKeys: string[] | null;
    curBlockDifficulty: number;
  };
  persistence: Persistence;
  prevBlockInfo: BlockInfo;

  constructor(persistence: Persistence) {
    this.persistence = persistence;
    this.cache = {
      wallet: new Map<string, StepperValue<Wallet> | Promise<StepperValue<Wallet>>>(),
      broker: new Map<string, HeldStepperValue<Broker> | Promise<HeldStepperValue<Broker>>>(),
      sensor: new Map<string, HeldStepperValue<Sensor> | Promise<HeldStepperValue<Sensor>>>(),
      integration: new Map<string, HeldStepperValue<Integration> | Promise<HeldStepperValue<Integration>>>(),
      brokerPublicKeys: null,
      curBlockDifficulty: INITIAL_MINE_DIFFICULTY
    };
    this.prevBlockInfo = {
      id: 0,
      hash: Block.genesis().hash,
      stringId: null,
      depth: 0,
      timestamp: Block.genesis().timestamp,
      difficulty: INITIAL_MINE_DIFFICULTY,
      stringPath: [],
      stringifiedStringPath: "[]"
    };
  }

  getPrevBlockHash(): string {
    return this.prevBlockInfo.hash;
  }
  getPrevBlockPath(): string {
    return this.prevBlockInfo.stringifiedStringPath;
  }
  getPrevBlockDepth(): number {
    return this.prevBlockInfo.depth;
  }

  async setPrevBlock(prevBlockHash: string): Promise<Result> {
    type ReadPrevBlockInfo = {
      id: number;
      string: number | null;
      depth: number;
      timestamp: number;
      difficulty: number;
    };

    if (prevBlockHash !== this.prevBlockInfo.hash) {
      this.cache.wallet.clear();
      this.cache.broker.clear();
      this.cache.sensor.clear();
      this.cache.integration.clear();
      this.cache.brokerPublicKeys = [];

      if (prevBlockHash === Block.genesis().hash) {
        this.prevBlockInfo.id = 0;
        this.prevBlockInfo.hash = Block.genesis().hash;
        this.prevBlockInfo.stringId = null;
        this.prevBlockInfo.stringPath = [];
        this.prevBlockInfo.stringifiedStringPath = "[]";
        this.prevBlockInfo.depth = 0;
        this.prevBlockInfo.timestamp = Block.genesis().timestamp;
        this.prevBlockInfo.difficulty = INITIAL_MINE_DIFFICULTY;
      } else {
        const readPrevBlockInfo = await this.persistence.get<ReadPrevBlockInfo>("SELECT id,string,depth,timestamp,difficulty FROM Blocks WHERE hash = ?;", prevBlockHash);

        if (readPrevBlockInfo === undefined) {
          //we can't find this block's prev block, we can't add this block
          return {
            result: false,
            reason: "Can't find prev block"
          };
        } else {
          const stringPath = await this.persistence.all<StringInfo>(`
            WITH string_walk(id,min,prev) AS (
              SELECT e.id,e.min,e.prev FROM String AS e WHERE e.id = ?
              UNION ALL
              SELECT c.id,c.min,c.prev FROM String AS c
              INNER JOIN string_walk AS p ON c.id = p.prev
            )
            SELECT id,min FROM string_walk
            ORDER BY min ASC;`, readPrevBlockInfo.string);

          if (stringPath.length === 0) {
            //??????
            throw new Error(`No strings found while trying to find path for block with hash '${prevBlockHash}'`);
          }

          this.prevBlockInfo.id = readPrevBlockInfo.id;
          this.prevBlockInfo.hash = prevBlockHash;
          this.prevBlockInfo.stringId = readPrevBlockInfo.string;
          this.prevBlockInfo.stringPath = [];
          for (let i = 0; i < stringPath.length - 1; ++i) {
            this.prevBlockInfo.stringPath.push({
              id: stringPath[i].id,
              max: stringPath[i + 1].min
            });
          }
          this.prevBlockInfo.stringPath.push({
            id: stringPath[stringPath.length - 1].id,
            max: readPrevBlockInfo.depth + 1 //+1 so that the prevBlock is included when searching for data
            });
          this.prevBlockInfo.stringifiedStringPath = JSON.stringify(this.prevBlockInfo.stringPath);
          this.prevBlockInfo.depth = readPrevBlockInfo.depth;
          this.prevBlockInfo.timestamp = readPrevBlockInfo.timestamp;
          this.prevBlockInfo.difficulty = readPrevBlockInfo.difficulty;
        }
      }
    }

    return {
      result: true
    };
  }

  async addBlock(block: Block): Promise<Result> {
    //verify block, if it fails we don't need to go into a transaction
    let res = Block.verify(block);

    if (isFailure(res)) {
      res.reason = "Block failed verify\n" + res.reason;
      return res;
    }

    //from here, we require information from the prev block, so we need a transaction
    await this.persistence.run("BEGIN;");
    //check if this block is already in the db, if it is, we fail
    if (await this.persistence.get("SELECT 1 FROM Blocks WHERE hash = ?;", block.hash) !== undefined) {
      await this.persistence.run("ROLLBACK;");
      return {
        result: false,
        reason: "Block already exists",
      };
    } 

    //get our prev block info
    res = await this.setPrevBlock(block.lastHash);
    if (isFailure(res)) {
      await this.persistence.run("ROLLBACK");
      res.reason = "Couldn't add block, failed setPrevBlock\n" + res.reason;
      return res;
    }

    //we now have prev block info, calc the difficulty for this block and finish checking the block
    this.cache.curBlockDifficulty = Block.adjustDifficulty(this.prevBlockInfo.timestamp, this.prevBlockInfo.difficulty, block.timestamp);

    if (isFailure(res = Block.checkHashDifficulty(block, this.cache.curBlockDifficulty))) {
      await this.persistence.run("ROLLBACK;");
      res.reason = "Block failed hash difficulty check\n" + res.reason;
      return res;
    }

    //step txs here
    if (isFailure(res = await this.stepTxs(block.reward, block.timestamp, makeBlockName(block.hash), block.txs))) {
      await this.persistence.run("ROLLBACK;");
      res.reason = "Failed step txs: " + res.reason;
      return res;
    }

    let newBlockInfo: NewBlockInfo = {
      blockId: 0,
      headId: 0,
      stringId: 0
    };

    //if we got to here, we're going to persist, so start creating a head if we need it, and write block to persistence
    if (this.prevBlockInfo.stringId === null) {
      //the prev block wasn't a head, so we will be creating a new string
      newBlockInfo = await this.createHeadAndString(block);
    } else {
      const headId = await this.persistence.get<IdDbRes>("SELECT id FROM Head WHERE block = ?;", this.prevBlockInfo.id);
      if (headId === undefined) {
        newBlockInfo = await this.createHeadAndString(block);
      } else {
        newBlockInfo.headId = headId.id;
        newBlockInfo.blockId = await this.insertBlock(block, this.prevBlockInfo.depth + 1, this.prevBlockInfo.stringId) as number;
        newBlockInfo.stringId = this.prevBlockInfo.stringId;
        await this.persistence.run("UPDATE Head SET lastSeen = unixepoch(), block = ? WHERE id = ?;", newBlockInfo.blockId, headId.id);
      }
    }

    //write all state to db if it's changed

    for (const [key, wallet] of this.cache.wallet.entries()) {
      if (!(wallet instanceof Promise) && wallet.cur.differs(wallet.orig)) {
        await this.persistence.run("INSERT INTO Wallet(string,depth,key,balance,counter) VALUES (?,?,?,?,?);",
          newBlockInfo.stringId, this.prevBlockInfo.depth + 1, key, wallet.cur.balance, wallet.cur.counter);
      }
    }
    for (const [key, broker] of this.cache.broker.entries()) {
      if (!(broker instanceof Promise) && broker.cur.v !== null && broker.cur.v.differs(broker.orig)) {
        await this.persistence.run("INSERT INTO Broker(string,depth,name,owner,endpoint,hash) VALUES (?,?,?,?,?,?);",
          newBlockInfo.stringId, this.prevBlockInfo.depth + 1, key, broker.cur.v.owner, broker.cur.v.endpoint, broker.cur.v.hash);
      }
    }
    for (const [key, sensor] of this.cache.sensor.entries()) {
      if (!(sensor instanceof Promise) && sensor.cur.v !== null && sensor.cur.v.differs(sensor.orig)) {
        await this.persistence.run("INSERT INTO Sensor(string,depth,name,owner,hash,broker,costPerKB,costPerMin) VALUES (?,?,?,?,?,?,?,?);",
          newBlockInfo.stringId, this.prevBlockInfo.depth + 1, key, sensor.cur.v.owner, sensor.cur.v.hash, sensor.cur.v.broker, sensor.cur.v.costPerKB, sensor.cur.v.costPerMin);
      }
    }
    for (const [key, integration] of this.cache.integration.entries()) {
      if (!(integration instanceof Promise) && integration.cur.v !== null && integration.cur.v.differs(integration.orig)) {
        await this.persistence.run("INSERT INTO Integration(string,depth,name,owner,timeoutTime,uncommittedCount,outputsRaw,state) VALUES (?,?,?,?,?,?,?,?);",
          newBlockInfo.stringId, this.prevBlockInfo.depth + 1, key, integration.cur.v.owner, integration.cur.v.timeoutTime,
          integration.cur.v.uncommittedCount, JSON.stringify(integration.cur.v.outputs), integration.cur.v.state);
      }
    }

    //until this point, we haven't changed any orig values, so a failure can be reset

    await this.persistence.run("COMMIT;");

    //we've commit, we now change cached values over to the new values

    this.prevBlockInfo.id = newBlockInfo.blockId;
    this.prevBlockInfo.hash = block.hash;
    this.prevBlockInfo.depth++;
    this.prevBlockInfo.timestamp = block.timestamp;
    this.prevBlockInfo.difficulty = this.cache.curBlockDifficulty;
    if (this.prevBlockInfo.stringId !== newBlockInfo.stringId) {
      this.prevBlockInfo.stringId = newBlockInfo.stringId;
      this.prevBlockInfo.stringPath.push({
        id: newBlockInfo.stringId,
        max: this.prevBlockInfo.depth + 1 //+1 so that we are included when searching for data
      });
    } else {
      this.prevBlockInfo.stringPath[this.prevBlockInfo.stringPath.length - 1].max++; //increase max by one, to include us
    }
    this.prevBlockInfo.stringifiedStringPath = JSON.stringify(this.prevBlockInfo.stringPath);
    //set orig to the cur values in all cached values
    for (const wallet of this.cache.wallet.values()) {
      if (!(wallet instanceof Promise)) {
        wallet.orig = structuredClone(wallet.cur);
        Object.freeze(wallet.orig);
      }
    }
    for (const broker of this.cache.broker.values()) {
      if (!(broker instanceof Promise)) {
        broker.orig = structuredClone(broker.cur.v);
        Object.freeze(broker.orig);
      }
    }
    for (const sensor of this.cache.sensor.values()) {
      if (!(sensor instanceof Promise)) {
        sensor.orig = structuredClone(sensor.cur.v);
        Object.freeze(sensor.orig);
      }
    }
    for(const integration of this.cache.integration.values()) {
      if (!(integration instanceof Promise)) {
        integration.orig = structuredClone(integration.cur.v);
        Object.freeze(integration.orig);
      }
    }

    return {
      result: true
    };
  }

  async checkBlock(prevBlockHash: string, reward: string, timestamp: number, txs: BlockTxs) : Promise<Result> {
    //a copy of addBlock with certain checks and committing removed
    await this.persistence.run("BEGIN;");

    //skip check of if block already exists

    const setPrevBlockRes = await this.setPrevBlock(prevBlockHash);
    if (isFailure(setPrevBlockRes)) {
      await this.persistence.run("ROLLBACK");
      setPrevBlockRes.reason = "Couldn't add block, failed setPrevBlock\n" + setPrevBlockRes.reason;
      return setPrevBlockRes;
    }

    //skip check of block header (since it doesn't exist)

    //use a block name of "" since it doesn't matter, we won't persist any rdf created
    const res = await this.stepTxs(reward, timestamp, "", txs);

    if (isFailure(res)) {
      await this.persistence.run("ROLLBACK;");
      return {
        result: false,
        reason: "Failed step txs: " + res.reason
      };
    }

    //all checks complete, we aren't persisting, so just success
    await this.persistence.run("ROLLBACK;");

    return {
      result: true
    };
  }

  reset(): void {
    for (const wallet of this.cache.wallet.values()) {
      if (!(wallet instanceof Promise)) {
        wallet.cur = structuredClone(wallet.orig);
      }
    }
    for (const broker of this.cache.broker.values()) {
      if (!(broker instanceof Promise)) {
        broker.cur.v = structuredClone(broker.orig);
      }
    }
    for (const sensor of this.cache.sensor.values()) {
      if (!(sensor instanceof Promise)) {
        sensor.cur.v = structuredClone(sensor.orig);
      }
    }
    for (const integration of this.cache.integration.values()) {
      if (!(integration instanceof Promise)) {
        integration.cur.v = structuredClone(integration.orig);
      }
    }
  }

  private async getWalletImpl(input: string): Promise<StepperValue<Wallet>> {
    let found = this.cache.wallet.get(input);
    if (found === undefined) {
      const get_promise = getWallet(this.persistence, input, this.prevBlockInfo.stringifiedStringPath).then((wallet) => {
        const adding: StepperValue<Wallet> = {
          cur: wallet,
          orig: structuredClone(wallet)
        };

        Object.freeze(adding.orig);
        this.cache.wallet.set(input, adding);

        return adding;
      });

      this.cache.wallet.set(input, get_promise);
      found = await get_promise;
    } else if (found instanceof Promise) {
      found = await found;
    }

    return found;
  }

  private async getWallet(input: string): Promise<Wallet> {
    return (await this.getWalletImpl(input)).cur;
  }

  async getOrigWallet(input: string): Promise<Wallet> {
    return (await this.getWalletImpl(input)).orig;
  }

  private async getHeldValue<T>(map: Map<string, HeldStepperValue<T> | Promise<HeldStepperValue<T>>>, key: string, getter: Getter<T>): Promise<HeldStepperValue<T>> {
    let found = map.get(key);
    if (found === undefined) {
      const got_promise = getter(this.persistence, key, this.prevBlockInfo.stringifiedStringPath).then((got) => {
        if (got === null) {
          const adding: HeldStepperValue<T> = {
            cur: { v: null },
            orig: null
          };
          map.set(key, adding);
          return adding;
        } else {
          const adding: HeldStepperValue<T> = {
            cur: { v: got },
            orig: structuredClone(got)
          };
          Object.freeze(adding.orig);
          map.set(key, adding);
          return adding;
        }
      });

      map.set(key, got_promise);
      found = await got_promise;
    } else if (found instanceof Promise) {
      found = await found;
    }

    return found;
  }

  private async getBrokerImpl(name: string): Promise<HeldStepperValue<Broker>> {
    
    return await this.getHeldValue(this.cache.broker, name, getBroker);
  }

  private async getBroker(name: string): Promise<Holder<Broker>> {
    return (await this.getBrokerImpl(name)).cur;
  }

  async getOrigBroker(name: string): Promise<RetrievedValue<Broker | null>> {
    const hash = this.prevBlockInfo.hash;
    return {
      headHash: hash,
      val: (await this.getBrokerImpl(name)).orig
    };
  }

  private async getSensorImpl(name: string): Promise<HeldStepperValue<Sensor>> {
    return await this.getHeldValue(this.cache.sensor, name, getSensor);
  }

  private async getSensor(name: string): Promise<Holder<Sensor>> {
    return (await this.getSensorImpl(name)).cur;
  }

  async getOrigSensor(name: string): Promise<Sensor | null> {
    return (await this.getSensorImpl(name)).orig;
  }

  private async getIntegrationImpl(name: string): Promise<HeldStepperValue<Integration>> {
    return await this.getHeldValue(this.cache.integration, name, getIntegration);
  }

  private async getIntegration(name: string): Promise<Holder<Integration>> {
    return (await this.getIntegrationImpl(name)).cur;
  }

  async getOrigIntegration(name: string): Promise<Integration | null> {
    return (await this.getIntegrationImpl(name)).orig;
  }

  private async getPublicBrokerKeys(): Promise<string[]> {
    if (this.cache.brokerPublicKeys !== null) {
      return this.cache.brokerPublicKeys;
    }

    this.cache.brokerPublicKeys = await this.persistence.all(`
      SELECT DISTINCT owner
        FROM Broker
      WHERE string IN (SELECT value FROM json_each(?));`);

    return this.cache.brokerPublicKeys;
  }

  private async stepPayment(tx: PaymentTx, reward: string, blockName: string): Promise<Result> {
    const fail: ResultFailure = { result: false, reason: "" };
    if (!PaymentTx.verify(tx, fail)) {
      return {
        result: false,
        reason: "couldn't verify a payment\n" + fail.reason
      };
    }

    const inputWallet = await this.getWallet(tx.input);

    if (tx.counter <= inputWallet.counter) {
      return {
        result: false,
        reason: "payment has invalid counter"
      };
    }
    inputWallet.counter = tx.counter;

    //first loop is to check it can be payed, and spends, second loop does the paying
    if (inputWallet.balance < tx.rewardAmount) {
      return {
        result: false,
        reason: "payment rewarding more than they have"
      };
    }
    inputWallet.balance -= tx.rewardAmount;

    for (const output of tx.outputs) {
      if (inputWallet.balance < output.amount) {
        return {
          result: false,
          reason: "payment spending more than they have"
        };
      }
      inputWallet.balance -= output.amount;
    }

    for (const output of tx.outputs) {
      const outputWallet = await this.getWallet(output.publicKey);
      outputWallet.balance += output.amount;
    }
    const rewardWallet = await this.getWallet(reward);
    rewardWallet.balance += tx.rewardAmount;

    blockName;
    //genPaymentRDF(stepper, blockName, tx);

    return {
      result: true
    };
  }

  private async stepBrokerRegistration(tx: BrokerTx, reward: string/*, blockName: string*/): Promise<Result> {
    const fail: ResultFailure = { result: false, reason: "" };
    if (!BrokerTx.verify(tx, fail)) {
      return {
        result: false,
        reason: "Couldn't verify a broker registration: " + fail.reason
      };
    }

    const inputWallet = await this.getWallet(tx.input);

    if (tx.counter <= inputWallet.counter) {
      return {
        result: false,
        reason: "Broker registration has invalid counter"
      };
    }
    inputWallet.counter = tx.counter;

    if (inputWallet.balance < tx.rewardAmount) {
      return {
        result: false,
        reason: "Broker registration rewarding more than they have"
      };
    }
    inputWallet.balance -= tx.rewardAmount;

    const rewardWallet = await this.getWallet(reward);
    rewardWallet.balance += tx.rewardAmount;

    const brokerName = BrokerTx.getBrokerName(tx);

    const foundExistingBroker = await this.getBroker(brokerName);

    if (foundExistingBroker.v !== null) {
      if (foundExistingBroker.v.owner !== tx.input) {
        return {
          result: false,
          reason: "A broker has already been defined with this name"
        };
      }
    }

    foundExistingBroker.v = new Broker(tx.input, BrokerTx.getEndpoint(tx) , ChainUtil.hash(BrokerTx.toHash(tx)));

    //genBrokerRegistrationRDF(updater, blockName, tx, foundExistingBroker);

    return {
      result: true
    };
  }

  private async stepSensorTx(tx: SensorTx, reward: string/*, blockName: string*/): Promise<Result> {
    const fail: ResultFailure = { result: false, reason: "" };
    if (!SensorTx.verify(tx, fail)) {
      return {
        result: false,
        reason: "Couldn't verify a sensor registration: " + fail.reason
      };
    }

    const foundBroker = await this.getBroker(SensorTx.getIntegrationBroker(tx));

    if (foundBroker.v === null) {
      return {
        result: false,
        reason: "Couldn't find sensor registration's nominated broker in the broker list"
      };
    }

    const inputWallet = await this.getWallet(tx.input);

    if (tx.counter <= inputWallet.counter) {
      return {
        result: false,
        reason: "Sensor registration has invalid counter"
      };
    }
    inputWallet.counter = tx.counter;

    if (inputWallet.balance < tx.rewardAmount) {
      return {
        result: false,
        reason: "Sensor registration rewarding more than they have"
      };
    }
    inputWallet.balance -= tx.rewardAmount;

    const rewardWallet = await this.getWallet(reward);
    rewardWallet.balance += tx.rewardAmount;

    const sensorName = SensorTx.getSensorName(tx);

    const foundExistingSensor = await this.getSensor(sensorName);

    if (foundExistingSensor.v !== null) {
      if (foundExistingSensor.v.owner !== tx.input) {
        return {
          result: false,
          reason: "A sensor has already been defined with this name by a different user"
        };
      }
    }
    foundExistingSensor.v = new Sensor(
      tx.input, ChainUtil.hash(SensorTx.toHash(tx)), SensorTx.getIntegrationBroker(tx), SensorTx.getCostPerKB(tx), SensorTx.getCostPerMinute(tx));
    //genSensorRegistrationRDF(updater, blockName, tx, foundExistingSensor);

    return {
      result: true
    };
  }

  private async stepIntegrationTx(tx: IntegrationTx, reward: string, startTime: number/*, blockName: string*/): Promise<Result> {
    const fail: ResultFailure = { result: false, reason: "" };
    if (!IntegrationTx.verify(tx, fail)) {
      return {
        result: false,
        reason: "couldn't verify a integration: " + fail.reason
      };
    }

    const foundIntegration = await this.getIntegration(makeIntegrationKey(tx.input, tx.counter));
    if (foundIntegration.v !== null) {
      return {
        result: false,
        reason: "Integration with this key already exists?"
      };
    }

    const inputWallet = await this.getWallet(tx.input);

    if (tx.counter <= inputWallet.counter) {
      return {
        result: false,
        reason: "integration has invalid counter"
      };
    }

    inputWallet.counter = tx.counter;

    //first loop is to check it can be payed, and spends, second loop does the paying
    if (inputWallet.balance < tx.rewardAmount) {
      return {
        result: false,
        reason: "integration rewarding more than they have"
      };
    }
    inputWallet.balance -= tx.rewardAmount;

    foundIntegration.v = new Integration(tx.input, startTime, 0, [], INTEGRATION_STATE.RUNNING);

    const sensorBrokers = new Set<string>();

    for (const output of tx.outputs) {
      const foundSensor = await this.getSensor(output.sensorName);

      if (foundSensor.v === null) {
        return {
          result: false,
          reason: `Integration references non-existant sensor: ${output.sensorName}`
        };
      }
      if (foundSensor.v.hash !== output.sensorHash) {
        return {
          result: false,
          reason: "Integration references non-current version of sensor"
        };
      }

      const foundBroker = await this.getBroker(foundSensor.v.broker);

      if (foundBroker.v === null) {
        return {
          result: false,
          reason: "Internal consitency error, can't find broker referenced by commited sensor registration"
        };
      }

      if (foundBroker.v.hash !== output.brokerHash) {
        return {
          result: false,
          reason: "Integration references non-current version of sensor's broker"
        };
      }

      if (inputWallet.balance < output.amount) {
        return {
          result: false,
          reason: "integration spending more than they have"
        };
      }
      inputWallet.balance -= output.amount;

      const adding: IntegrationOutput = {
        sensorCostPerKB: foundSensor.v.costPerKB,
        sensorCostPerMin: foundSensor.v.costPerMin,
        broker: foundSensor.v.broker,
        brokerOwner: foundBroker.v.owner,
        sensorOwner: foundSensor.v.owner,
        witnesses: {},
        amount: output.amount,
        compensationTotal: 0
      };

      adding.witnesses[foundBroker.v.owner] = false;
      sensorBrokers.add(foundBroker.v.owner);

      foundIntegration.v.uncommittedCount++;
      foundIntegration.v.outputs.push(adding);

      const outputTimeoutTime = (adding.amount / (adding.sensorCostPerMin / MINUTE_MS) + startTime) + BROKER_DEAD_BUFFER_TIME_MS;
      if (outputTimeoutTime > foundIntegration.v.timeoutTime) {
        foundIntegration.v.timeoutTime = outputTimeoutTime;
      }
    }

    const rewardWallet = await this.getWallet(reward);
    rewardWallet.balance += tx.rewardAmount;

    const brokersFinal: string[] = [];
    const brokersInitial = await this.getPublicBrokerKeys();
    for (const broker of brokersInitial) {
      if (!sensorBrokers.has(broker)) {
        brokersFinal.push(broker);
      }
    }

    const witnesses = IntegrationTx.chooseWitnesses(tx, brokersFinal);

    if (isFailure(witnesses)) {
      return {
        result: false,
        reason: "Couldn't choose witnesses: " + witnesses.reason
      };
    }

    for (const outputExtra of foundIntegration.v.outputs) {
      for (const witness of witnesses.witnesses) {
        outputExtra.witnesses[witness] = false;
        foundIntegration.v.uncommittedCount++;
      }
    }

    //genIntegrationRDF(updater, blockName, txCopy);

    return {
      result: true
    };
  }

  private async payoutIntegration(integrationKey: string, integration: Integration): Promise<void> {
    console.log(`Paying out integration: ${integrationKey}`);

    const integrateeWallet = await this.getWallet(integration.owner);

    for (let i = 0; i < integration.outputs.length; i++) {
      const output = integration.outputs[i];
      console.log(`Output ${i}, amount: ${output.amount}`);

      const compensationRatio = output.compensationTotal / Object.values(output.witnesses).length;

      const brokerGettingPaid = output.witnesses[output.brokerOwner];

      let amount_left = output.amount;

      if (brokerGettingPaid) {
        const brokerWallet = await this.getWallet(output.brokerOwner);
        const paying = BROKER_COMMISION * amount_left
        brokerWallet.balance += paying;
        amount_left -= paying;
        console.log(`Broker '${output.brokerOwner} paid: ${paying}`);
      }

      const sensorWallet = await this.getWallet(output.sensorOwner);
      const paying = compensationRatio * amount_left;
      sensorWallet.balance += paying;
      amount_left -= paying;
      console.log(`Sensor '${output.sensorOwner}' paid: ${paying}`);

      
      integrateeWallet.balance += amount_left;
      console.log(`Integratee '${integration.owner}' compensated: ${amount_left}`);
    }
  }

  private async stepCommit(tx: CommitTx): Promise<Result> {
    const fail: ResultFailure = { result: false, reason: "" };

    if (!CommitTx.verify(tx,fail)) {
      return {
        result: false,
        reason: "Couldn't verify a commit: " + fail.reason
      };
    }

    const integrationKey = makeIntegrationKey(tx.integration.input, tx.integration.counter);

    const foundIntegration = await this.getIntegration(integrationKey);

    if (foundIntegration.v === null) {
      return {
        result: false,
        reason: `Couldn't find integration '${integrationKey}' referenced by commit`
      };
    }

    for (const output of tx.outputs) {
      if (output.i >= foundIntegration.v.outputs.length) {
        return {
          result: false,
          reason: `Commit tx references an output that doesn't exist`
        };
      }
      const integrationOutput = foundIntegration.v.outputs[output.i];
      if (!Object.hasOwn(integrationOutput.witnesses, tx.input)) {
        return {
          result: false,
          reason: "Commit tx is trying to commit to an output it isn't a witness to"
        };
      }
      if (integrationOutput.witnesses[tx.input]) {
        return {
          result: false,
          reason: "Commit tx is trying to commit to an output it has already committed"
        };
      }
      integrationOutput.witnesses[tx.input] = true;
      integrationOutput.compensationTotal += output.commitRatio;
      foundIntegration.v.uncommittedCount--;
      console.log(`${tx.input} committed ${integrationKey} ${output.i}: ${output.commitRatio}. Uncommitted count = ${foundIntegration.v.uncommittedCount}`);
    }

    if (foundIntegration.v.uncommittedCount === 0) {
      await this.payoutIntegration(integrationKey, foundIntegration.v);
      foundIntegration.v.state = INTEGRATION_STATE.COMMITTED;
    }

    //genCommitRDF(updater, blockName, tx);

    return {
      result: true
    };
  }

  private async checkIntegrationsForTimeout(timestamp: number) {

    type IntegrationDbRes = {
      name: string;
      owner: string;
      timeoutTime: number;
      uncommittedCount: number;
      outputsRaw: string;
      state: Integrate_state;
    }

    //get all running integrations with timeoutTime >= timestamp
    await this.persistence.each<IntegrationDbRes>(`
    WITH path(id,max) AS (
      SELECT json_extract(value, '$.id'),json_extract(value, '$.max') FROM json_each(?)
    )  
    SELECT name,MAX(depth),owner,timeoutTime,uncommittedCount,outputsRaw,state
      FROM Integration
    INNER JOIN path ON Integration.string = path.id AND Integration.depth < path.max
    WHERE state = ?
      AND timeoutTime <= ?
    GROUP BY name;`, async (row) => {
      //check if cache has this, if it does use cached, otherwise add it

      let found = this.cache.integration.get(row.name);
      if (found !== undefined) {
        if (found instanceof Promise) {
          found = await found;
        }
      } else {
        const refined = new Integration(row.owner, row.timeoutTime, row.uncommittedCount, JSON.parse(row.outputsRaw) as IntegrationOutput[], row.state);
        found = {
          cur: { v: refined },
          orig: structuredClone(refined)
        };
        Object.freeze(found.orig);
        this.cache.integration.set(row.name, found);
      }

      //check state again in case some weird stuff with cache
      if (found.cur.v !== null && found.cur.v.state === INTEGRATION_STATE.RUNNING) {
        console.log(`integration ${row.name} timed out`);
        this.payoutIntegration(row.name, found.cur.v);
        found.cur.v.state = INTEGRATION_STATE.TIMED_OUT;
      }
    }, this.prevBlockInfo.stringifiedStringPath, INTEGRATION_STATE.RUNNING, timestamp);
  }

  private async stepTxs(reward: string, timestamp: number, blockName: string, txs: BlockTxs): Promise<Result> {
    //do reward first
    (await this.getWallet(reward)).balance += MINING_REWARD;

    await this.checkIntegrationsForTimeout(timestamp);

    for (const tx of BlockTxs.getCommits(txs)) {
      const res = await this.stepCommit(tx);
      if (isFailure(res)) {
        return {
          result: false,
          reason: "Failed to step commit\n" + res.reason
        };
      }
    }

    for (const tx of BlockTxs.getIntegrations(txs)) {
      const res = await this.stepIntegrationTx(tx, reward, timestamp);
      if (isFailure(res)) {
        return {
          result: false,
          reason: "Failed to step integration\n" + res.reason
        };
      }
    }

    for (const tx of BlockTxs.getSensorRegistrations(txs)) {
      const res = await this.stepSensorTx(tx, reward/*, blockName*/);
      if (isFailure(res)) {
        return {
          result: false,
          reason: "Failed to step sensor registration\n" + res.reason
        };
      }
    }

    for (const tx of BlockTxs.getBrokerRegistrations(txs)) {
      const res = await this.stepBrokerRegistration(tx, reward/*, blockName*/);
      if (isFailure(res)) {
        return {
          result: false,
          reason: "Failed to step broker registration\n" + res.reason
        };
      }
    }

    for (const tx of BlockTxs.getPayments(txs)) {
      const res = await this.stepPayment(tx, reward, blockName);
      if (isFailure(res)) {
        return {
          result: false,
          reason: "Failed to step payment\n" + res.reason
        };
      }
    }

    return {
      result: true
    };
  }
  
  private async createHeadAndString(block: Block): Promise<NewBlockInfo> {
    //create string and head for our new block
    const ourNewStringId = (await this.persistence.get<IdDbRes>("INSERT INTO String(prev, min) VALUES (?,?) RETURNING id;", this.prevBlockInfo.stringId, this.prevBlockInfo.depth + 1) as IdDbRes).id;
    const newBlockId = await this.insertBlock(block, this.prevBlockInfo.depth + 1, ourNewStringId);
    const headId = (await this.persistence.get<IdDbRes>("INSERT INTO Head(block,lastSeen) VALUES (?,unixepoch()) RETURNING id;", newBlockId) as IdDbRes).id;

    return {
      blockId: newBlockId,
      stringId: ourNewStringId,
      headId: headId
    };
  }
  //return id of the newly created block
  private async insertBlock(block: Block, depth: number, string: number): Promise<number> {
    //hard cast to IdDbRes as this should ALWAYS return a value (or throw)
    return (await this.persistence.get<IdDbRes>(
      "INSERT INTO Blocks(hash,timestamp,lastHash,reward,nonce,difficulty,depth,string,raw) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id;",
      block.hash, block.timestamp, block.lastHash, block.reward, block.nonce, this.cache.curBlockDifficulty, depth, string, JSON.stringify(block)) as IdDbRes).id;
  }
}

//function uriReplacePrefix(testing:string, sensorName:string):string {
//  if (testing.startsWith(SENSHAMART_URI_REPLACE)) {
//    return sensorName.concat(testing.slice(SENSHAMART_URI_REPLACE.length));
//  } else {
//    return testing;
//  }
//}

////the following functions either generate the RDF for a particular tx type, or validate and apply the tx to the updater

////function genPaymentRDF(stepper: Stepper, blockName: string, tx: Payment): void{

////  const transactionName = makePaymentTransactionName(tx);

////  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
////  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_PAYMENT, transactionName);

////  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.REWARDED, String(tx.rewardAmount));
////  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.TYPE, URIS.OBJECT.PAYMENT_TX);
////}

//function genIntegrationRDF(updater: Updater, blockName: string, tx: Integration): void {

//  const transactionName = makeIntegrationTransactionName(tx);

//  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
//  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_INTEGRATION, transactionName);

//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.REWARDED, String(tx.rewardAmount));
//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.HAS_HASH, ChainUtil.hash(Integration.toHash(tx)));
//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.TYPE, URIS.OBJECT.INTEGRATION_TX);
//}

//function genCommitRDF(updater: Updater, blockName: string, tx: Commit): void {
//  const transactionName = makeCommitTransactionName(tx);

//  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
//  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_COMMIT, transactionName);

//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.TYPE, URIS.OBJECT.COMMIT_TX);
//}

//function genSensorRegistrationRDF(updater: Updater, blockName: string, tx: SensorRegistration, prevSensor: SensorRegistration | null): void {
//  const transactionName = makeSensorTransactionName(tx);

//  for (const triple of SensorRegistration.getExtraNodeMetadata(tx)) {
//    plusNodeRdf(updater, uriReplacePrefix(triple.s, transactionName), uriReplacePrefix(triple.p, transactionName), uriReplacePrefix(triple.o, transactionName));
//  }
//  for (const triple of SensorRegistration.getExtraLiteralMetadata(tx)) {
//    plusLiteralRdf(updater, uriReplacePrefix(triple.s, transactionName), uriReplacePrefix(triple.p, transactionName), String(triple.o));
//  }

//  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
//  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_SENSOR_REGISTRATION, transactionName);

//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.REWARDED, String(tx.rewardAmount));
//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.HAS_HASH, ChainUtil.hash(SensorRegistration.toHash(tx)));

//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.TYPE, URIS.OBJECT.SENSOR_REGISTRATION_TX);
//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.HAS_COUNTER, String(tx.counter));
//  plusNodeRdf(updater, transactionName, URIS.PREDICATE.IS_OWNED_BY, makeWalletName(tx.input));
//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.DEFINES, SensorRegistration.getSensorName(tx));
//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.COSTS_PER_MINUTE, String(SensorRegistration.getCostPerMinute(tx)));
//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.COSTS_PER_KB, String(SensorRegistration.getCostPerKB(tx)));
//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.USES_BROKER, SensorRegistration.getIntegrationBroker(tx));

//  if (prevSensor !== null) {
//    const prevTxName = makeSensorTransactionName(prevSensor);
//    plusNodeRdf(updater, transactionName, URIS.PREDICATE.SUPERCEDES, prevTxName);
//  }
//}

//function genBrokerRegistrationRDF(updater: Updater, blockName: string, tx: BrokerRegistration, prevBroker: BrokerRegistration | null): void {
//  const transactionName = makeBrokerTransactionName(tx);

//  for (const triple of BrokerRegistration.getExtraNodeMetadata(tx)) {
//    plusNodeRdf(updater, uriReplacePrefix(triple.s, transactionName), uriReplacePrefix(triple.p, transactionName), uriReplacePrefix(triple.o, transactionName));
//  }
//  for (const triple of BrokerRegistration.getExtraLiteralMetadata(tx)) {
//    plusLiteralRdf(updater, uriReplacePrefix(triple.s, transactionName), uriReplacePrefix(triple.p, transactionName), String(triple.o));
//  }

//  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
//  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_BROKER_REGISTRATION, transactionName);

//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.REWARDED, String(tx.rewardAmount));
//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.HAS_HASH, ChainUtil.hash(BrokerRegistration.toHash(tx)));

//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.TYPE, URIS.OBJECT.BROKER_REGISTRATION_TX);
//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.HAS_COUNTER, String(tx.counter));
//  plusNodeRdf(updater, transactionName, URIS.PREDICATE.IS_OWNED_BY, makeWalletName(tx.input));
//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.DEFINES, BrokerRegistration.getBrokerName(tx));
//  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.HAS_ENDPOINT, BrokerRegistration.getEndpoint(tx));

//  if (prevBroker !== null) {
//    const prevTxName = makeBrokerTransactionName(prevBroker);
//    plusNodeRdf(updater, transactionName, URIS.PREDICATE.SUPERCEDES, prevTxName);
//  }
//}

//function checkIntegrationsForTimeout(updater: Updater, timestamp: number) {
//  const checked = new Set<string>();

//  //check curdata
//  for (const [key, integration] of updater.curData.INTEGRATION) {
//    if (integration.state !== INTEGRATION_STATE.RUNNING) {
//      continue;
//    }
//    let all_timedout: boolean = true;
//    for (let i = 0; i < integration.outputs.length; ++i) {
//      const output = integration.outputs[i];
//      const extra = integration.outputsExtra[i];

//      //we find the time this would expire, add broker_dead_buffer_time to it, if it has passed, we've timedout
//      //time this would expire:
//      //costNow = (now - startTime) * (costPerMin / minute_ms)
//      //now = costNow / (costPerMin / minute_ms) + startTime
//      const delta = (output.amount / (extra.sensorCostPerMin / MINUTE_MS) + integration.startTime) + BROKER_DEAD_BUFFER_TIME_MS - timestamp;
//      //console.log(`curData checking for timeout: ${key} ${i}: ${delta}`);
//      if (0 < delta) {
//        all_timedout = false;
//        break;
//      }
//    }

//    if (all_timedout) {
//      console.log(`integration ${key} timed out`);
//      payoutIntegration(updater, integration);
//      integration.state = INTEGRATION_STATE.TIMED_OUT;
//      updater.set<IntegrationExpanded>(DATA_TYPE.INTEGRATION, key, integration);
//    }
//    checked.add(key);
//  }

//  //check prevdata
//  for (const [key, integration] of updater.prevData.INTEGRATION) {
//    if (checked.has(key) || integration.state !== INTEGRATION_STATE.RUNNING) {
//      continue;
//    }
//    let all_timedout: boolean = true;
//    for (let i = 0; i < integration.outputs.length; ++i) {
//      const output = integration.outputs[i];
//      const extra = integration.outputsExtra[i];

//      //we find the time this would expire, add broker_dead_buffer_time to it, if it has passed, we've timedout
//      //time this would expire:
//      //costNow = (now - startTime) * (costPerMin / minute_ms)
//      //now = costNow / (costPerMin / minute_ms) + startTime
//      const delta = (output.amount / (extra.sensorCostPerMin / MINUTE_MS) + integration.startTime) + BROKER_DEAD_BUFFER_TIME_MS - timestamp;
//      //console.log(`prevData checking for timeout: ${key} ${i}: ${delta}`);
//      if (0 < delta) {
//        all_timedout = false;
//        break;
//      }
//    }

//    if (all_timedout) {
//      console.log(`integration ${key} timed out`);
//      payoutIntegration(updater, integration);
//      integration.state = INTEGRATION_STATE.TIMED_OUT;
//      updater.set<IntegrationExpanded>(DATA_TYPE.INTEGRATION, key, integration);
//    }
//    checked.add(key);
//  }

//  //check blockchain data
//  for (const [key, integration] of updater.parent.data.INTEGRATION) {
//    if (checked.has(key) || integration.base.state !== INTEGRATION_STATE.RUNNING) {
//      continue;
//    }
//    let all_timedout: boolean = true;
//    for (let i = 0; i < integration.base.outputs.length; ++i) {
//      const output = integration.base.outputs[i];
//      const extra = integration.base.outputsExtra[i];

//      //we find the time this would expire, add broker_dead_buffer_time to it, if it has passed, we've timedout
//      //time this would expire:
//      //costNow = (now - startTime) * (costPerMin / minute_ms)
//      //now = costNow / (costPerMin / minute_ms) + startTime
//      const delta = (output.amount / (extra.sensorCostPerMin / MINUTE_MS) + integration.base.startTime) + BROKER_DEAD_BUFFER_TIME_MS - timestamp;
//      //console.log(`parent checking for timeout: ${key} ${i}: ${delta}`);
//      if (0 < delta) {
//        all_timedout = false;
//        break;
//      }
//    }

//    if (all_timedout) {
//      console.log(`integration ${key} timed out`);
//      payoutIntegration(updater, integration.base);
//      integration.base.state = INTEGRATION_STATE.TIMED_OUT;
//      updater.set<IntegrationExpanded>(DATA_TYPE.INTEGRATION, key, integration.base);
//    }
//  }
//}

//verify all txs
//async function step(stepper: Stepper, reward: string, timestamp: number, payments: Payment[], sensorRegistrations: SensorRegistration[], brokerRegistrations: BrokerRegistration[], integrations: Integration[], commits: Commit[], blockName: string): Result {
//  const rewardWallet = await stepper.getWallet(reward);
//  rewardWallet.balance += MINING_REWARD;

//  for (const payment of payments) {
//    const res = await stepPayment(stepper, reward, payment, blockName);
//    if (!res.result) {
//      return res;
//    }
//  }

  //for (const integration of integrations) {
  //  const res = stepIntegration(updater, reward, timestamp, integration, blockName);
  //  if (!res.result) {
  //    return res;
  //  }
  //}

  //for (const commit of commits) {
  //  const res = stepCommit(updater, commit, blockName);
  //  if (!res.result) {
  //    return res;
  //  }
  //}

  //for (const brokerRegistration of brokerRegistrations) {
  //  const res = stepBrokerRegistration(updater, reward, brokerRegistration, blockName);
  //  if (!res.result) {
  //    return res;
  //  }
  //}

  //for (const sensorRegistration of sensorRegistrations) {
  //  const res = stepSensorRegistration(updater, reward, sensorRegistration, blockName);
  //  if (!res.result) {
  //    return res;
  //  }
  //}

  //checkIntegrationsForTimeout(updater, timestamp);

//  return {
//    result: true,
//  };
//}

//verify the hash of a block, including the previous hash
//function verifyBlockHash(prevBlock: Block, block: Block): Result {
//  if (block.lastHash !== prevBlock.hash) {
//    return {
//      result: false,
//      reason: `last hash '${block.lastHash}' didn't match our last hash '${prevBlock.hash}'`
//    };
//  }
//  //TODO how to check if new block's timestamp is believable
//  if (block.difficulty !== Block.adjustDifficulty(prevBlock, block.timestamp)) {
//    return {
//      result: false,
//      reason: "difficulty is incorrect"
//    };
//  }
//  if (!Block.checkHash(block)) {
//    return {
//      result: false,
//      reason: "hash is invalid failed"
//    };
//  }

//  return {
//    result: true
//  };
//}

////verify all blocks, in blocks
////function verifyBlocks(updater: Updater, blocks: Block[]) : Result {
////  if (blocks.length === 0) {
////    return {
////      result: false,
////      reason: "zero length"
////    };
////  }

////  for (let i = 0; i < blocks.length; i++) {
////    const verifyResult = verifyBlock(updater, blocks[i]);

////    if (verifyResult.result === false) {
////      return {
////        result: false,
////        reason: `Chain is invalid at block ${i}: ${verifyResult.reason}`
////      };
////    }
////  }

////  return {
////    result: true
////  };
////}

////called when the blockchain changes, calls all listeners
//function onChange(blockchain: Blockchain, newBlocks: Block[], changes: UpdaterChanges, difference: number): void {
//  for (const listener of blockchain.listeners) {
//    listener(newBlocks, changes, difference);
//  }
//}

////read a block from persistence
//async function readBlockByDepth(chain: Blockchain, i: number): Promise<Block> {
//  const row = await chain.persistence.get<ReadBlock_result>("SELECT hash,timestamp,lastHash,reward,nonce,difficulty FROM Blocks WHERE id = ?;", i);

//  if (row === undefined) {
//    throw new Error(`Couldn't read block at depth: ${i}, no row found`);
//  }

//  //NYI read txs for block

//  return new Block(row.timestamp, row.lastHash, row.hash, row.reward, {}, row.nonce, row.difficulty);
//}

//async function readBlockByHash(chain: Blockchain, hash: string): Promise<Block> {
//  const row = await chain.persistence.get<ReadBlock_result>("SELECT hash,timestamp,lastHash,reward,nonce,difficulty FROM Blocks WHERE hash = ?;", hash);

//  if (row === undefined) {
//    throw new Error(`Couldn't read block with hash: ${hash}, no row found`);
//  }

//  //NYI read txs for block

//  return new Block(row.timestamp, row.lastHash, row.hash, row.reward, {}, row.nonce, row.difficulty);
//}

//async function getRepresentativeHashesImpl(blockchain: Blockchain): Promise<string[]> {
//  const curChainLength = blockchain.length();

//  const searchingFor: number[] = [];

//  let i = 0;

//  for (let i = 0; curChainLength - i - 1 > 0 && i < 10; --i) {
//    searchingFor.push(curChainLength - i - 1);
//  }
//  for (let j = 2; ;j *= 2) {
//    i += j;
//    if (i >= curChainLength) {
//      break;
//    }
//    searchingFor.push(curChainLength - i - 1);
//  }

//  return await blockchain.persistence.all<string>("SELECT hash FROM Chains WHERE chain = 0 AND depth IN ?", searchingFor);
//}

//type ReadBlock_result = {
//  hash: string;
//  timestamp: number;
//  lastHash: string;
//  reward: string;
//  nonce: number;
//  difficulty: number;
//};

//type Listener = (newBlocks: Block[], changes: UpdaterChanges, difference: number) => void;

type DbState = {
  persistence: Persistence; //our wrapper to the sqlite3 based persitence
  fusekiLocation: string | null; //the URL of a fuseki instance
  currentChain: Stepper;
};

//the object/class to handle a blockchain
class Blockchain {

  //listeners: Listener[]; //listeners to blockchain changed events
  
  private writeQueue: Promise<void> | null; //promise that can be chained on to queue an operation. If null, no operation is currently running
  private state: DbState;

  private constructor(persistence: Persistence, fuseki_location: string | null) {
    //this.listeners = [];
    this.state = {
      persistence: persistence,
      fusekiLocation: fuseki_location,
      currentChain: new Stepper(persistence)
    };
    this.writeQueue = null;
  }

  static async create(db_location: string, fuseki_location: string | null) {
    const persistence = await Persistence.openDb(db_location);

    const me = new Blockchain(persistence, fuseki_location);

    type VersionResult = {
      value: string;
    };
    let version: string = "";
    try {
      const res = await persistence.get<VersionResult>("SELECT value FROM Configs WHERE name = 'version';");
      if (res === undefined) {
        throw new Error();
      } else {
        version = res.value;
      }
    } catch (_err) {
      for (const query of DB_CREATE_QUERY) {
        await persistence.run(query);
      }
      version = DB_EXPECTED_VERSION;
    }
    if (version !== DB_EXPECTED_VERSION) {
      throw new Error("Db is a different version to what is expected");
    }

    type ChainHeadRes = { depth: number; hash: string };
    const blockCountRes = await persistence.get<ChainHeadRes>(`SELECT depth,hash AS max FROM Blocks ORDER BY depth DESC, timestamp ASC;`);

    if (blockCountRes !== undefined) {
      await me.state.currentChain.setPrevBlock(blockCountRes.hash);
    }
    return me;
  }

  async getWallet(input: string): Promise<RetrievedValue<Wallet>> {
    const hash = this.state.currentChain.getPrevBlockHash();
    const path = this.state.currentChain.getPrevBlockPath();
    return {
      headHash: hash,
      val: await getWallet(this.state.persistence, input, path)
    };
  }
  async getWallets(): Promise<RetrievedValue<Map<string, Wallet>>> {
    const hash = this.state.currentChain.getPrevBlockHash();
    const path = this.state.currentChain.getPrevBlockPath();
    const returning = new Map<string, Wallet>();
    await getWallets(this.state.persistence, path, (key, wallet) => {
      returning.set(key, wallet);
    });
    return {
      headHash: hash,
      val: returning
    };
  }

  async getSensor(sensorName: string): Promise<RetrievedValue<Sensor | null>> {
    const hash = this.state.currentChain.getPrevBlockHash();
    const path = this.state.currentChain.getPrevBlockPath();
    return {
      headHash: hash,
      val: await getSensor(this.state.persistence, sensorName, path)
    };
  }

  async getSensors(): Promise<RetrievedValue<Map<string, Sensor>>> {
    const hash = this.state.currentChain.getPrevBlockHash();
    const path = this.state.currentChain.getPrevBlockPath();
    const returning = new Map<string, Sensor>();
    await getSensors(this.state.persistence, path, (key, sensor) => {
      returning.set(key, sensor);
    });
    return {
      headHash: hash,
      val: returning
    };
  }

  async getBroker(brokerName: string): Promise<RetrievedValue<Broker | null>> {
    const hash = this.state.currentChain.getPrevBlockHash();
    const path = this.state.currentChain.getPrevBlockPath();
    return {
      headHash: hash,
      val: await getBroker(this.state.persistence, brokerName, path)
    };
  }

  async getBrokers(): Promise<RetrievedValue<Map<string, Broker>>> {
    const hash = this.state.currentChain.getPrevBlockHash();
    const path = this.state.currentChain.getPrevBlockPath();
    const returning = new Map<string, Broker>();
    await getBrokers(this.state.persistence, path, (key, broker) => {
      returning.set(key, broker);
    });
    return {
      headHash: hash,
      val: returning
    };
  }

  async getIntegration(integrationKey: string): Promise<RetrievedValue<Integration | null>> {
    const hash = this.state.currentChain.getPrevBlockHash();
    const path = this.state.currentChain.getPrevBlockPath();
    return {
      headHash: hash,
      val: await getIntegration(this.state.persistence, integrationKey, path)
    };
  }

  async getIntegrations(): Promise<RetrievedValue<Map<string, Integration>>> {
    const hash = this.state.currentChain.getPrevBlockHash();
    const path = this.state.currentChain.getPrevBlockPath();
    const returning = new Map<string, Integration>();
    await getIntegrations(this.state.persistence, path, (key, integration) => {
      returning.set(key, integration);
    });
    return {
      headHash: hash,
      val: returning
    };
  }

  length() {
    return this.state.currentChain.prevBlockInfo.depth;
  }

  //async getRepresentativeHashes(): Promise<string[]> {
  //  return await new Promise<string[]>((resolve, reject) => addOp(this, new Op(() => getRepresentativeHashesImpl(this), resolve, reject)));
  //}

  //adds an existing block to the blockchain, returns false if the block can't be added, true if it was added
  async addBlock(newBlock: Block): Promise<Result> {
    const stepper = new Stepper(this.state.persistence);
    return await this.addOp(async () => {
      const res = await stepper.addBlock(newBlock);
      if (isFailure(res)) {
        return res;
      }
      //if the stepper now has a longer chain than what we currently have, or it has the same length, but earlier timestamp, update
      if (stepper.prevBlockInfo.depth > this.state.currentChain.prevBlockInfo.depth
        || (stepper.prevBlockInfo.depth === this.state.currentChain.prevBlockInfo.depth && stepper.prevBlockInfo.timestamp < this.state.currentChain.prevBlockInfo.timestamp)) {
        this.state.currentChain = stepper;
      }
      return res;
    });
  }

  //all database operations need to be serialized, this function does that
  private async addOp<T>(op: () => Promise<T>): Promise<T> {
    let creating: Promise<T> | null = null;
    if (this.writeQueue === null) {
      creating = op();
    } else {
      creating = this.writeQueue.then(op, op);
    }
    //we cast Promise<T> to Promise<void> as we don't care about the return type when it's placed as the queue
    this.writeQueue = creating as Promise<void>;
    const returning = await creating;
    if (this.writeQueue === creating) {
      this.writeQueue = null;
    }
    return returning;
  }

  async wouldBeValidBlock(reward: string, timestamp: number, txs: BlockTxs): Promise<Result> {
    return await this.addOp<Result>(async () => {
      const res = await this.state.currentChain.checkBlock(this.state.currentChain.prevBlockInfo.hash, reward, timestamp, txs);
      //remember to reset so we don't keep any hypothetical changes
      this.state.currentChain.reset();
      return res;
    });
  }

  //addListener(listener:Listener): void {
  //  this.listeners.push(listener);
  //}
}

export default Blockchain;
export { Blockchain, Persistence, type Integration, type Sensor, type Broker, type Wallet };
