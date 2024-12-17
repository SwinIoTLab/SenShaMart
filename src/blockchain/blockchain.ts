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
import  Block from './block.js';
import Payment from './payment.js';
import SensorRegistration from './sensor-registration.js';
import BrokerRegistration from './broker-registration.js';
import { Integration } from './integration.js';
import Commit from './commit.js';
import {
  type Result,
  isFailure,
  ChainUtil,
  type LiteralMetadata,
  type NodeMetadata,
  type RejectCb,
  type ResolveCb
} from '../util/chain-util.js';
import {
  MINING_REWARD,
  SENSHAMART_URI_REPLACE,
  MINE_RATE,
  INITIAL_BALANCE,
  BROKER_DEAD_BUFFER_TIME_MS,
  MINUTE_MS,
  BROKER_COMMISION
} from '../util/constants.js';

import { default as sqlite3, type Statement, type Database } from 'sqlite3';

import URIS from './uris.js';

//expected version of the db, if it is less than this, we need to upgrade
const DB_EXPECTED_VERSION = '2' as const;

//query to create the persistent db
const DB_CREATE_QUERY = `
CREATE TABLE Configs(
 id INTEGER NOT NULL PRIMARY KEY,
 name TEXT NOT NULL,
 value TEXT NOT NULL);

INSERT INTO Configs(name,value) VALUES
 ('version','${DB_EXPECTED_VERSION}');

CREATE TABLE NodeTriples(
 id INTEGER NOT NULL PRIMARY KEY,
 key TEXT NOT NULL,
 value INTEGER NOT NULL);

CREATE TABLE LiteralTriples(
 id INTEGER NOT NULL PRIMARY KEY,
 key TEXT NOT NULL,
 value INTEGER NOT NULL);

CREATE TABLE Blocks(
 id INTEGER NOT NULL PRIMARY KEY,
 parseable TEXT NOT NULL);

CREATE TABLE Wallet(
 id INTEGER NOT NULL PRIMARY KEY,
 key TEXT NOT NULL,
 balance INTEGER NOT NULL,
 counter INTEGER NOT NULL);

CREATE TABLE Broker(
 id INTEGER NOT NULL PRIMARY KEY,
 parseable TEXT NOT NULL);

CREATE TABLE Sensor(
 id INTEGER NOT NULL PRIMARY KEY,
 parseable TEXT NOT NULL);

CREATE TABLE Integration(
 id INTEGER NOT NULL PRIMARY KEY,
 parseable TEXT NOT NULL);`;

function wrap_db_op<T>(func: (cb: (err: Error, res?: T) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    func((err: Error, res: T) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
}

//Make the key into integration datas for an integration
function makeIntegrationKey(input: string, counter: number) {
  return input + '/' + String(counter);
}

//key names for different data types
const DATA_TYPE = {
  WALLET: "WALLET",
  SENSOR: "SENSOR",
  BROKER: "BROKER",
  INTEGRATION: "INTEGRATION",
  NODE_RDF: "NODE_RDF",
  LITERAL_RDF: "LITERAL_RDF"
} as const;

type Data_type = typeof DATA_TYPE[keyof typeof DATA_TYPE];

const ALL_DATA_TYPES = [
  DATA_TYPE.WALLET,
  DATA_TYPE.SENSOR,
  DATA_TYPE.BROKER,
  DATA_TYPE.INTEGRATION,
  DATA_TYPE.NODE_RDF,
  DATA_TYPE.LITERAL_RDF
] as const;

//A template that holds the id of a data as well as the data
interface WithDbId<Base> {
  dbId: number
  base: Base
}

//A wallet has the balance and current counter for a wallet
interface Wallet {
  counter: number;
  balance: number;
}

export const INTEGRATION_STATE = {
  RUNNING: "RUNNING",
  COMMITTED: "COMMITTED",
  TIMED_OUT: "TIMED_OUT"
} as const;

export type Integrate_state = typeof INTEGRATION_STATE[keyof typeof INTEGRATION_STATE];

//Extra information that is held about an integration output. A cache to simplify processing
interface IntegrationOutputExtra {
  sensorCostPerMin: number; //cost of the sensor at the time the integration started
  sensorCostPerKB: number; //cost of the sensor at the time the integration started
  broker: string; //name of broker of the sensor at the time the integration started
  brokerOwner: string; //public key of the broker of the sensor at the time the integration started
  sensorOwner: string; //public key of the sensor
  witnesses: {
    [index: string]: boolean //map of whether a (public key)->(has voted)
  };
  compensationTotal: number; //total ratio of to compensate (.e.g., 3 voted to compensate at 0.2, 0.4, and 0.5, then this would be 1.1)
}

//Extra information that is held about integrations. A cache to simplify processing
interface IntegrationExpanded extends Integration {
  startTime: number; //when this integration started
  uncommittedCount: number; //total number of witnesses who are yet to vote to commit
  outputsExtra: IntegrationOutputExtra[]; //extra information for each output
  state: Integrate_state; //current state of the integration
}

//data with db id
type DatasWithDbId = {
  WALLET: Map<string, WithDbId<Wallet>>;
  SENSOR: Map<string, WithDbId<SensorRegistration>>;
  BROKER: Map<string, WithDbId<BrokerRegistration>>;
  INTEGRATION: Map<string, WithDbId<IntegrationExpanded>>;
  NODE_RDF: Map<string, WithDbId<number>>;
  LITERAL_RDF: Map<string, WithDbId<number>>;
  //[index: Data_type]: Map<string, unknown>;
}

//data before they have a db id
type Datas = {
  WALLET: Map<string, Wallet>;
  SENSOR: Map<string, SensorRegistration>;
  BROKER: Map<string, BrokerRegistration>;
  INTEGRATION: Map<string, IntegrationExpanded>;
  NODE_RDF: Map<string, number>;
  LITERAL_RDF: Map<string, number>;
}

//error number for replace chain
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

function escapeNodeMetadata(escaping: NodeMetadata): string {
  let returning = escaping.s.replaceAll('\\', '\\\\');
  returning += '\\n';
  returning += escaping.p.replaceAll('\\', '\\\\');
  returning += '\\n';
  returning += escaping.o;
  return returning;
}

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
  const returning: NodeMetadata = {
    s: null,
    p: null,
    o: null
  };

  let prevI = 0;
  let newI = findDelim(escaping, prevI);
  if (newI === escaping.length) {
    throw new Error(`Couldn't unescape triple: '${escaping}'`);
  }
  returning.s = escaping.substring(prevI, newI).replaceAll('\\\\', '\\');
  prevI = newI + 2;
  newI = findDelim(escaping, prevI);
  if (newI === escaping.length) {
    throw new Error(`Couldn't unescape triple: '${escaping}'`);
  }
  returning.p = escaping.substring(prevI, newI).replaceAll('\\\\', '\\');
  prevI = newI + 2;
  returning.o = escaping.substring(prevI); 

  return returning;
}

function escapeLiteralMetadata(escaping: LiteralMetadata): string {
  let returning = escaping.s.replaceAll('\\', '\\\\');
  returning += '\\n';
  returning += escaping.p.replaceAll('\\', '\\\\');
  returning += '\\n';
  returning += escaping.o;
  return returning;
}

export function unEscapeLiteralMetadata(escaping: string): LiteralMetadata {
  const returning: NodeMetadata = {
    s: null,
    p: null,
    o: null
  };

  let prevI = 0;
  let newI = findDelim(escaping, prevI);
  if (newI === escaping.length) {
    throw new Error(`Couldn't unescape triple: '${escaping}'`);
  }
  returning.s = escaping.substring(prevI, newI).replaceAll('\\\\', '\\');
  prevI = newI + 2;
  newI = findDelim(escaping, prevI);
  if (newI === escaping.length) {
    throw new Error(`Couldn't unescape triple: '${escaping}'`);
  }
  returning.p = escaping.substring(prevI, newI).replaceAll('\\\\', '\\');
  prevI = newI + 2;
  returning.o = escaping.substring(prevI);

  return returning;
}

function plusNodeRdf(updater: Updater, s: string, p: string, o: string) {
  updater.plus(DATA_TYPE.NODE_RDF, escapeNodeMetadata({ s: s, p: p, o: o }), 0, 1);
}
function plusLiteralRdf(updater: Updater, s: string, p: string, o: string) {
  updater.plus(DATA_TYPE.LITERAL_RDF, escapeLiteralMetadata({ s: s, p: p, o: o }), 0, 1);
}

//generate empty datas with db id
function genDatasWithDbId(): DatasWithDbId {
  return {
    WALLET: new Map<string, WithDbId<Wallet>>(),
    SENSOR: new Map<string, WithDbId<SensorRegistration>>(),
    BROKER: new Map<string, WithDbId<BrokerRegistration>>(),
    INTEGRATION: new Map<string, WithDbId<IntegrationExpanded>>(),
    NODE_RDF: new Map<string, WithDbId<number>>(),
    LITERAL_RDF: new Map<string, WithDbId<number>>()
  };
}

//generate empty datas without db id
function genDatas(): Datas {
  return {
    WALLET: new Map<string, Wallet>(),
    SENSOR: new Map<string, SensorRegistration>(),
    BROKER: new Map<string, BrokerRegistration>(),
    INTEGRATION: new Map<string, IntegrationExpanded>(),
    NODE_RDF: new Map<string, number>(),
    LITERAL_RDF: new Map<string, number>()
  };
}

//store 7*24 hours (1 week) worth in memory
export const MAX_BLOCKS_IN_MEMORY = Math.ceil(7 * 24 * 60 * 60 * 1000 / MINE_RATE);

//a block and extra information needed to undo the block
class ChainLink {
  block: Block;
  undos: Datas;
  constructor(block: Block) {
    this.block = block;
    this.undos = genDatas();
  }

  serialize(): string {
    let returning = '{"block":' + JSON.stringify(this.block) + ',"undos":{';

    let firstData = true;
    let firstValue = true;

    for (const [type, data] of Object.entries(this.undos)) {
      if (!firstData) {
        returning += ',';
      } else {
        firstData = false;
      }
      returning += '"' + type + '":{';
      firstValue = true;
      for (const [key, value] of data.entries()) {
        if (!firstValue) {
          returning += ',';
        } else {
          firstValue = false;
        }

        returning += '"' + key + '":' + JSON.stringify(value);
      }
      returning += '}';
    }
    returning += '}}';

    return returning;
  }

  static deserialize(data: string): ChainLink {
    const parsed: {
      block: Block;
      undos: {
        [index: string]: {
          [index: string]: Wallet & SensorRegistration & BrokerRegistration & IntegrationExpanded & number
        }
      }
    } = JSON.parse(data);

    const returning = new ChainLink(parsed.block);
    for (const dataType of Object.values(DATA_TYPE)) {
      if (parsed.undos[dataType] !== undefined) {
        for (const [key, value] of Object.entries(parsed.undos[dataType])) {
          returning.undos[dataType].set(key, value);
        }
      }
    }

    return returning;
  }
}

//merge a datas into another
function mergeData<K, V>(from: Map<K, V>, to: Map<K, V>) {
  for (const [key, value] of from.entries()) {
    if (value === null) {
      to.delete(key);
    } else {
      to.set(key, value);
    }
  }
}

function mergeDatas(from: Datas, to: Datas) {
  mergeData(from.WALLET, to.WALLET);
  mergeData(from.SENSOR, to.SENSOR);
  mergeData(from.BROKER, to.BROKER);
  mergeData(from.INTEGRATION, to.INTEGRATION);
  mergeData(from.NODE_RDF, to.NODE_RDF);
  mergeData(from.LITERAL_RDF, to.LITERAL_RDF);
}

//copy a value, object or value
function makeCopy<T>(v: T): T {
  return structuredClone(v);
}

//get a value from a particular type of datas
function getDatas<T>(type: Data_type, key: string, _default: T, datas: Datas[], parent: DatasWithDbId): T {
  for (const data of datas) {
    if (data[type].has(key)) {
      return makeCopy(data[type].get(key) as T);
    }
  }
  if (parent[type].has(key)) {
    return makeCopy(parent[type].get(key).base as T);
  }
  return _default;
}

//do something for a every instance of a particular type of datas
function forEveryData<T>(type: Data_type, datas: Datas[], parent: DatasWithDbId, transform: (k:string, v:T)=>void) {
  for (const data of datas) {
    for (const [key, value] of data[type]) {
      transform(key, value as T);
    }
  }
  for (const [key, value] of parent[type]) {
    transform(key, value.base as T);
  }
}

type UpdaterChanges = {
  [Property in keyof Datas]: Set<string>
};

//creates an empty changes object
function genChanges(): UpdaterChanges {
  return {
    WALLET: new Set<string>(),
    SENSOR: new Set<string>(),
    BROKER: new Set<string>(),
    INTEGRATION: new Set<string>(),
    NODE_RDF: new Set<string>(),
    LITERAL_RDF: new Set<string>()
  };
}

function addDataToChanges(data: Datas, changes: UpdaterChanges) {
  for (const key of data.WALLET.keys()) {
    changes.WALLET.add(key);
  }
  for (const key of data.SENSOR.keys()) {
    changes.SENSOR.add(key);
  }
  for (const key of data.BROKER.keys()) {
    changes.BROKER.add(key);
  }
  for (const key of data.INTEGRATION.keys()) {
    changes.INTEGRATION.add(key);
  }
  for (const key of data.NODE_RDF.keys()) {
    changes.NODE_RDF.add(key);
  }
  for (const key of data.LITERAL_RDF.keys()) {
    changes.LITERAL_RDF.add(key);
  }
}

type UpdateFinish = {
  newBlocks: ChainLink[];
  changes: UpdaterChanges;
};

const CREATE_QUERY_INITIAL = "INSERT DATA {" as const;
const DELETE_QUERY_INITIAL = "DELETE DATA {" as const;

type Insert_result = {
  id: number;
};

async function rollbackErr(chain: Blockchain, orig: Error) {
  try {
    console.log(`Rolling back: ${orig.message} at ${orig.stack}`);
    chain.persistence.run("ROLLBACK;");
  } catch (err) {
    if (err) {
      console.error(`COULD NOT ROLLBACK: '${err.message}' caused by original: '${orig.message}' at ${orig.stack}`);
      process.exit(-1);
    }
  }
}

async function onUpdateFinish(updater: Updater) {
  const chain = updater.parent;

  //debug checks
  let foundBad = false;
  for (let i = 0; i < chain.links.length - 1; i++) {
    if (!verifyBlockHash(chain.links[i].block, chain.links[i + 1].block).result) {
      console.error(`Bad internal link at ${i}->${i + 1}`);
      console.error(`hash: ${chain.links[i].block.hash}, lastHash: ${chain.links[i + 1].block.lastHash} `);
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
    //for debug
    //console.log(`chain.linksStartI: ${chain.linksStartI}, updater.startIndex: ${updater.startIndex}, updater.links.length: ${updater.links.length}, chain.length():${chain.length()}`);
    //first remove any blocks from the blockchain that have been undone
    if (updater.startIndex < chain.length()) {
      chain.links = chain.links.slice(0, updater.startIndex - chain.linksStartI);
    }
    chain.linksStartI = Math.max(updater.startIndex + updater.links.length - MAX_BLOCKS_IN_MEMORY, oldLinksStartI);
    if (updater.startIndex === chain.linksStartI) {
      chain.links = updater.links;
    } else {
      //we want to add the upder.links, with as much of the existing chain as we can
      //updater.links starts at updater.startIndex, so we want everything before that
      const constructing = chain.links.slice(chain.linksStartI - oldLinksStartI);
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
      console.error(`Bad internal link at ${i}->${i + 1}`);
      console.error(`hash: ${chain.links[i].block.hash}, lastHash: ${chain.links[i + 1].block.lastHash} `);
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

  mergeDatas(updater.curData, updater.prevData);
  addDataToChanges(updater.prevData, changes); //update data and changes

  for (const [key, value] of updater.prevData.WALLET.entries()) {
    const foundParent = updater.parent.data.WALLET.get(key);
    if (foundParent === undefined) {
      const newId = await updater.parent.persistence.get<Insert_result>("INSERT INTO Wallet(key, balance, counter) VALUES(?,?,?) RETURNING id;",
        key, value.balance, value.counter);

      updater.parent.data.WALLET.set(key, {
        dbId: newId.id,
        base: {
          counter: value.counter,
          balance: value.balance
        }
      });
    } else {
      await updater.parent.persistence.run("UPDATE Wallet SET balance = ?, counter = ? WHERE id = ?;",
        value.balance, value.counter, foundParent.dbId);

      foundParent.base.balance = value.balance;
      foundParent.base.counter = value.counter;
    }
  }
  for (const [key, value] of updater.prevData.BROKER.entries()) {
    const foundParent = updater.parent.data.BROKER.get(key);
    if (foundParent === undefined) {
      const newId = await updater.parent.persistence.get<Insert_result>("INSERT INTO Broker(parseable) VALUES(?) RETURNING id;",
        JSON.stringify(value));

      updater.parent.data.BROKER.set(value.metadata.name, {
        dbId: newId.id,
        base: value
      });
    } else {
      await updater.parent.persistence.run("UPDATE Broker SET parseable = ? WHERE id = ?;",
        JSON.stringify(value), foundParent.dbId);
      foundParent.base = value;
    }
  }
  for (const [key, value] of updater.prevData.SENSOR.entries()) {
    const foundParent = updater.parent.data.SENSOR.get(key);
    if (foundParent === undefined) {
      const newId = await updater.parent.persistence.get<Insert_result>("INSERT INTO Sensor(parseable) VALUES(?) RETURNING id;",
        JSON.stringify(value));

      updater.parent.data.SENSOR.set(value.metadata.name, {
        dbId: newId.id,
        base: value
      });
    } else {
      await updater.parent.persistence.run("UPDATE Sensor SET parseable = ? WHERE id = ?;",
        JSON.stringify(value), foundParent.dbId);
      foundParent.base = value;
    }
  }
  for (const [key, value] of updater.prevData.INTEGRATION.entries()) {
    const foundParent = updater.parent.data.INTEGRATION.get(key);
    if (foundParent === undefined) {
      const newId = await updater.parent.persistence.get<Insert_result>("INSERT INTO Integration(parseable) VALUES(?) RETURNING id;",
        JSON.stringify(value));

      const key = makeIntegrationKey(value.input, value.counter);
      const setValue = {
        dbId: newId.id,
        base: value
      };

      updater.parent.data.INTEGRATION.set(key, setValue);
    } else {
      await updater.parent.persistence.run("UPDATE Integration SET parseable = ? WHERE id = ?;",
        JSON.stringify(value), foundParent.dbId);
      foundParent.base = value;
    }
  }

  let createQuery: string = CREATE_QUERY_INITIAL;
  let deleteQuery: string = DELETE_QUERY_INITIAL;

  for (const [escaped, count] of updater.prevData.NODE_RDF) {
    const existing = updater.parent.data.NODE_RDF.get(escaped);
    const triple = unEscapeNodeMetadata(escaped);
    if (existing === undefined) {
      if (count > 0) { //only write if count > 0, otherwise it should be 0, and no point writing it as default is 0
        const newId = await updater.parent.persistence.get<Insert_result>("INSERT INTO NodeTriples(key,value) VALUES (?,?) RETURNING id;",
          escaped, count);

        updater.parent.data.NODE_RDF.set(escaped, {
          dbId: newId.id,
          base: count
        });

        createQuery += `<${triple.s}> <${triple.p}> <${triple.o}>.`;
      }
    } else {
      if (count === 0) {
        await updater.parent.persistence.run("DELETE FROM NodeTriples WHERE id = ?;",
          existing.dbId);

        updater.parent.data.NODE_RDF.delete(escaped);

        deleteQuery += `<${triple.s}> <${triple.p}> <${triple.o}>.`;
      } else {
        await updater.parent.persistence.run("UPDATE NodeTriples SET value=? WHERE id =?;",
          count, escaped);

        existing.base = count;
      }
    }
  }
  for (const [escaped, count] of updater.prevData.LITERAL_RDF) {
    const existing = updater.parent.data.LITERAL_RDF.get(escaped);
    const triple = unEscapeNodeMetadata(escaped);
    if (existing === undefined) {
      if (count > 0) { //only write if count > 0, otherwise it should be 0, and no point writing it as default is 0
        const newId = await updater.parent.persistence.get<Insert_result>("INSERT INTO LiteralTriples(key,value) VALUES (?,?) RETURNING id;",
          escaped, count);

        updater.parent.data.LITERAL_RDF.set(escaped, {
          dbId: newId.id,
          base: count
        });

        createQuery += `<${triple.s}> <${triple.p}> "${triple.o}".`;
      }
    } else {
      if (count === 0) {
        await updater.parent.persistence.run("DELETE FROM LiteralTriples WHERE id = ?;",
          existing.dbId);

        updater.parent.data.LITERAL_RDF.delete(escaped);

        deleteQuery += `<${triple.s}> <${triple.p}> "${triple.o}".`;
      } else {
        await updater.parent.persistence.run("UPDATE LiteralTriples SET value=? WHERE id =?;",
          count, escaped);

        existing.base = count;
      }
    }
  }

updater.curData = genDatas(); //reset cur and prev data
updater.prevData = genDatas();

  if (updater.parent.fuseki_location !== null) {
    let sending = "";
    if (deleteQuery.length > DELETE_QUERY_INITIAL.length) {
      sending += deleteQuery + "};";
    }
    if (createQuery.length > CREATE_QUERY_INITIAL.length) {
      sending += createQuery + "};";
    }

    const res = await fetch(updater.parent.fuseki_location + "/update", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: 'update=' + encodeURIComponent(sending)
    });
    if (res.status !== 200) {
      console.log(`fuseki update non 200: ${res.statusText}`);
    }
  }

  await updater.parent.persistence.run("COMMIT;");

  const newLinks = updater.links;
  updater.links = [];

  return {
    newBlocks: newLinks,
    changes: changes
  };
}

//these make the names of various types of objects in the RDF db

function makeBlockName(hash: string): string {
  return URIS.OBJECT.BLOCK + '/' + hash;
}

function makePaymentTransactionName(payment: Payment): string {
  return URIS.OBJECT.PAYMENT_TX + '/' + ChainUtil.hash(Payment.toHash(payment));
}

function makeIntegrationTransactionName(integration: Integration): string {
  return URIS.OBJECT.INTEGRATION_TX + '/' + ChainUtil.hash(Integration.toHash(integration));
}

function makeCommitTransactionName(commit: Commit): string {
  return URIS.OBJECT.COMPENSATION_TX + '/' + ChainUtil.hash(Commit.toHash(commit));
}

function makeSensorTransactionName(sensorRegistration: SensorRegistration): string {
  return URIS.OBJECT.SENSOR_REGISTRATION_TX + '/' + ChainUtil.hash(SensorRegistration.toHash(sensorRegistration));
}

function makeBrokerTransactionName(brokerName: BrokerRegistration): string {
  return URIS.OBJECT.BROKER_REGISTRATION_TX + '/' + ChainUtil.hash(BrokerRegistration.toHash(brokerName));
}

function makeWalletName(input: string): string {
  return URIS.OBJECT.WALLET + '/' + input;
}

//creates RDF triples to describe a block header
function genBlockHeaderRDF(updater: Updater, block: Block): void {
  const blockName = makeBlockName(block.hash);
  const prevBlockName = makeBlockName(block.lastHash);


  plusLiteralRdf(updater, blockName, URIS.PREDICATE.TYPE, URIS.OBJECT.BLOCK);
  plusNodeRdf(updater, blockName, URIS.PREDICATE.LAST_BLOCK, prevBlockName);
  plusNodeRdf(updater, blockName, URIS.PREDICATE.MINED_BY, makeWalletName(block.reward));
}

//this object carries all state needed to update a chain
class Updater {
  parent: Blockchain; //the blockchain it's updating
  links: ChainLink[]; //new links it's adding
  prevData: Datas; //previous steps datas
  curData: Datas; //current steps datas
  startIndex: number; //where the new links are inserting
  on: number; //index in the chain we're currently on
  constructor(parent: Blockchain) {
    this.parent = parent;
    this.links = [];
    this.prevData = genDatas();
    this.curData = genDatas();
    this.startIndex = parent.length();
    this.on = this.startIndex;
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

  //add a new block
  newBlock(block: Block): void {
    if (this.links.length >= MAX_BLOCKS_IN_MEMORY) {
      this.links.shift();
    }
    this.links.push(new ChainLink(block));
    this.on++;

    mergeDatas(this.curData, this.prevData);
    this.curData = genDatas();

    genBlockHeaderRDF(this, block);
  }

  //remove a block
  undoBlock(): void {
    if (this.on === 0) {
      console.error("Tried to undo beyond genesis");
      process.exit(-1);
    }

    const undoing = this.prevLink();
    this.on--;
    if (this.on < this.startIndex) {
      this.startIndex = this.on;
    }

    mergeDatas(this.curData, this.prevData);
    this.curData = genDatas();
    mergeDatas(undoing.undos, this.prevData);

    if (this.links.length > 0) {
      this.links.pop();
    }
  }

  //get a datum
  get<T>(type: Data_type, key: string, _default: T): T {
    return getDatas(type, key, _default, [this.curData, this.prevData], this.parent.data);
  }

  //set a datum
  set<T>(type: Data_type, key: string, value: T): void {
    const existing = getDatas(type, key, null, [this.prevData], this.parent.data);

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

  //add a numeric value to an existing numeric value
  plus(type: Data_type, key: string, _default: number, value:number): void {
    if (value === 0) {
      return;
    }
    this.set(type, key, this.get(type, key, _default) + value);
  }

  //get the public keys of all current brokers
  getBrokerPublicKeys(): string[] {
    const keys = new Set<string>();

    forEveryData<BrokerRegistration>(DATA_TYPE.BROKER, [this.curData, this.prevData], this.parent.data, (_key, value) => {
      keys.add(value.input);
    });

    return Array.from(keys);
  }

  //finish updating and persist the changes if persist is true
  async persist(): Promise<UpdateFinish> {
    //persist blockchain first
    await this.parent.persistence.run("BEGIN;");
    try {
      await writeBlocks(this.parent, this.startIndex, this.links);
      return await onUpdateFinish(this);
    } catch (err) {
      await rollbackErr(this.parent, err);
      throw err;
    }
  }
}

//replace the SESHAMART_URI_REPLACE prefix with the sensor name, if it is prefixed
function uriReplacePrefix(testing:string, sensorName:string):string {
  if (testing.startsWith(SENSHAMART_URI_REPLACE)) {
    return sensorName.concat(testing.slice(SENSHAMART_URI_REPLACE.length));
  } else {
    return testing;
  }
}

function payoutIntegration(updater: Updater, integration: IntegrationExpanded): void {
  console.log(`Paying out integration: ${makeIntegrationKey(integration.input, integration.counter)}`);

  for (let i = 0; i < integration.outputs.length; i++) {
    const output = integration.outputs[i];
    console.log(`Output ${i}, amount: ${output.amount}`);
    const outputExtra = integration.outputsExtra[i];

    const compensationRatio = outputExtra.compensationTotal / Object.values(outputExtra.witnesses).length;

    const brokerGettingPaid = outputExtra.witnesses[outputExtra.brokerOwner];

    let amount_left = output.amount;

    if (brokerGettingPaid) {
      const brokerWallet = updater.get<Wallet>(DATA_TYPE.WALLET, outputExtra.brokerOwner, { counter: 0, balance: INITIAL_BALANCE });
      const paying = BROKER_COMMISION * amount_left
      brokerWallet.balance += paying;
      amount_left -= paying;
      updater.set<Wallet>(DATA_TYPE.WALLET, outputExtra.brokerOwner, brokerWallet);
      console.log(`Broker '${outputExtra.brokerOwner} paid: ${ paying }`);
    }

    const sensorWallet = updater.get<Wallet>(DATA_TYPE.WALLET, outputExtra.sensorOwner, { counter: 0, balance: INITIAL_BALANCE });
    const paying = compensationRatio * amount_left;
    sensorWallet.balance += paying;
    amount_left -= paying;
    updater.set<Wallet>(DATA_TYPE.WALLET, outputExtra.sensorOwner, sensorWallet);
    console.log(`Sensor '${outputExtra.sensorOwner}' paid: ${paying}`);

    const integrateeWallet = updater.get<Wallet>(DATA_TYPE.WALLET, integration.input, { counter: 0, balance: INITIAL_BALANCE });
    integrateeWallet.balance += amount_left;
    updater.set<Wallet>(DATA_TYPE.WALLET, integration.input, integrateeWallet);
    console.log(`Integratee '${outputExtra.sensorOwner}' compensated: ${amount_left}`);
  }
}

//the following functions either generate the RDF for a particular tx type, or validate and apply the tx to the updater

function genPaymentRDF(updater: Updater, blockName: string, tx: Payment): void{

  const transactionName = makePaymentTransactionName(tx);

  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_PAYMENT, transactionName);

  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.REWARDED, String(tx.rewardAmount));
  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.TYPE, URIS.OBJECT.PAYMENT_TX);
}

function stepPayment(updater: Updater, reward:string, tx:Payment, blockName: string):Result {
  const verifyRes = Payment.verify(tx);
  if (isFailure(verifyRes)) {
    return {
      result: false,
      reason: "couldn't verify a payment: " + verifyRes.reason
    };
  }

  const inputWallet = updater.get<Wallet>(DATA_TYPE.WALLET, tx.input, { counter: 0, balance: INITIAL_BALANCE });

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

  updater.set(DATA_TYPE.WALLET, tx.input, inputWallet);

  for (const output of tx.outputs) {
    const outputWallet = updater.get<Wallet>(DATA_TYPE.WALLET, output.publicKey, { counter: 0, balance: INITIAL_BALANCE });
    outputWallet.balance += output.amount;
    updater.set(DATA_TYPE.WALLET, output.publicKey, outputWallet);
  }
  const rewardWallet = updater.get<Wallet>(DATA_TYPE.WALLET, reward, { counter: 0, balance: INITIAL_BALANCE });
  rewardWallet.balance += tx.rewardAmount;
  updater.set(DATA_TYPE.WALLET, reward, rewardWallet);

  genPaymentRDF(updater, blockName, tx);

  return {
    result: true
  };
}

function genIntegrationRDF(updater: Updater, blockName: string, tx: Integration): void {

  const transactionName = makeIntegrationTransactionName(tx);

  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_INTEGRATION, transactionName);

  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.REWARDED, String(tx.rewardAmount));
  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.HAS_HASH, ChainUtil.hash(Integration.toHash(tx)));
  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.TYPE, URIS.OBJECT.INTEGRATION_TX);
}

function stepIntegration(updater: Updater, reward: string, startTime: number, tx: Integration, blockName: string):Result {
  const verifyRes = Integration.verify(tx);
  if (isFailure(verifyRes)) {
    return {
      result: false,
      reason: "couldn't verify a integration: " + verifyRes.reason
    };
  }

  const inputWallet = updater.get<Wallet>(DATA_TYPE.WALLET, tx.input, { counter: 0, balance: INITIAL_BALANCE });

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

  const outputsExtra: IntegrationOutputExtra[] = [];

  const txCopy: IntegrationExpanded = Object.assign({
    startTime: startTime,
    witnesses: {},
    compensationTotal: 0,
    uncommittedCount: 0,
    outputsExtra: outputsExtra,
    state: INTEGRATION_STATE.RUNNING
  }, tx);

  const sensorBrokers = new Set<string>();

  for (const output of tx.outputs) {
    const foundSensor = updater.get(DATA_TYPE.SENSOR, output.sensorName, null);

    if (foundSensor === null) {
      return {
        result: false,
        reason: `Integration references non-existant sensor: ${output.sensorName}`
      };
    }
    if (ChainUtil.hash(SensorRegistration.toHash(foundSensor)) !== output.sensorHash) {
      return {
        result: false,
        reason: "Integration references non-current version of sensor"
      };
    }

    const foundBroker = updater.get<BrokerRegistration>(DATA_TYPE.BROKER, SensorRegistration.getIntegrationBroker(foundSensor), null);

    if (foundBroker === null) {
      return {
        result: false,
        reason: "Internal consitency error, can't find broker referenced by commited sensor registration"
      };
    }

    if (ChainUtil.hash(BrokerRegistration.toHash(foundBroker)) !== output.brokerHash) {
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

    const adding: IntegrationOutputExtra = {
      sensorCostPerKB: SensorRegistration.getCostPerKB(foundSensor),
      sensorCostPerMin: SensorRegistration.getCostPerMinute(foundSensor),
      broker: SensorRegistration.getIntegrationBroker(foundSensor),
      brokerOwner: foundBroker.input,
      sensorOwner: foundSensor.input,
      compensationTotal: 0,
      witnesses: {}
    };    

    adding.witnesses[foundBroker.input] = false;
    sensorBrokers.add(foundBroker.input);

    txCopy.uncommittedCount++;
    outputsExtra.push(adding);
  }

  updater.set(DATA_TYPE.WALLET, tx.input, inputWallet);

  const rewardWallet = updater.get<Wallet>(DATA_TYPE.WALLET, reward, { counter: 0, balance: INITIAL_BALANCE });
  rewardWallet.balance += tx.rewardAmount;
  updater.set(DATA_TYPE.WALLET, reward, rewardWallet);

  const brokersFinal: string[] = [];
  const brokersInitial = updater.getBrokerPublicKeys();
  for (const broker of brokersInitial) {
    if (!sensorBrokers.has(broker)) {
      brokersFinal.push(broker);
    }
  }

  const witnesses = Integration.chooseWitnesses(tx, brokersFinal);

  if (isFailure(witnesses)) {
    return {
      result: false,
      reason: "Couldn't choose witnesses: " + witnesses.reason
    };
  }

  for (const outputExtra of txCopy.outputsExtra) {
    for (const witness of witnesses.witnesses) {
      outputExtra.witnesses[witness] = false;
      txCopy.uncommittedCount++;
    }
  }

  updater.set(DATA_TYPE.INTEGRATION, makeIntegrationKey(txCopy.input, txCopy.counter), txCopy);

  genIntegrationRDF(updater, blockName, txCopy);

  return {
    result: true
  };
}

function genCommitRDF(updater: Updater, blockName: string, tx: Commit): void {
  const transactionName = makeCommitTransactionName(tx);

  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_COMMIT, transactionName);

  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.TYPE, URIS.OBJECT.COMMIT_TX);
}

function stepCommit(updater: Updater, tx: Commit, blockName: string): Result {
  const verifyRes = Commit.verify(tx);

  if (isFailure(verifyRes)) {
    return {
      result: false,
      reason: "Couldn't verify a commit: " + verifyRes.reason
    };
  }

  const integrationKey = makeIntegrationKey(tx.integration.input, tx.integration.counter);

  const foundIntegration = updater.get<IntegrationExpanded>(DATA_TYPE.INTEGRATION, integrationKey, null);

  if (foundIntegration === null) {
    return {
      result: false,
      reason: `Couldn't find integration '${integrationKey}' referenced by commit`
    };
  }

  for (const output of tx.outputs) {
    if (output.i >= foundIntegration.outputsExtra.length) {
      return {
        result: false,
        reason: `Commit tx references an output that doesn't exist`
      };
    }
    const integrationOutput = foundIntegration.outputsExtra[output.i];
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
    foundIntegration.uncommittedCount--;
    console.log(`${tx.input} committed ${integrationKey} ${output.i}: ${output.commitRatio}. Uncommitted count = ${foundIntegration.uncommittedCount}`);
  }

  if (foundIntegration.uncommittedCount === 0) {
    payoutIntegration(updater, foundIntegration);
    foundIntegration.state = INTEGRATION_STATE.COMMITTED;
  }

  updater.set(DATA_TYPE.INTEGRATION, integrationKey, foundIntegration);

  genCommitRDF(updater, blockName, tx);

  return {
    result: true
  };
}

function genSensorRegistrationRDF(updater: Updater, blockName: string, tx: SensorRegistration, prevSensor: SensorRegistration | null): void {
  const transactionName = makeSensorTransactionName(tx);

  for (const triple of SensorRegistration.getExtraNodeMetadata(tx)) {
    plusNodeRdf(updater, uriReplacePrefix(triple.s, transactionName), uriReplacePrefix(triple.p, transactionName), uriReplacePrefix(triple.o, transactionName));
  }
  for (const triple of SensorRegistration.getExtraLiteralMetadata(tx)) {
    plusLiteralRdf(updater, uriReplacePrefix(triple.s, transactionName), uriReplacePrefix(triple.p, transactionName), String(triple.o));
  }

  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_SENSOR_REGISTRATION, transactionName);

  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.REWARDED, String(tx.rewardAmount));
  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.HAS_HASH, ChainUtil.hash(SensorRegistration.toHash(tx)));

  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.TYPE, URIS.OBJECT.SENSOR_REGISTRATION_TX);
  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.HAS_COUNTER, String(tx.counter));
  plusNodeRdf(updater, transactionName, URIS.PREDICATE.IS_OWNED_BY, makeWalletName(tx.input));
  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.DEFINES, SensorRegistration.getSensorName(tx));
  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.COSTS_PER_MINUTE, String(SensorRegistration.getCostPerMinute(tx)));
  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.COSTS_PER_KB, String(SensorRegistration.getCostPerKB(tx)));
  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.USES_BROKER, SensorRegistration.getIntegrationBroker(tx));

  if (prevSensor !== null) {
    const prevTxName = makeSensorTransactionName(prevSensor);
    plusNodeRdf(updater, transactionName, URIS.PREDICATE.SUPERCEDES, prevTxName);
  }
}

function stepSensorRegistration(updater: Updater, reward: string, tx: SensorRegistration, blockName: string):Result {
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

  const inputWallet = updater.get<Wallet>(DATA_TYPE.WALLET, tx.input, { balance: INITIAL_BALANCE, counter: 0 });

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

  updater.set(DATA_TYPE.WALLET, tx.input, inputWallet);

  const rewardWallet = updater.get<Wallet>(DATA_TYPE.WALLET, reward, { counter: 0, balance: INITIAL_BALANCE });
  rewardWallet.balance += tx.rewardAmount;
  updater.set(DATA_TYPE.WALLET, reward, rewardWallet);

  const sensorName = SensorRegistration.getSensorName(tx);

  const foundExistingSensor: SensorRegistration | null = updater.get(DATA_TYPE.SENSOR, sensorName, null);

  if (foundExistingSensor !== null) {
    if (foundExistingSensor.input !== tx.input) {
      return {
        result: false,
        reason: "A sensor has already been defined with this name"
      };
    }
  }

  updater.set(DATA_TYPE.SENSOR, sensorName, tx);

  genSensorRegistrationRDF(updater, blockName, tx, foundExistingSensor);

  return {
    result: true
  };
}

function genBrokerRegistrationRDF(updater: Updater, blockName: string, tx: BrokerRegistration, prevBroker: BrokerRegistration | null): void {
  const transactionName = makeBrokerTransactionName(tx);

  for (const triple of BrokerRegistration.getExtraNodeMetadata(tx)) {
    plusNodeRdf(updater, uriReplacePrefix(triple.s, transactionName), uriReplacePrefix(triple.p, transactionName), uriReplacePrefix(triple.o, transactionName));
  }
  for (const triple of BrokerRegistration.getExtraLiteralMetadata(tx)) {
    plusLiteralRdf(updater, uriReplacePrefix(triple.s, transactionName), uriReplacePrefix(triple.p, transactionName), String(triple.o));
  }

  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
  plusNodeRdf(updater, blockName, URIS.PREDICATE.CONTAINS_BROKER_REGISTRATION, transactionName);

  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.REWARDED, String(tx.rewardAmount));
  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.HAS_HASH, ChainUtil.hash(BrokerRegistration.toHash(tx)));

  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.TYPE, URIS.OBJECT.BROKER_REGISTRATION_TX);
  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.HAS_COUNTER, String(tx.counter));
  plusNodeRdf(updater, transactionName, URIS.PREDICATE.IS_OWNED_BY, makeWalletName(tx.input));
  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.DEFINES, BrokerRegistration.getBrokerName(tx));
  plusLiteralRdf(updater, transactionName, URIS.PREDICATE.HAS_ENDPOINT, BrokerRegistration.getEndpoint(tx));

  if (prevBroker !== null) {
    const prevTxName = makeBrokerTransactionName(prevBroker);
    plusNodeRdf(updater, transactionName, URIS.PREDICATE.SUPERCEDES, prevTxName);
  }
}

function stepBrokerRegistration(updater: Updater, reward: string, tx: BrokerRegistration, blockName: string): Result {
  const verifyRes = BrokerRegistration.verify(tx);
  if (isFailure(verifyRes)) {
    return {
      result: false,
      reason: "Couldn't verify a broker registration: " + verifyRes.reason
    };
  }

  const inputWallet = updater.get<Wallet>(DATA_TYPE.WALLET, tx.input, { counter: 0, balance: INITIAL_BALANCE });

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
  updater.set(DATA_TYPE.WALLET, tx.input, inputWallet);

  const rewardWallet = updater.get<Wallet>(DATA_TYPE.WALLET, reward, { counter: 0, balance: INITIAL_BALANCE });
  rewardWallet.balance += tx.rewardAmount;
  updater.set(DATA_TYPE.WALLET, reward, rewardWallet);

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

  genBrokerRegistrationRDF(updater, blockName, tx, foundExistingBroker);

  return {
    result: true
  };
}

function checkIntegrationsForTimeout(updater: Updater, timestamp: number) {
  const checked = new Set<string>();

  //check curdata
  for (const [key, integration] of updater.curData.INTEGRATION) {
    if (integration.state !== INTEGRATION_STATE.RUNNING) {
      continue;
    }
    let all_timedout: boolean = true;
    for (let i = 0; i < integration.outputs.length; ++i) {
      const output = integration.outputs[i];
      const extra = integration.outputsExtra[i];

      //we find the time this would expire, add broker_dead_buffer_time to it, if it has passed, we've timedout
      //time this would expire:
      //costNow = (now - startTime) * (costPerMin / minute_ms)
      //now = costNow / (costPerMin / minute_ms) + startTime
      const delta = (output.amount / (extra.sensorCostPerMin / MINUTE_MS) + integration.startTime) + BROKER_DEAD_BUFFER_TIME_MS - timestamp;
      //console.log(`curData checking for timeout: ${key} ${i}: ${delta}`);
      if (0 < delta) {
        all_timedout = false;
        break;
      }
    }

    if (all_timedout) {
      console.log(`integration ${key} timed out`);
      payoutIntegration(updater, integration);
      integration.state = INTEGRATION_STATE.TIMED_OUT;
      updater.set<IntegrationExpanded>(DATA_TYPE.INTEGRATION, key, integration);
    }
    checked.add(key);
  }

  //check prevdata
  for (const [key, integration] of updater.prevData.INTEGRATION) {
    if (checked.has(key) || integration.state !== INTEGRATION_STATE.RUNNING) {
      continue;
    }
    let all_timedout: boolean = true;
    for (let i = 0; i < integration.outputs.length; ++i) {
      const output = integration.outputs[i];
      const extra = integration.outputsExtra[i];

      //we find the time this would expire, add broker_dead_buffer_time to it, if it has passed, we've timedout
      //time this would expire:
      //costNow = (now - startTime) * (costPerMin / minute_ms)
      //now = costNow / (costPerMin / minute_ms) + startTime
      const delta = (output.amount / (extra.sensorCostPerMin / MINUTE_MS) + integration.startTime) + BROKER_DEAD_BUFFER_TIME_MS - timestamp;
      //console.log(`prevData checking for timeout: ${key} ${i}: ${delta}`);
      if (0 < delta) {
        all_timedout = false;
        break;
      }
    }

    if (all_timedout) {
      console.log(`integration ${key} timed out`);
      payoutIntegration(updater, integration);
      integration.state = INTEGRATION_STATE.TIMED_OUT;
      updater.set<IntegrationExpanded>(DATA_TYPE.INTEGRATION, key, integration);
    }
    checked.add(key);
  }

  //check blockchain data
  for (const [key, integration] of updater.parent.data.INTEGRATION) {
    if (checked.has(key) || integration.base.state !== INTEGRATION_STATE.RUNNING) {
      continue;
    }
    let all_timedout: boolean = true;
    for (let i = 0; i < integration.base.outputs.length; ++i) {
      const output = integration.base.outputs[i];
      const extra = integration.base.outputsExtra[i];

      //we find the time this would expire, add broker_dead_buffer_time to it, if it has passed, we've timedout
      //time this would expire:
      //costNow = (now - startTime) * (costPerMin / minute_ms)
      //now = costNow / (costPerMin / minute_ms) + startTime
      const delta = (output.amount / (extra.sensorCostPerMin / MINUTE_MS) + integration.base.startTime) + BROKER_DEAD_BUFFER_TIME_MS - timestamp;
      //console.log(`parent checking for timeout: ${key} ${i}: ${delta}`);
      if (0 < delta) {
        all_timedout = false;
        break;
      }
    }

    if (all_timedout) {
      console.log(`integration ${key} timed out`);
      payoutIntegration(updater, integration.base);
      integration.base.state = INTEGRATION_STATE.TIMED_OUT;
      updater.set<IntegrationExpanded>(DATA_TYPE.INTEGRATION, key, integration.base);
    }
  }
}

//verify all txs
function verifyTxs(updater: Updater, reward: string, timestamp: number, payments: Payment[], sensorRegistrations: SensorRegistration[], brokerRegistrations: BrokerRegistration[], integrations: Integration[], commits: Commit[], blockName: string): Result {
  const rewardWallet = updater.get<Wallet>(DATA_TYPE.WALLET, reward, { counter: 0, balance: INITIAL_BALANCE });
  rewardWallet.balance += MINING_REWARD;
  updater.set(DATA_TYPE.WALLET, reward, rewardWallet);

  for (const payment of payments) {
    const res = stepPayment(updater, reward, payment, blockName);
    if (!res.result) {
      return res;
    }
  }

  for (const integration of integrations) {
    const res = stepIntegration(updater, reward, timestamp, integration, blockName);
    if (!res.result) {
      return res;
    }
  }

  for (const commit of commits) {
    const res = stepCommit(updater, commit, blockName);
    if (!res.result) {
      return res;
    }
  }

  for (const brokerRegistration of brokerRegistrations) {
    const res = stepBrokerRegistration(updater, reward, brokerRegistration, blockName);
    if (!res.result) {
      return res;
    }
  }

  for (const sensorRegistration of sensorRegistrations) {
    const res = stepSensorRegistration(updater, reward, sensorRegistration, blockName);
    if (!res.result) {
      return res;
    }
  }

  checkIntegrationsForTimeout(updater, timestamp);

  return {
    result: true,
  };
}

//verify the hash of a block, including the previous hash
function verifyBlockHash(prevBlock: Block, block: Block): Result {
  if (block.lastHash !== prevBlock.hash) {
    return {
      result: false,
      reason: `last hash '${block.lastHash}' didn't match our last hash '${prevBlock.hash}'`
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

//verify a block, including all transactions
function verifyBlock(updater: Updater, verifyingBlock: Block): Result {
  const verifyHashRes = verifyBlockHash(updater.prevBlock(), verifyingBlock);

  if (!verifyHashRes.result) {
    return verifyHashRes;
  }

  updater.newBlock(verifyingBlock);

  return verifyTxs(updater, verifyingBlock.reward, verifyingBlock.timestamp,
    Block.getPayments(verifyingBlock),
    Block.getSensorRegistrations(verifyingBlock),
    Block.getBrokerRegistrations(verifyingBlock),
    Block.getIntegrations(verifyingBlock),
    Block.getCommits(verifyingBlock),
    makeBlockName(verifyingBlock.hash));
}

//verify all blocks, in blocks
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

//called when the blockchain changes, calls all listeners
function onChange(blockchain: Blockchain, newBlocks: Block[], changes: UpdaterChanges, difference: number): void {
  for (const listener of blockchain.listeners) {
    listener(newBlocks, changes, difference);
  }
}

//write a block to persistence
async function writeBlocks(chain: Blockchain, startIndex: number, links: ChainLink[]): Promise<void> {
  for (let i = 0; i < links.length; ++i) {
    await chain.persistence.run("INSERT INTO Blocks(id, parseable) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET parseable = excluded.parseable;",
      startIndex + i, links[i].serialize());
  }
  console.log(`Wrote blocks [${startIndex},${startIndex + links.length})`);
}

//read a block from persistence
async function readBlock(chain: Blockchain, i: number): Promise<ChainLink> {
  if (i >= chain.linksStartI && i < chain.length()) {
    return chain.links[i - chain.linksStartI];
  }
  const row = await chain.persistence.get<ReadBlock_result>("SELECT parseable FROM Blocks WHERE id = ?;", i);

  return ChainLink.deserialize(row.parseable);
}

type OpFunc = () => Promise<unknown>;

class Op {
  op: OpFunc;
  resolve: ResolveCb;
  reject: RejectCb;

  constructor(op: OpFunc, resolve: ResolveCb, reject: RejectCb) {
    this.op = op;
    this.resolve = resolve;
    this.reject = reject;
  }
}


//Add an operation to the blockchains operation queue, and pumps the queue
async function addOp(blockchain: Blockchain, op: Op) {
  blockchain.queue.push(op);

  if (!blockchain.queuePumping) {
    blockchain.queuePumping = true;
      while (blockchain.queue.length > 0) {
      const running = blockchain.queue.pop();
      try {
        running.resolve(await running.op());
      } catch (err) {
        running.reject(err);
      }
    }
    blockchain.queuePumping = false ;
  }
}

//logic to replace the current chain with a new chain
async function replaceImpl(blockchain: Blockchain, newChain: Block[], startI: number): Promise<void> {

  if (newChain.length + startI <= blockchain.linksStartI + blockchain.links.length) { //if the new chain wouldn't be longer than the current
    return;
  }
  if (startI > blockchain.linksStartI + blockchain.links.length) { //if we start before what we have in memory
    throw new Error(`NewBlocks start after our current chain ends, we're missing bits in the middle. startI: ${startI}, blockchain.linksStartI: ${blockchain.linksStartI}, blockchain.links.length: ${blockchain.links.length}`);
  }

  //as newblocks must be longer then current, we start from current and walk backwards
  //start with blocks in memory, then start reading from disk (when we implement it)

  let index = blockchain.linksStartI + blockchain.links.length; //current block we're looking at, start at last block in our current chain
  const updater = new Updater(blockchain);

  for (; ;) { //no guard here, one of the first two checks will eventually end the loop
    if (index < startI) { //if we have hit before the new chain start, we haven't found where they diverge
      throw new Error(`Received chain diverges from our chain before received chain's start. recved chain start: ${startI}`);
    }
    if (index < blockchain.linksStartI) { //if links aren't in memory, we need to load them from persistence
      //currently NYI, return an error
      throw new Error("We currently can't replace the chain if the divergence happens out of memory");
    }

    const oldHash = index === 0 ? Block.genesis().hash : blockchain.links[index - blockchain.linksStartI - 1].block.hash;
    const newBlock = newChain[index - startI];
    if (oldHash !== newBlock.lastHash) { //if the last hashes don't match, trhey don't have a common ancestor, and so we haven't found the point of divergence
      console.log(`Undoing block ${index}`);
      updater.undoBlock();
    } else { //else we've found where we have a common ancestor, so we replace everything from here
      const res = verifyBlocks(updater, newChain.slice(index - startI)); //verify the blocks
      if (isFailure(res)) { //if verify failed
        throw new Error(`Verify block failed: ${res.reason}`, { cause: res });
      }

      const finishRes = await updater.persist();

      const newBlocks: Block[] = []; //make blocks array
      for (const link of finishRes.newBlocks) { //for every link
        newBlocks.push(link.block); //add it to newBlocks
      }

      onChange(blockchain, newBlocks, finishRes.changes, blockchain.linksStartI + blockchain.links.length - newBlocks.length); //call handlers
      return;
    }
    --index;
  }
}

//logic to add a block to the current chain
async function addBlockImpl(blockchain: Blockchain, newBlock: Block): Promise<void> {

  const updater = new Updater(blockchain);

  const verifyResult = verifyBlock(updater, newBlock);

  if (isFailure(verifyResult)) {
    throw new Error("Verify failed", { cause: verifyResult });
    return;
  }

  const finishRes = await updater.persist();

  const newBlocks: Block[] = [];
  for (const link of finishRes.newBlocks) {
    const block = link.block;
    newBlocks.push(block);
  }

  onChange(blockchain, newBlocks, finishRes.changes, blockchain.linksStartI + blockchain.links.length - 1);
}

type ReadBlock_result = {
  parseable: string;
};

//logic to read a block from the current chain
async function readBlockImpl(blockchain: Blockchain, i: number): Promise<Block> {
  return (await readBlock(blockchain, i)).block;
}

//logic to where a given chain diverges from the current chain
async function checkForDivergenceImpl(blockchain: Blockchain, startIndex: number, blocks: Block[]): Promise<number> {
  for (let i = 0; i < blocks.length; ++i) {
    if (i + startIndex >= blockchain.linksStartI + blockchain.links.length) {
      return i;
    }
    if (i + startIndex >= blockchain.linksStartI) {
      if (blockchain.links[i + startIndex - blockchain.linksStartI].block.hash !== blocks[i].hash) {
        return i;
      }
    } else {
      const link = await readBlock(blockchain, startIndex + i);

      if (link.block.hash !== blocks[i].hash) {
        return i;
      }
    }
  }
  return blocks.length;
}

type Listener = (newBlocks: Block[], changes: UpdaterChanges, difference: number) => void;


//logic to prepare the statements used by sqlite3 for persistence

type Triple_result = {
  id: number,
  key: string,
  value: number
};

type Tx_result = {
  id: number;
  parseable: string;
}

//read the various data stored in persistence

type Wallet_result = {
  id: number,
  key: string,
  balance: number,
  counter: number
};

//after we've opened the db, check the result and then check the version
async function open_db(chain: Blockchain, db_location: string) {

  const reversingBlocks: ChainLink[] = [];

  chain.persistence = await Persistence.openDb(db_location);

  await chain.persistence.each<Wallet_result>("SELECT id,key,balance,counter FROM Wallet;", (row) => {
    chain.data.WALLET.set(row.key, {
      dbId: row.id,
      base: {
        balance: row.balance,
        counter: row.counter
      }
    });
  });

  await chain.persistence.each<Tx_result>("SELECT id,parseable FROM Broker;", (row) => {
    const broker = JSON.parse(row.parseable) as BrokerRegistration;

    chain.data.BROKER.set(broker.metadata.name, {
      dbId: row.id,
      base: broker
    });
  });

  await chain.persistence.each<Tx_result>("SELECT id,parseable FROM Sensor;", (row) => {
    const sensor = JSON.parse(row.parseable) as SensorRegistration;

    chain.data.SENSOR.set(sensor.metadata.name, {
      dbId: row.id,
      base: sensor
    });
  });

  await chain.persistence.each<Tx_result>("SELECT id,parseable FROM Integration;", (row) => {
    const integration = JSON.parse(row.parseable) as IntegrationExpanded;

    chain.data.INTEGRATION.set(ChainUtil.hash(Integration.toHash(integration)), {
      dbId: row.id,
      base: integration
    });
  });

  await chain.persistence.each<Tx_result>(`SELECT id,parseable FROM Blocks ORDER BY id DESC LIMIT ${MAX_BLOCKS_IN_MEMORY};`, (row) => {
    const link = ChainLink.deserialize(row.parseable) as ChainLink;
    reversingBlocks.push(link);
  });

  chain.links = reversingBlocks.reverse();

  type BlockCountRes = {
    max: number;
  };

  const blockCountRes = await chain.persistence.get<BlockCountRes>(`SELECT MAX(id) AS max FROM Blocks;`);

  chain.linksStartI = Math.max(blockCountRes.max - MAX_BLOCKS_IN_MEMORY + 1, 0);

  await chain.persistence.each<Triple_result>("SELECT id,key,value FROM LiteralTriples;", (row) => {
    chain.data.LITERAL_RDF.set(row.key, {
      dbId: row.id,
      base: row.value
    });
  });
  await chain.persistence.each<Triple_result>("SELECT id,key,value FROM NodeTriples;", (row) => {
    chain.data.NODE_RDF.set(row.key, {
      dbId: row.id,
      base: row.value
    });
  });
}

class Persistence {
  db: Database;
  stmts: Map<string, Statement>;
  private constructor(db: Database) {
    this.db = db;
    this.stmts = new Map<string, Statement>();
  }

  static async openDb(db_location: string): Promise<Persistence> {
    let db: Database = null;

    await wrap_db_op((cb) => db = new sqlite3.Database(db_location, cb));
    await wrap_db_op((cb) => db.run("PRAGMA foreign_keys = ON;", cb));

    type VersionResult = {
      value: string | undefined;
    };

    try {
      const version = await new Promise<VersionResult>((resolve, reject) => {
        db.get("SELECT value FROM Configs WHERE name = 'version';", (err, row: VersionResult) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        });
      });
      if (version.value != DB_EXPECTED_VERSION) {
        throw new Error(`Expected version '${DB_EXPECTED_VERSION}' but persisted db had version '${version.value}'`);
      }
    } catch (_err) {
      await new Promise<void>((resolve, reject) => {
        db.exec(DB_CREATE_QUERY, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

    return new Persistence(db);
  }

  private async prepare(query: string): Promise<Statement> {
    return new Promise<Statement>((resolve, reject) => {
      const stmt = this.db.prepare(query, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(stmt);
        }
      });
    });
  }

  private async getStmt(query: string): Promise<Statement> {
    let stmt: Statement = this.stmts.get(query);
    if (stmt === undefined) {
      stmt = await this.prepare(query);
      this.stmts.set(query, stmt);
    }
    return stmt;
  }

  async each<Row>(query: string, cb: (row: Row) => void, ...input: unknown[]): Promise<void> {
    const stmt = await this.getStmt(query);

    return new Promise<void>((resolve, reject) => {
      stmt.each<Row>([...input], (err, row) => {
        if (!err) {
          cb(row);
        }
      }, (err, _count) => {
        if (err) {
          reject(err);
        } else {
          stmt.reset(() => resolve());
        }
      });
    });
  }

  async all<Row>(query: string, ...input: unknown[]): Promise<Row[]> {
    const stmt = await this.getStmt(query);

    return new Promise<Row[]>((resolve, reject) => {
      stmt.all<Row>([...input], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          stmt.reset(() => resolve(rows));
        }
      });
    });
  }

  async get<Row>(query: string, ...input: unknown[]): Promise<Row> {
    const stmt = await this.getStmt(query);

    return new Promise<Row>((resolve, reject) => {
      stmt.get<Row>([...input], (err, row) => {
        if (err) {
          reject(err);
        } else {
          stmt.reset(() => resolve(row));
        }
      });
    });
  }

  async run(query: string, ...input: unknown[]): Promise<void> {
    const stmt = await this.getStmt(query);

    return new Promise<void>((resolve, reject) => {
      stmt.run(...input, (err: Error) => {
        if (err) {
          reject(err);
        } else {
          stmt.reset(() => resolve());
        }
      });
    });
  }
}

//the object/class to handle a blockchain
class Blockchain {
  static MAX_BLOCKS_IN_MEMORY = MAX_BLOCKS_IN_MEMORY;

  static ERROR_REPLACEHCHAIN = ERROR_REPLACECHAIN;

  data: DatasWithDbId; //data
  links: ChainLink[]; //blocks and the information required to undo them
  linksStartI: number; //where the links in memory start
  listeners: Listener[]; //listeners to blockchain changed events
  persistence: Persistence; //our wrapper to the sqlite3 based persitence
  queuePumping: boolean; //whether someone is currently pumping the queue
  queue: Op[]; //queue of operations. These are queued to stop race conditions
  fuseki_location: string | null; //the URL of a fuseki instance

  private constructor(fuseki_location: string | null) {
    this.data = genDatasWithDbId();
    this.links = [];
    this.linksStartI = 0;
    this.listeners = [];
    sqlite3.verbose();
    this.queue = [];
    this.queuePumping = false;
    this.fuseki_location = fuseki_location;
  }

  static async create(db_location: string, fuseki_location: string | null) {
    const me = new Blockchain(fuseki_location);
    await open_db(me, db_location);
    return me;
  }

  get<T>(type: Data_type, key: string, _default: T): T {
    return getDatas<T>(type, key, _default, [], this.data);
  }

  getAll<T>(type: Data_type): Map<string,T> {
    return this.data[type] as Map<string,T>;
  }

  getBalanceCopy(publicKey: string): number {
    return this.get<Wallet>(DATA_TYPE.WALLET, publicKey, { balance: INITIAL_BALANCE, counter: 0 }).balance;
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
    return this.get<Wallet>(DATA_TYPE.WALLET, publicKey, { balance: INITIAL_BALANCE, counter: 0 }).counter;
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

  async getBlock(i: number): Promise<Block> {
    if (i >= this.linksStartI + this.links.length) {
      throw new Error("i is out of range");
    }
    if (i >= this.linksStartI) {
      return this.links[i - this.linksStartI].block;
    } else {
      return await new Promise<Block>((resolve, reject) => addOp(this, new Op(() => readBlockImpl(this, i), resolve, reject)));
    }
  }

  getCachedBlocks() {
    return {
      start: this.linksStartI,
      blocks: this.links.map((x) => x.block)
    };
  }

  //adds an existing block to the blockchain, returns false if the block can't be added, true if it was added
  async addBlock(newBlock: Block) : Promise<void> {
    await new Promise<void>((resolve,reject) => addOp(this, new Op(() => addBlockImpl(this, newBlock), resolve, reject)));
  }

  async addOp<T>(func: () => Promise<T>) {
    await new Promise<T>((resolve, reject) => addOp(this, new Op(func, resolve, reject)));
  }

  wouldBeValidBlock(rewardee: string, payments: Payment[], sensorRegistrations: SensorRegistration[], brokerRegistrations: BrokerRegistration[], integrations: Integration[], commits: Commit[]) {
    const updater = new Updater(this);
    return verifyTxs(updater, rewardee, Date.now(), payments, sensorRegistrations, brokerRegistrations, integrations, commits, '');
  }

  //static isValidChain(blocks: Block[]) {
  //  const updater = new Updater([genDatas()], [new ChainLink(Block.genesis())], 0, false);
  //  const res = verifyBlocks(updater, blocks);

  //  return res.result;
  //}

  //try and replace a chain with a different one. Start index allows to splice a tail onto the existing head
  async replaceChain(newBlocks: Block[], startIndex: number): Promise<void> {
    if (newBlocks.length === 0) {
      throw new Error("Recieved chain is empty");
    }

    await new Promise<void>((resolve, reject) => addOp(this, new Op(() => replaceImpl(this, newBlocks, startIndex), resolve, reject)));
  }

  async checkForDivergence(blocks: Block[], startIndex: number): Promise<number> {
    return await new Promise<number>((resolve, reject) => addOp(this, new Op(() => checkForDivergenceImpl(this, startIndex, blocks), resolve, reject)));
  }

  addListener(listener:Listener): void {
    this.listeners.push(listener);
  }
}

export default Blockchain;
export { Blockchain, Persistence, type Data_type, ALL_DATA_TYPES, DATA_TYPE, type UpdaterChanges, type IntegrationExpanded };
