import  Block from './block.js';
import Payment from './payment.js';
import SensorRegistration from './sensor-registration.js';
import BrokerRegistration from './broker-registration.js';
import { Integration } from './integration.js';
import Commit from './commit.js';
import { type Result, type ResultFailure, type ResultSuccess, isFailure, resultFromError, type LiteralMetadata, type NodeMetadata } from '../util/chain-util.js';
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
const DB_CREATE_QUERY = 
"CREATE TABLE Configs(\
 id INTEGER NOT NULL PRIMARY KEY,\
 name TEXT NOT NULL,\
 value TEXT NOT NULL);\
INSERT INTO Configs(name,value) VALUES\
 ('version','" + DB_EXPECTED_VERSION + "');\
CREATE TABLE NodeTriples(\
 key TEXT NOT NULL PRIMARY KEY,\
 value INTEGER NOT NULL);\
CREATE TABLE LiteralTriples(\
 key TEXT NOT NULL PRIMARY KEY,\
 value INTEGER NOT NULL);\
CREATE TABLE Blocks(\
 id INTEGER NOT NULL PRIMARY KEY,\
 parseable TEXT NOT NULL);\
CREATE TABLE Wallet(\
 id INTEGER NOT NULL PRIMARY KEY,\
 key TEXT NOT NULL,\
 balance INTEGER NOT NULL,\
 counter INTEGER NOT NULL);\
CREATE TABLE Broker(\
 id INTEGER NOT NULL PRIMARY KEY,\
 parseable TEXT NOT NULL);\
CREATE TABLE Sensor(\
 id INTEGER NOT NULL PRIMARY KEY,\
 parseable TEXT NOT NULL);\
CREATE TABLE Integration(\
 id INTEGER NOT NULL PRIMARY KEY,\
 parseable TEXT NOT NULL);";

function wrap_db_op<T>(func: (cb: (err: Error, res: T) => void) => void) {
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

function wrap_db_each_op<T>(func: (each: (err: Error, res: T) => void, final: (err: Error, count: number) => void) => void, each: (res: T) => void) {
  return new Promise<void>((resolve, reject) => {
    func((err: Error, res: T) => {
      if (!err) {
        each(res);
      }
    }, (err: Error, _count: number) => {
      if (err) {
        reject(err);
      } else {
        resolve();
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
} as const;

type Data_type = typeof DATA_TYPE[keyof typeof DATA_TYPE];

const ALL_DATA_TYPES = [
  DATA_TYPE.WALLET,
  DATA_TYPE.SENSOR,
  DATA_TYPE.BROKER,
  DATA_TYPE.INTEGRATION,
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
  //[index: Data_type]: Map<string, unknown>;
}

//data before they have a db id
type Datas = {
  WALLET: Map<string, Wallet>;
  SENSOR: Map<string, SensorRegistration>;
  BROKER: Map<string, BrokerRegistration>;
  INTEGRATION: Map<string, IntegrationExpanded>;
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

//number of times a triple exists
type TripleCounts = {
  nodes: Map<string, number>;
  literals: Map<string, number>;
}

function escapeNodeMetadata(escaping: NodeMetadata): string {
  let returning = escaping.s.replace('\\', '\\\\');
  returning += '\\';
  returning += escaping.p.replace('\\', '\\\\');
  returning += '\\';
  returning += escaping.o;
  return returning;
}

function unEscapeNodeMetadata(escaping: string): NodeMetadata {
  const returning: NodeMetadata = {
    s: null,
    p: null,
    o: null
  };

  let i = 0;

  for (; i < escaping.length; ++i) {
    if (escaping[i] === '\\' && (i === escaping.length - 1 || escaping[i + 1] !== '\\')) {
      returning.s = escaping.substring(0, i).replace('\\\\', '\\');
      break;
    }
  }

  if (i === escaping.length) {
    throw new Error(`Couldn't unescape triple: '${escaping}'`);
  }

  let j = i + 1;

  for (; j < escaping.length; ++j) {
    if (escaping[j] === '\\' && (j === escaping.length - 1 || escaping[j + 1] !== '\\')) {
      returning.p = escaping.substring(i+1, j).replace('\\\\', '\\');
      break;
    }
  }

  if (j === escaping.length) {
    throw new Error(`Couldn't unescape triple: '${escaping}'`);
  }

  returning.o = escaping.substring(j + 1);

  return returning;
}

function escapeLiteralMetadata(escaping: LiteralMetadata): string {
  let returning = escaping.s.replace('\\', '\\\\');
  returning += '\\';
  returning += escaping.p.replace('\\', '\\\\');
  returning += '\\';
  returning += escaping.o;
  return returning;
}

function unEscapeLiteralMetadata(escaping: string): LiteralMetadata {
  const returning: NodeMetadata = {
    s: null,
    p: null,
    o: null
  };

  let i = 0;

  for (; i < escaping.length; ++i) {
    if (escaping[i] === '\\' && (i === escaping.length - 1 || escaping[i + 1] !== '\\')) {
      returning.s = escaping.substring(0, i).replace('\\\\', '\\');
      break;
    }
  }

  if (i === escaping.length) {
    throw new Error(`Couldn't unescape triple: '${escaping}'`);
  }

  let j = i + 1;

  for (; j < escaping.length; ++j) {
    if (escaping[j] === '\\' && (j === escaping.length - 1 || escaping[j + 1] !== '\\')) {
      returning.p = escaping.substring(i + 1, j).replace('\\\\', '\\');
      break;
    }
  }

  if (j === escaping.length) {
    throw new Error(`Couldn't unescape triple: '${escaping}'`);
  }

  returning.o = escaping.substring(j + 1);

  return returning;
}
//create an empty triple counts object
function genTripleCounts(): TripleCounts {
  return {
    nodes: new Map<string, number>(),
    literals: new Map<string, number>()
  };
}

//error type for replace chain
type Error_replacechain = typeof ERROR_REPLACECHAIN[keyof typeof ERROR_REPLACECHAIN];

//generate empty datas with db id
function genDatasWithDbId(): DatasWithDbId {
  return {
    WALLET: new Map<string, WithDbId<Wallet>>(),
    SENSOR: new Map<string, WithDbId<SensorRegistration>>(),
    BROKER: new Map<string, WithDbId<BrokerRegistration>>(),
    INTEGRATION: new Map<string, WithDbId<IntegrationExpanded>>()
  };
}

//generate empty datas without db id
function genDatas(): Datas {
  return {
    WALLET: new Map<string, Wallet>(),
    SENSOR: new Map<string, SensorRegistration>(),
    BROKER: new Map<string, BrokerRegistration>(),
    INTEGRATION: new Map<string, IntegrationExpanded>()
  };
}

//helper type to create a literal, this used to do something fancier, and is kept in case it needs to again
function literal<T>(t: T): T {
  return t;
}

//store 24 hours worth in memory
export const MAX_BLOCKS_IN_MEMORY = Math.ceil(24 * 60 * 60 * 1000 / MINE_RATE);

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
    const parsed = JSON.parse(data);

    const returning = new ChainLink(parsed.block);

    if (parsed.undos[DATA_TYPE.WALLET] !== undefined) {
      for (const [key, value] of Object.entries(parsed.undos[DATA_TYPE.WALLET])) {
        returning.undos[DATA_TYPE.WALLET].set(key, value as Wallet);
      }
    }
    if (parsed.undos[DATA_TYPE.SENSOR] !== undefined) {
      for (const [key, value] of Object.entries(parsed.undos[DATA_TYPE.SENSOR])) {
        returning.undos[DATA_TYPE.SENSOR].set(key, value as SensorRegistration);
      }
    }
    if (parsed.undos[DATA_TYPE.BROKER] !== undefined) {
      for (const [key, value] of Object.entries(parsed.undos[DATA_TYPE.BROKER])) {
        returning.undos[DATA_TYPE.BROKER].set(key, value as BrokerRegistration);
      }
    }
    if (parsed.undos[DATA_TYPE.INTEGRATION] !== undefined) {
      for (const [key, value] of Object.entries(parsed.undos[DATA_TYPE.INTEGRATION])) {
        returning.undos[DATA_TYPE.INTEGRATION].set(key, value as IntegrationExpanded);
      }
    }

    return returning;
  }
}

//merge a datas into another
function mergeDatas(from: Datas, to: Datas) {
  for (const [key, value] of from.WALLET.entries()) {
    if (value === null) {
      to.WALLET.delete(key);
    } else {
      to.WALLET.set(key, value);
    }
  }
  for (const [key, value] of from.SENSOR.entries()) {
    if (value === null) {
      to.SENSOR.delete(key);
    } else {
      to.SENSOR.set(key, value);
    }
  }
  for (const [key, value] of from.BROKER.entries()) {
    if (value === null) {
      to.BROKER.delete(key);
    } else {
      to.BROKER.set(key, value);
    }
  }
  for (const [key, value] of from.INTEGRATION.entries()) {
    if (value === null) {
      to.INTEGRATION.delete(key);
    } else {
      to.INTEGRATION.set(key, value);
    }
  }
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
    INTEGRATION: new Set<string>()
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
}

type UpdateCb = (err: Result, newBlocks: ChainLink[], changes: UpdaterChanges) => void;

const CREATE_QUERY_INITIAL = "INSERT DATA {" as const;
const DELETE_QUERY_INITIAL = "DELETE DATA {" as const;

type Insert_result = {
  id: number;
};

type DbUpdates = {
  insertingWallets: { key: string; balance: number; counter: number }[];
  updatingWallets: { id: number; balance: number; counter: number }[];
  insertingBrokers: BrokerRegistration[];
  updatingBrokers: { id: number; broker: BrokerRegistration }[];
  insertingSensors: SensorRegistration[];
  updatingSensors: { id: number; sensor: SensorRegistration }[];
  insertingIntegration: IntegrationExpanded[];
  updatingIntegration: { id: number; integration: IntegrationExpanded; }[];
  updatingNodeTriples: { key: string; count: number; }[];
  updatingLiteralTriples: { key: string; count: number; }[];
  create_query: string;
  delete_query: string;
};

function rollbackRes(chain: Blockchain, res: Result, cb: UpdateCb) {
  chain.persistence.db.exec("ROLLBACK;", (err: Error) => {
    if (err) {
      console.error("COULD NOT ROLLBACK: " + err.message);
      process.exit(-1);
    }
    cb(res, null, null);
  });
}

function rollbackErr(chain: Blockchain, res: Error, cb: UpdateCb) {
  rollbackRes(chain, resultFromError(res), cb);
}

function finishUpdate(updates: DbUpdates, changes: UpdaterChanges, updater: Updater, persist: boolean, cb: UpdateCb) {
  //start creating update statements for fuseki
  if (persist) {
    let sending = "";
    if (updates.create_query.length > CREATE_QUERY_INITIAL.length) {
      sending += updates.create_query + "};";
    }
    if (updates.delete_query.length > DELETE_QUERY_INITIAL.length) {
      sending += updates.delete_query + "};";
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
  updater.parent.persistence.db.exec("COMMIT;", (err) => {
    if (err) {
      rollbackErr(updater.parent, err, cb);
    } else {
      cb({ result: true }, newLinks, changes);
    }
  });
}

function runUpdateLiteralTriples(i: number, updates: DbUpdates, changes: UpdaterChanges, updater: Updater, persist: boolean, cb: UpdateCb) {
  if (i === updates.updatingLiteralTriples.length) {
    finishUpdate(updates, changes, updater, persist, cb);
    return;
  }



  const running = updates.updatingLiteralTriples[i];
  if (running.count === 0) {
    updater.parent.persistence.remove_literal_triple.run(running.key, (err: Error) => {
      if (err) {
        rollbackErr(updater.parent, err, cb);
        return;
      }

      runUpdateLiteralTriples(i + 1, updates, changes, updater, persist, cb);
    });
  } else {
    updater.parent.persistence.update_literal_triple.run(running.key, running.count, (err: Error) => {
      if (err) {
        rollbackErr(updater.parent, err, cb);
        return;
      }

      runUpdateLiteralTriples(i + 1, updates, changes, updater, persist, cb);
    });
  }
}

function runUpdateNodeTriples(i: number, updates: DbUpdates, changes: UpdaterChanges, updater: Updater, persist: boolean, cb: UpdateCb) {
  if (i === updates.updatingNodeTriples.length) {
    runUpdateLiteralTriples(0, updates, changes, updater, persist, cb);
    return;
  }

  const running = updates.updatingNodeTriples[i];
  if (running.count === 0) {
    updater.parent.persistence.remove_node_triple.run(running.key, (err: Error) => {
      if (err) {
        rollbackErr(updater.parent, err, cb);
        return;
      }

      runUpdateNodeTriples(i + 1, updates, changes, updater, persist, cb);
    });
  } else {
    updater.parent.persistence.update_node_triple.run(running.key, running.count, (err: Error) => {
      if (err) {
        rollbackErr(updater.parent, err, cb);
        return;
      }

      runUpdateNodeTriples(i + 1, updates, changes, updater, persist, cb);
    });
  }
}

function runUpdateIntegrations(i: number, updates: DbUpdates, changes: UpdaterChanges, updater: Updater, persist: boolean, cb: UpdateCb) {
  if (i === updates.updatingIntegration.length) {
    runUpdateNodeTriples(0, updates, changes, updater, persist, cb);
    return;
  }

  const running = updates.updatingIntegration[i];
  const stmt = updater.parent.persistence.update_integration;

  stmt.run(JSON.stringify(running.integration), running.id, (err: Error) => {
    if (err) {
      rollbackErr(updater.parent, err, cb);
      return;
    }

    runUpdateIntegrations(i + 1, updates, changes, updater, persist, cb);
  });
}

function runInsertIntegrations(i: number, updates: DbUpdates, changes: UpdaterChanges, updater: Updater, persist: boolean, cb: UpdateCb) {
  if (i === updates.insertingIntegration.length) {
    runUpdateIntegrations(0, updates, changes, updater, persist, cb);
    return;
  }

  const running = updates.insertingIntegration[i];
  const stmt = updater.parent.persistence.insert_integration;

  stmt.get(JSON.stringify(running), (err: Error, row: Insert_result) => {
    if (err) {
      rollbackErr(updater.parent, err, cb);
      return;
    }

    const key = makeIntegrationKey(running.input, running.counter);
    const value = {
      dbId: row.id,
      base: running
    };

    updater.parent.data.INTEGRATION.set(key, value);

    stmt.reset(() => runInsertIntegrations(i + 1, updates, changes, updater, persist, cb));
  });
}

function runUpdateSensors(i: number, updates: DbUpdates, changes: UpdaterChanges, updater: Updater, persist: boolean, cb: UpdateCb) {
  if (i === updates.updatingSensors.length) {
    runInsertIntegrations(0, updates, changes, updater, persist, cb);
    return;
  }

  const running = updates.updatingSensors[i];
  const stmt = updater.parent.persistence.update_sensor;

  stmt.run(JSON.stringify(running.sensor), running.id, (err: Error) => {
    if (err) {
      rollbackErr(updater.parent, err, cb);
      return;
    }

    runUpdateSensors(i + 1, updates, changes, updater, persist, cb);
  });
}

function runInsertSensors(i: number, updates: DbUpdates, changes: UpdaterChanges, updater: Updater, persist: boolean, cb: UpdateCb) {
  if (i === updates.insertingSensors.length) {
    runUpdateSensors(0, updates, changes, updater, persist, cb);
    return;
  }

  const running = updates.insertingSensors[i];
  const stmt = updater.parent.persistence.insert_sensor;

  stmt.get(JSON.stringify(running), (err: Error, row: Insert_result) => {
    if (err) {
      rollbackErr(updater.parent, err, cb);
      return;
    }

    updater.parent.data.SENSOR.set(running.metadata.name, {
      dbId: row.id,
      base: running
    });

    stmt.reset(() => runInsertSensors(i + 1, updates, changes, updater, persist, cb));
  });
}

function runUpdateBrokers(i: number, updates: DbUpdates, changes: UpdaterChanges, updater: Updater, persist: boolean, cb: UpdateCb) {
  if (i === updates.updatingBrokers.length) {
    runInsertSensors(0, updates, changes, updater, persist, cb);
    return;
  }

  const running = updates.updatingBrokers[i];
  const stmt = updater.parent.persistence.update_broker;

  stmt.run(JSON.stringify(running.broker), running.id, (err: Error) => {
    if (err) {
      rollbackErr(updater.parent, err, cb);
      return;
    }

    runUpdateBrokers(i + 1, updates, changes, updater, persist, cb);
  });
}

function runInsertBrokers(i: number, updates: DbUpdates, changes: UpdaterChanges, updater: Updater, persist: boolean, cb: UpdateCb) {
  if (i === updates.insertingBrokers.length) {
    runUpdateBrokers(0, updates, changes, updater, persist, cb);
    return;
  }

  const running = updates.insertingBrokers[i];
  const stmt = updater.parent.persistence.insert_broker;

  stmt.get(JSON.stringify(running), (err: Error, row: Insert_result) => {
    if (err) {
      rollbackErr(updater.parent, err, cb);
      return;
    }

    updater.parent.data.BROKER.set(running.metadata.name, {
      dbId: row.id,
      base: running
    });

    stmt.reset(() => runInsertBrokers(i + 1, updates, changes, updater, persist, cb));
  });
}

function runUpdateWallets(i: number, updates: DbUpdates, changes: UpdaterChanges, updater: Updater, persist: boolean, cb: UpdateCb) {
  if (i === updates.updatingWallets.length) {
    runInsertBrokers(0, updates, changes, updater, persist, cb);
    return;
  }

  const running = updates.updatingWallets[i];
  const stmt = updater.parent.persistence.update_wallet;

  stmt.run(running.balance, running.counter, running.id, (err: Error) => {
    if (err) {
      rollbackErr(updater.parent, err, cb);
      return;
    }

    runUpdateWallets(i + 1, updates, changes, updater, persist, cb);
  });
}

function runInsertWallets(i: number, updates: DbUpdates, changes: UpdaterChanges, updater: Updater, persist: boolean, cb: UpdateCb) {
  if (i === updates.insertingWallets.length) {
    runUpdateWallets(0, updates, changes, updater, persist, cb);
    return;
  }

  const running = updates.insertingWallets[i];
  const stmt = updater.parent.persistence.insert_wallet;

  stmt.get(running.key, running.balance, running.counter, (err: Error, row: Insert_result) => {
    if (err) {
      rollbackErr(updater.parent, err, cb);
      return;
    }

    updater.parent.data.WALLET.set(running.key, {
      dbId: row.id,
      base: {
        counter: running.counter,
        balance: running.balance
      }
    });

    stmt.reset(() => runInsertWallets(i + 1, updates, changes, updater, persist, cb));
  });
}

function onUpdateFinish(updater: Updater, persist: boolean, res: Result, cb: UpdateCb) {
  if (isFailure(res)) {
    rollbackRes(updater.parent, res, cb);
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
    chain.linksStartI = Math.max(updater.startIndex + updater.links.length - MAX_BLOCKS_IN_MEMORY, oldLinksStartI);
    if (updater.startIndex === chain.linksStartI) {
      chain.links = updater.links;
    } else {
      //we want to add the upder.links, with as much of the existing chain as we can
      //updater.links starts at updater.startIndex, so we want everything before that
      const constructing = chain.links.slice(0, updater.startIndex - chain.linksStartI);
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
  const updates: DbUpdates = {
    insertingWallets: [],
    updatingWallets: [],
    insertingBrokers: [],
    updatingBrokers: [],
    insertingSensors: [],
    updatingSensors: [],
    insertingIntegration: [],
    updatingIntegration: [],
    updatingLiteralTriples: [],
    updatingNodeTriples: [],
    create_query: CREATE_QUERY_INITIAL,
    delete_query: CREATE_QUERY_INITIAL
  };

  for (const [key, value] of updater.prevData.WALLET.entries()) {
    const foundParent = updater.parent.data.WALLET.get(key);
    if (foundParent === undefined) {
      updates.insertingWallets.push({
        key: key,
        balance: value.balance,
        counter: value.counter
      });
    } else {
      updates.updatingWallets.push({
        id: foundParent.dbId,
        balance: value.balance,
        counter: value.counter
      });
      foundParent.base.balance = value.balance;
      foundParent.base.counter = value.counter;
    }
  }
  for (const [key, value] of updater.prevData.BROKER.entries()) {
    const foundParent = updater.parent.data.BROKER.get(key);
    if (foundParent === undefined) {
      updates.insertingBrokers.push(value);
    } else {
      updates.updatingBrokers.push({
        id: foundParent.dbId,
        broker: value
      });
      foundParent.base = value;
    }
  }
  for (const [key, value] of updater.prevData.SENSOR.entries()) {
    const foundParent = updater.parent.data.SENSOR.get(key);
    if (foundParent === undefined) {
      updates.insertingSensors.push(value);
    } else {
      updates.updatingSensors.push({
        id: foundParent.dbId,
        sensor: value
      });
      foundParent.base = value;
    }
  }
  for (const [key, value] of updater.prevData.INTEGRATION.entries()) {
    const foundParent = updater.parent.data.INTEGRATION.get(key);
    if (foundParent === undefined) {
      updates.insertingIntegration.push(value);
    } else {
      updates.updatingIntegration.push({
        id: foundParent.dbId,
        integration: value
      });
      foundParent.base = value;
    }
  }

  let negativeRDF = false;
  for (const [escaped, count] of updater.store.nodes) {
    let existing = updater.parent.store.nodes.get(escaped);
    const triple = unEscapeNodeMetadata(escaped);
    if (existing === undefined) {
      existing = 0;
    }
    if (existing + count < 0) {
      console.error(`Negative rdf reached during update: '${triple.s}', '${triple.p}', '${triple.o}', existing: ${existing}, count: ${count}`);
      negativeRDF = true;
    }
    updates.updatingNodeTriples.push({ key: escaped, count: count });
    if (persist) {
      if (existing === 0 && existing + count > 0) {
        updates.create_query += `<${triple.s}> <${triple.p}> <${triple.o}>.`;
      }
      if (existing > 0 && existing + count === 0) {
        updates.delete_query += `<${triple.s}> <${triple.p}> <${triple.o}>.`;
      }
    }
    updater.parent.store.nodes.set(escaped, existing + count);
  }
  for (const [escaped, count] of updater.store.literals) {
    let existing = updater.parent.store.literals.get(escaped);
    const triple = unEscapeLiteralMetadata(escaped);
    if (existing === undefined) {
      existing = 0;
    }
    if (existing + count < 0) {
      console.error(`Negative rdf reached during update: '${triple.s}', '${triple.p}', '${triple.o}', existing: ${existing}, count: ${count}`);
      negativeRDF = true;
    }
    updates.updatingLiteralTriples.push({ key: escaped, count: count });
    if (persist) {
      if (existing === 0 && existing + count > 0) {
        updates.create_query += `<${triple.s}> <${triple.p}> "${triple.o}".`;
      }
      if (existing > 0 && existing + count === 0) {
        updates.delete_query += `<${triple.s}> <${triple.p}> "${triple.o}".`;
      }
    }
    updater.parent.store.literals.set(escaped, existing + count);
  }

  if (negativeRDF) {
    process.exit(-1);
  }

  updater.curData = genDatas(); //reset cur and prev data
  updater.prevData = genDatas();

  runInsertWallets(0, updates, changes, updater, persist, cb);
}

//these make the names of various types of objects in the RDF db

function makeBlockName(hash: string): string {
  return URIS.OBJECT.BLOCK + '/' + hash;
}

function makePaymentTransactionName(payment: Payment): string {
  return URIS.OBJECT.PAYMENT_TX + '/' + Payment.hashToSign(payment);
}

function makeIntegrationTransactionName(integration: Integration): string {
  return URIS.OBJECT.INTEGRATION_TX + '/' + Integration.hashToSign(integration);
}

function makeCommitTransactionName(commit: Commit): string {
  return URIS.OBJECT.COMPENSATION_TX + '/' + Commit.hashToSign(commit);
}

function makeSensorTransactionName(sensorRegistration: SensorRegistration): string {
  return URIS.OBJECT.SENSOR_REGISTRATION_TX + '/' + SensorRegistration.hashToSign(sensorRegistration);
}

function makeBrokerTransactionName(brokerName: BrokerRegistration): string {
  return URIS.OBJECT.BROKER_REGISTRATION_TX + '/' + BrokerRegistration.hashToSign(brokerName);
}

function makeWalletName(input: string): string {
  return URIS.OBJECT.WALLET + '/' + input;
}

//creates RDF triples to describe a block header
function genBlockHeaderRDF(triples: TripleCounts, block: Block, count: number = 1): void {
  const blockName = makeBlockName(block.hash);
  const prevBlockName = makeBlockName(block.lastHash);

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

//this object carries all state needed to update a chain
class Updater {
  parent: Blockchain; //the blockchain it's updating
  links: ChainLink[]; //new links it's adding
  prevData: Datas; //previous steps datas
  curData: Datas; //current steps datas
  startIndex: number; //where the new links are inserting
  on: number; //index in the chain we're currently on
  store: TripleCounts; //new RDF
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

  //add a new block
  newBlock(block: Block): void {
    if (this.links.length >= MAX_BLOCKS_IN_MEMORY) {
      this.links.shift();
    }
    this.links.push(new ChainLink(block));
    this.on++;

    mergeDatas(this.curData, this.prevData);
    this.curData = genDatas();

    genBlockHeaderRDF(this.store, block);
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
    genBlockRDF(this.store, undoing.block);

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
  finish(persist: boolean, cb: UpdateCb) {
    //persist blockchain first
    if (persist) {
      this.parent.persistence.db.exec("BEGIN;", (err) => {
        if (err) {
          cb({
            result: false,
            reason: err.message
          }, null, null);
          return;
        }

        writeBlocks(this.parent, this.startIndex, this.links, (err: Result) => onUpdateFinish(this, persist, err, cb));
      });
    } else {
      setImmediate(() => onUpdateFinish(this, persist, {result:true}, cb));
    }
  }
}

//add a triple with a literal object to triples
function addToLiteralTripleCounts(triples: TripleCounts, triple: LiteralMetadata, count: number = 1): void {

  const escaped = escapeLiteralMetadata(triple);

  if (triples.literals.has(escaped)) {
    const returning = triples.literals.get(escaped) + count;
    if (returning === 0) {
      triples.literals.delete(escaped);
    } else {
      triples.literals.set(escaped, returning);
    }
  } else {
    triples.literals.set(escaped, count);
  }
}

//add a triple with a node object to triples
function addToNodeTripleCounts(triples: TripleCounts, triple: NodeMetadata, count: number = 1): void {

  const escaped = escapeNodeMetadata(triple);

  if (triples.nodes.has(escaped)) {
    const returning = triples.nodes.get(escaped) + count;
    if (returning === 0) {
      triples.nodes.delete(escaped);
    } else {
      triples.nodes.set(escaped, returning);
    }
  } else {
    triples.nodes.set(escaped, count);
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
    o: URIS.OBJECT.PAYMENT_TX
  }, count);
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

  genPaymentRDF(updater.store, blockName, tx);

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
    p: URIS.PREDICATE.HAS_HASH,
    o: Integration.hashToSign(tx)
  }, count);

  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.TYPE,
    o: URIS.OBJECT.INTEGRATION_TX
  }, count);
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
    if (SensorRegistration.hashToSign(foundSensor) !== output.sensorHash) {
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

    if (BrokerRegistration.hashToSign(foundBroker) !== output.brokerHash) {
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

  genIntegrationRDF(updater.store, blockName, txCopy);

  return {
    result: true
  };
}

function genCommitRDF(triples: TripleCounts, blockName: string, tx: Commit, count: number = 1): void {
  const transactionName = makeCommitTransactionName(tx);

  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.CONTAINS_TRANSACTION,
    o: transactionName
  }, count);
  addToNodeTripleCounts(triples, {
    s: blockName,
    p: URIS.PREDICATE.CONTAINS_COMMIT,
    o: transactionName
  }, count);

  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.TYPE,
    o: URIS.OBJECT.COMMIT_TX
  }, count);
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

  genCommitRDF(updater.store, blockName, tx);

  return {
    result: true
  };
}

function genSensorRegistrationRDF(triples: TripleCounts, blockName: string, tx: SensorRegistration, count: number = 1): void {
  const transactionName = makeSensorTransactionName(tx);

  for (const triple of SensorRegistration.getExtraNodeMetadata(tx)) {
    addToNodeTripleCounts(triples, {
      s: uriReplacePrefix(triple.s, transactionName),
      p: uriReplacePrefix(triple.p, transactionName),
      o: uriReplacePrefix(triple.o, transactionName)
    }, count);
  }
  for (const triple of SensorRegistration.getExtraLiteralMetadata(tx)) {
    addToLiteralTripleCounts(triples, {
      s: uriReplacePrefix(triple.s, transactionName),
      p: uriReplacePrefix(triple.p, transactionName),
      o: literal(triple.o)
    }, count);
  }

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
    p: URIS.PREDICATE.HAS_HASH,
    o: SensorRegistration.hashToSign(tx)
  }, count);

  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.TYPE,
    o: URIS.OBJECT.SENSOR_REGISTRATION_TX
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
    o: SensorRegistration.getSensorName(tx)
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
  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.USES_BROKER,
    o: SensorRegistration.getIntegrationBroker(tx)
  }, count);
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

  genSensorRegistrationRDF(updater.store, blockName, tx);

  return {
    result: true
  };
}

function genBrokerRegistrationRDF(triples: TripleCounts, blockName: string, tx: BrokerRegistration, count: number = 1): void {
  const transactionName = makeBrokerTransactionName(tx);

  for (const triple of BrokerRegistration.getExtraNodeMetadata(tx)) {
    addToNodeTripleCounts(triples, {
      s: uriReplacePrefix(triple.s, transactionName),
      p: uriReplacePrefix(triple.p, transactionName),
      o: uriReplacePrefix(triple.o, transactionName)
    }, count);
  }
  for (const triple of BrokerRegistration.getExtraLiteralMetadata(tx)) {
    addToLiteralTripleCounts(triples, {
      s: uriReplacePrefix(triple.s, transactionName),
      p: uriReplacePrefix(triple.p, transactionName),
      o: literal(triple.o)
    }, count);
  }

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
    p: URIS.PREDICATE.HAS_HASH,
    o: BrokerRegistration.hashToSign(tx)
  }, count);

  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.TYPE,
    o: URIS.OBJECT.BROKER_REGISTRATION_TX
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
    o: BrokerRegistration.getBrokerName(tx)
  }, count);
  addToLiteralTripleCounts(triples, {
    s: transactionName,
    p: URIS.PREDICATE.HAS_ENDPOINT,
    o: BrokerRegistration.getEndpoint(tx)
  }, count);
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

  genBrokerRegistrationRDF(updater.store, blockName, tx);

  return {
    result: true
  };
}

//add rdf for all txs of a block to triples
function genBlockRDF(triples: TripleCounts, block: Block) : void {
  const blockName = makeBlockName(block.hash);

  genBlockHeaderRDF(triples, block, -1);

  for (const tx of Block.getPayments(block)) {
    genPaymentRDF(triples, blockName, tx, -1);
  }
  for (const tx of Block.getIntegrations(block)) {
    genIntegrationRDF(triples, blockName, tx, -1);
  }
  for (const tx of Block.getSensorRegistrations(block)) {
    genSensorRegistrationRDF(triples, blockName, tx, -1);
  }
  for (const tx of Block.getBrokerRegistrations(block)) {
    genBrokerRegistrationRDF(triples, blockName, tx, -1);
  }
  for (const tx of Block.getCommits(block)) {
    genCommitRDF(triples, blockName, tx, -1);
  }
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
      console.log(`curData checking for timeout: ${key} ${i}: ${delta}`);
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
      console.log(`prevData checking for timeout: ${key} ${i}: ${delta}`);
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
      console.log(`parent checking for timeout: ${key} ${i}: ${delta}`);
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
function writeBlocks(chain: Blockchain, startIndex: number, links: ChainLink[], cb: (res: Result) => void) {
  if (links.length === 0) {
    cb({ result: true });
    return;
  }

  chain.persistence.update_block.run(startIndex, links[0].serialize(), (err: Error) => {
    if (err) {
      rollbackErr(chain, err, cb);
    }

    console.info("wrote block " + startIndex);

    writeBlocks(chain, startIndex + 1, links.slice(1), cb);
  });
}

//read a block from persistence
function readBlock(chain: Blockchain, i: number, cb: (res: Result, link: ChainLink | null) => void) {
  chain.persistence.get_block.get(i, (err, row: ReadBlock_result) => {
    if (err) {
      cb({
        result: false,
        reason: err.message
      }, null);
      return;
    }

    const as_link = ChainLink.deserialize(row.parseable);

    chain.persistence.get_block.reset(() => cb({
      result: true
    }, as_link));
  });
}

interface OpResultFailure extends ResultFailure {
  code: Error_replacechain;
}

type OpResult = ResultSuccess | OpResultFailure;

type OpCb = (result: OpResult, data?:unknown) => void;

type OpFunc = (chain: Blockchain) => void;
interface Op {
  op: OpFunc;
  cb: OpCb;
}


//Add an operation to the blockchains operation queue
function addOp(blockchain: Blockchain, op: Op) {
  const original_cb = op.cb;

  op.cb = (result, data?) => {
    original_cb(result, data);
    opFinish(blockchain);
  };

  blockchain.queue.push(op);

  if (blockchain.queue.length === 1) {
    op.op(blockchain);
  }
}

//called on finishing an operation, to remove the current and start the next if appropriate
function opFinish(blockchain: Blockchain): void {
  blockchain.queue.shift();
  if (blockchain.queue.length > 0) {
    blockchain.queue[0].op(blockchain);
  }
}

//logic to replace the current chain with a new chain
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

  let index = blockchain.linksStartI + blockchain.links.length; //current block we're looking at, start at last block in our current chain
  const updater = new Updater(blockchain);

  for (; ;) { //no guard here, one of the first two checks will eventually end the loop
    if (index < op.startI) { //if we have hit before the new chain start, we haven't found where they diverge
      setImmediate(() => { //error
        op.cb({
          result: false,
          code: ERROR_REPLACECHAIN.DIVERGENCE,
          reason: `Received chain diverges from our chain before received chain's start. recved chain start: ${op.startI}`
        });
        process.exit(-1);
      });
      return;
    }
    if (index < blockchain.linksStartI) { //if links aren't in memory, we need to load them from persistence
      //currently NYI, return an error
      setImmediate(() => op.cb({
        result: false,
        code: ERROR_REPLACECHAIN.CACHED,
        reason: "We currently can't replace the chain if the divergence happens out of memory"
      }));
      return;
    }

    const oldHash = index === 0 ? Block.genesis().hash : blockchain.links[index - blockchain.linksStartI - 1].block.hash;
    const newBlock = op.newChain[index - op.startI];
    if (oldHash !== newBlock.lastHash) { //if the last hashes don't match, trhey don't have a common ancestor, and so we haven't found the point of divergence
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

      updater.finish(true, (err, newLinks, changes) => { //finish and persist the update
        if (isFailure(err)) { //if the update errored
          op.cb({ //error
            result: false,
            code: ERROR_REPLACECHAIN.UPDATER,
            reason: err.reason
          });
          return;
        }

        const newBlocks: Block[] = []; //make blocks array
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
    --index;
  }
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

//logic to add a block to the current chain
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

  updater.finish(true, (err: Result, newLinks: ChainLink[], changes) => {
    if (isFailure(err)) {
      op.cb({
        result: false,
        code: ERROR_REPLACECHAIN.UPDATER,
        reason: err.reason
      });
      return;
    }


    const newBlocks: Block[] = [];
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

type ReadBlock_result = {
  parseable: string;
};

//logic to read a block from the current chain
function readBlockImpl(blockchain: Blockchain): void {
  const op = blockchain.queue[0] as ReadBlockOp;

  readBlock(blockchain, op.i, (res, link) => {
    if (isFailure(res)) {
      op.cb({
        result: false,
        reason: res.reason,
        code: ERROR_REPLACECHAIN.BAD_ARG
      });
    } else {
      op.cb(res, link.block);
    }
  });
}

class ReadBlockOp implements Op {
  op: OpFunc;
  i: number;
  cb: OpCb;

  constructor(i: number, cb: OpCb) {
    this.op = readBlockImpl;
    this.i = i;
    this.cb = cb;
  }
}

//logic to where a given chain diverges from the current chain
function checkForDivergenceImpl(blockchain: Blockchain): void {
  const op = blockchain.queue[0] as CheckForDivergenceOp;

  if (op.i >= op.blocks.length) {
    setImmediate(() => op.cb({
      result: true
    }, op.blocks.length));
    return;
  }
  if (op.i + op.startIndex >= blockchain.linksStartI + blockchain.links.length) {
    setImmediate(() => op.cb({
      result: true
    }, op.i));
    return;
  }
  if (op.i + op.startIndex >= blockchain.linksStartI) {
    while (op.i < op.blocks.length && op.i + op.startIndex < blockchain.linksStartI + blockchain.links.length) {
      if (blockchain.links[op.i + op.startIndex - blockchain.linksStartI].block.hash !== op.blocks[op.i].hash) {
        setImmediate(() => op.cb({
          result: true
        }, op.i));
        return;
      }
      op.i++;
    }
    setImmediate(() => op.cb({
      result: true
    }, op.i));
  } else {
    readBlock(blockchain, op.startIndex + op.i, (res, link) => {
      if (isFailure(res)) {
        op.cb({
          result: false,
          reason: res.reason,
          code: ERROR_REPLACECHAIN.BAD_ARG
        }, null);
        return;
      }

      if (link.block.hash !== op.blocks[op.i].hash) {
        op.cb({
          result: true
        }, op.i);
      } else {
        op.i++;
        checkForDivergenceImpl(blockchain);
      }
    });
  }
}

class CheckForDivergenceOp implements Op {
  op: OpFunc;
  i: number;
  startIndex: number;
  blocks: Block[];
  cb: OpCb;


  constructor(i: number, startIndex: number, blocks: Block[], cb: OpCb) {
    this.op = checkForDivergenceImpl;
    this.i = i;
    this.startIndex = startIndex;
    this.blocks = blocks;
    this.cb = cb;
  }
}

type Listener = (newBlocks: Block[], changes: UpdaterChanges, difference: number) => void;


//logic to prepare the statements used by sqlite3 for persistence

type Triple_result = {
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

type Version_result = {
  value: string | undefined;
};

//after we've opened the db, check the result and then check the version
function open_db(chain: Blockchain, db_location: string, cb: (err: Result) => void) {

  const reversingBlocks: ChainLink[] = [];

  wrap_db_op<void>((cb) => chain.persistence.db = new sqlite3.Database(db_location, cb)).then(() => {
    return wrap_db_op<Version_result>((cb) => chain.persistence.db.get("SELECT value FROM Configs WHERE name = 'version';", cb));
  }).then((row) => {
    if (row.value != DB_EXPECTED_VERSION) {
      cb({
        result: false,
        reason: `Expected version '${DB_EXPECTED_VERSION}' but persisted db had version '${row.value}'`
      });
      return;
    }
    return wrap_db_each_op<Wallet_result>((each, final) => chain.persistence.db.each("SELECT id,key,balance,counter FROM Wallet;", each, final), (row: Wallet_result) => {
      chain.data.WALLET.set(row.key, {
        dbId: row.id,
        base: {
          balance: row.balance,
          counter: row.counter
        }
      });
    });
  }, (_err) => { // on err, assume DB is empty, and we need to recreate
    return wrap_db_op<void>((cb) => chain.persistence.db.exec(DB_CREATE_QUERY, cb));
  }).then(() => {
    return wrap_db_each_op<Tx_result>((each, final) => chain.persistence.db.each("SELECT id,parseable FROM Broker;", each, final), (row: Tx_result) => {
      const broker = JSON.parse(row.parseable) as BrokerRegistration;

      chain.data.BROKER.set(broker.metadata.name, {
        dbId: row.id,
        base: broker
      });
    });
  }).then(() => {
    return wrap_db_each_op<Tx_result>((each, final) => chain.persistence.db.each("SELECT id,parseable FROM Sensor;", each, final), (row: Tx_result) => {
      const sensor = JSON.parse(row.parseable) as SensorRegistration;

      chain.data.SENSOR.set(sensor.metadata.name, {
        dbId: row.id,
        base: sensor
      });
    });
  }).then(() => {
    return wrap_db_each_op<Tx_result>((each, final) => chain.persistence.db.each("SELECT id,parseable FROM Integration;", each, final), (row: Tx_result) => {
      const integration = JSON.parse(row.parseable) as IntegrationExpanded;

      chain.data.INTEGRATION.set(Integration.hashToSign(integration), {
        dbId: row.id,
        base: integration
      });
    });
  }).then(() => {
    return wrap_db_each_op<Tx_result>((each, final) => chain.persistence.db.each(`SELECT id,parseable FROM Blocks ORDER BY id DESC LIMIT ${MAX_BLOCKS_IN_MEMORY}`, each, final), (row: Tx_result) => {
      const link = ChainLink.deserialize(row.parseable) as ChainLink;
      reversingBlocks.push(link);
    });
  }).then(() => {
    chain.links = reversingBlocks.reverse();
    return wrap_db_each_op<Triple_result>((each, final) => chain.persistence.db.each("SELECT key,value FROM NodeTriples;", each, final), (row: Triple_result) => {
      chain.store.nodes.set(row.key, row.value);
    });
  }).then(() => {
    return wrap_db_each_op<Triple_result>((each, final) => chain.persistence.db.each("SELECT key,value FROM LiteralTriples;", each, final), (row: Triple_result) => {
      chain.store.literals.set(row.key, row.value);
    });
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.get_block = chain.persistence.db.prepare(
      "SELECT parseable FROM Blocks WHERE id = ?;", cb));
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.update_block = chain.persistence.db.prepare(
      "INSERT INTO Blocks(id, parseable) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET parseable = excluded.parseable;", cb));
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.insert_broker = chain.persistence.db.prepare(
      "INSERT INTO Broker(parseable) VALUES(?) RETURNING id;", cb));
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.update_broker = chain.persistence.db.prepare(
      "UPDATE Broker SET parseable = ? WHERE id = ?;", cb));
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.insert_sensor = chain.persistence.db.prepare(
      "INSERT INTO Sensor(parseable) VALUES(?) RETURNING id;", cb));
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.update_sensor = chain.persistence.db.prepare(
      "UPDATE Sensor SET parseable = ? WHERE id = ?;", cb));
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.insert_wallet = chain.persistence.db.prepare(
      "INSERT INTO Wallet(key, balance, counter) VALUES(?,?,?) RETURNING id;", cb));
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.update_wallet = chain.persistence.db.prepare(
      "UPDATE Wallet SET balance = ?, counter = ? WHERE id = ?;", cb));
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.insert_integration = chain.persistence.db.prepare(
      "INSERT INTO Integration(parseable) VALUES(?) RETURNING id;", cb));
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.update_integration = chain.persistence.db.prepare(
      "UPDATE Integration SET parseable = ? WHERE id = ?;", cb));
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.update_node_triple = chain.persistence.db.prepare(
      "INSERT INTO NodeTriples(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;", cb));
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.remove_node_triple = chain.persistence.db.prepare(
      "DELETE FROM NodeTriples WHERE key = ?;", cb));
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.update_literal_triple = chain.persistence.db.prepare(
      "INSERT INTO LiteralTriples(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;", cb));
  }).then(() => {
    return wrap_db_op((cb) => chain.persistence.remove_literal_triple = chain.persistence.db.prepare(
      "DELETE FROM LiteralTriples WHERE key = ?;", cb));
  }).then(() => {
    cb({
      result: true
    });
  }).catch ((err) => {
    cb({
      result: false,
      reason: `Couldn't init db: '${err.message}'`
    });
  });
}

//the object/class to handle a blockchain
class Blockchain {
  static MAX_BLOCKS_IN_MEMORY = MAX_BLOCKS_IN_MEMORY;

  static ERROR_REPLACEHCHAIN = ERROR_REPLACECHAIN;

  data: DatasWithDbId; //data
  links: ChainLink[]; //blocks and the information required to undo them
  linksStartI: number; //where the links in memory start
  listeners: Listener[]; //listeners to blockchain changed events
  persistence: { //persistence
    db: Database;
    get_block: Statement;
    update_block: Statement;
    insert_broker: Statement;
    update_broker: Statement;
    insert_sensor: Statement;
    update_sensor: Statement;
    insert_wallet: Statement;
    update_wallet: Statement;
    insert_integration: Statement;
    update_integration: Statement;
    update_node_triple: Statement;
    remove_node_triple: Statement;
    update_literal_triple: Statement;
    remove_literal_triple: Statement;
  }
  queue: Op[]; //queue of operations. These are queued to stop race conditions
  store: TripleCounts; //simple store of counts of triples
  fuseki_location: string | null; //the URL of a fuseki instance

  constructor(db_location: string, fuseki_location: string | null, cb: (err:Result)=>void) {
    this.data = genDatasWithDbId();
    this.links = [];
    this.linksStartI = 0;
    this.listeners = [];
    sqlite3.verbose();
    this.persistence = {
      db: null,
      get_block: null,
      update_block: null,
      insert_broker: null,
      update_broker: null,
      insert_sensor: null,
      update_sensor: null,
      insert_wallet: null,
      update_wallet: null,
      insert_integration: null,
      update_integration: null,
      update_node_triple: null,
      remove_node_triple: null,
      update_literal_triple: null,
      remove_literal_triple: null
    };
    this.queue = [];
    this.fuseki_location = fuseki_location;

    open_db(this, db_location, cb);

    this.store = genTripleCounts();
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

  getBlock(i: number, cb: (err: OpResult, block: Block) => void) {
    if (i >= this.linksStartI + this.links.length) {
      setImmediate(() => cb({
        result: false,
        reason: "i is out of range",
        code: ERROR_REPLACECHAIN.BAD_ARG
      }, null));
      return;
    }
    if (i >= this.linksStartI) {
      setImmediate(() => cb({
        result: true
      }, this.links[i - this.linksStartI].block));
    } else {
      addOp(this, new ReadBlockOp(i, cb));
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
    addOp(this, new AddBlockOp(newBlock, cb));
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
  replaceChain(newBlocks: Block[], startIndex: number, cb: OpCb): void {
    if (newBlocks.length === 0) {
      setImmediate(() => cb({
        result: false,
        code: ERROR_REPLACECHAIN.BAD_ARG,
        reason: "Recieved chain is empty"
      }));
      return;
    }

    addOp(this, new ReplaceChainOp(newBlocks, startIndex, cb));
  }

  checkForDivergence(blocks: Block[], startIndex: number, cb: (err: Result, i: number) => void): void {
    addOp(this, new CheckForDivergenceOp(0, startIndex, blocks, cb));
  }

  addListener(listener:Listener): void {
    this.listeners.push(listener);
  }

  triples(): TripleCounts {
    return this.store;
  }
}

export default Blockchain;
export { Blockchain, type Data_type, ALL_DATA_TYPES, DATA_TYPE, type UpdaterChanges, type IntegrationExpanded };