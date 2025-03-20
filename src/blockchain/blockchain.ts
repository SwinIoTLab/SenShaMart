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
  type RdfTriple,
  type ResultFailure
  //type ValuedResult
} from '../util/chain-util.js';
import {
  //MINING_REWARD,
  SENSHAMART_IRI_REPLACE,
  //MINE_RATE,
  INITIAL_MINE_DIFFICULTY,
  INITIAL_COUNTER,
  INITIAL_BALANCE,
  MINING_REWARD,
  BROKER_DEAD_BUFFER_TIME_MS,
  MINUTE_MS,
  BROKER_COMMISION,
} from '../util/constants.js';

import { default as Persistence} from './persistence.js';

import IRIS from './iris.js';
//import { verify } from 'crypto';

const MAX_FUSEKI_MESSAGE_SIZE = (1 * 1024 * 1024); //1 MB
const CULL_TIME_S = 60 * 60; //1 hour

//expected version of the db, if it is less than this, we need to upgrade
const DB_EXPECTED_VERSION = '3' as const;
const FUSEKI_EXPECTED_VERSION = '1' as const;

//query to create the persistent db
const DB_CREATE_QUERY = [
`CREATE TABLE Configs(
  id INTEGER NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  value TEXT NOT NULL);`,

`INSERT INTO Configs(name,value) VALUES
  ('version','${DB_EXPECTED_VERSION}');`,

`CREATE TABLE String(
  id INTEGER NOT NULL PRIMARY KEY,
  minInc INTEGER NOT NULL,
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

`CREATE UNIQUE INDEX idx_blocks_hash ON Blocks(hash);`, 
`CREATE UNIQUE INDEX idx_blocks_string_depth ON Blocks(string,depth);`,

`CREATE TABLE NodeTriples(
  string INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  escaped TEXT NOT NULL,
  PRIMARY KEY (string,depth,escaped),
  FOREIGN KEY(string,depth) REFERENCES Blocks(string,depth) ON UPDATE CASCADE ON DELETE CASCADE);`,

`CREATE TABLE LiteralTriples(
  string INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  escaped TEXT NOT NULL,
  PRIMARY KEY (string,depth,escaped),
  FOREIGN KEY (string,depth) REFERENCES Blocks(string,depth) ON UPDATE CASCADE ON DELETE CASCADE);`,

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
  FOREIGN KEY(string,depth) REFERENCES Blocks(string,depth) ON UPDATE CASCADE ON DELETE CASCADE);`,

`CREATE TABLE Broker(
  string INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY(string,depth,name),
  FOREIGN KEY(string,depth) REFERENCES Blocks(string,depth) ON UPDATE CASCADE ON DELETE CASCADE);`,

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
  FOREIGN KEY(string,depth) REFERENCES Blocks(string,depth) ON UPDATE CASCADE ON DELETE CASCADE);`,

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
  FOREIGN KEY(string,depth) REFERENCES Blocks(string,depth) ON UPDATE CASCADE ON DELETE CASCADE);`,
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

type ParsedLengthPrefixedString = {
  parsed: string;
  rest: string;
}

function parseLengthPrefixedString(parsing: string): ParsedLengthPrefixedString {
  const found = parsing.indexOf('|');
  if (found === -1) {
    throw new Error("Couldn't find prefixed length delimiter", { cause: parsing });
  }
  const lengthStr = parsing.substring(0, found);
  const length = Number.parseInt(lengthStr, 10);
  if (Number.isNaN(length)) {
    throw new Error("Couldn't parse prefixed length", { cause: parsing });
  }
  if (length < 0 || length >= parsing.length - found) {
    throw new Error("Invalid prefixed length", { cause: parsing });
  }

  return {
    parsed: parsing.substring(found + 1, found + 1 + length),
    rest: parsing.substring(found + 1 + length)
  };
}

function createLengthPrefixedString(s1: string, s2: string) {
  return s1.length.toString() + '|' + s2;
}

function escapeRdfTriple(s: string, p: string, o: string): string {
  return createLengthPrefixedString(s, createLengthPrefixedString(p, o));
}

export function unEscapeNodeMetadata(escaped: string): RdfTriple {
  const parsedSubject = parseLengthPrefixedString(escaped);
  const parsedPredicate = parseLengthPrefixedString(parsedSubject.rest);

  return {
    s: parsedSubject.parsed,
    p: parsedPredicate.parsed,
    o: parsedPredicate.rest
  };
}

function makeBlockName(hash: string): string {
  return IRIS.OBJECT.BLOCK + '/' + hash;
}

function makePaymentTransactionName(payment: PaymentTx): string {
  return IRIS.OBJECT.PAYMENT_TX + '/' + ChainUtil.hash(PaymentTx.toHash(payment));
}

function makeIntegrationTransactionName(integrationHash: string): string {
  return IRIS.OBJECT.INTEGRATION_TX + '/' + integrationHash;
}

function makeCommitTransactionName(commitHash: string): string {
  return IRIS.OBJECT.COMPENSATION_TX + '/' + commitHash;
}

function makeSensorTransactionName(sensorHash: string): string {
  return IRIS.OBJECT.SENSOR_REGISTRATION_TX + '/' + sensorHash;
}

function makeBrokerTransactionName(brokerHash: string): string {
  return IRIS.OBJECT.BROKER_REGISTRATION_TX + '/' + brokerHash;
}

function makeWalletName(input: string): string {
  return IRIS.OBJECT.WALLET + '/' + input;
}

function iriReplacePrefix(testing:string, sensorName:string):string {
  if (testing.startsWith(SENSHAMART_IRI_REPLACE)) {
    return sensorName.concat(testing.slice(SENSHAMART_IRI_REPLACE.length));
  } else {
    return testing;
  }
}

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
  minInc: number;
};
type PathInfo = {
  id: number;
  maxExc: number;
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

async function checkNodeTripleExists(persistence: Persistence, escaped: string, path: string): Promise<boolean> {
  type Raw = { count: number };
  const raw = await persistence.get<Raw>(`
    WITH path(id,max) AS (
      SELECT json_extract(value, '$.id'),json_extract(value, '$.maxExc') FROM json_each(?)
    )
    SELECT 1
      FROM NodeTriples
    INNER JOIN path ON NodeTriples.string = path.id AND NodeTriples.depth < path.max
    WHERE escaped = ?
    LIMIT 1;`, path, escaped);
  if (raw === undefined) {
    return false;
  } else {
    return true;
  }
}

async function checkLiteralTripleExists(persistence: Persistence, escaped: string, path: string): Promise<boolean> {
  type Raw = { count: number };
  const raw = await persistence.get<Raw>(`
    WITH path(id,max) AS (
      SELECT json_extract(value, '$.id'),json_extract(value, '$.maxExc') FROM json_each(?)
    )
    SELECT 1
      FROM LiteralTriples
    INNER JOIN path ON LiteralTriples.string = path.id AND LiteralTriples.depth < path.max
    WHERE escaped = ?
    LIMIT 1;`, path, escaped);
  if (raw === undefined) {
    return false;
  } else {
    return true;
  }
}

async function getWallet(persistence: Persistence, key: string, path: string): Promise<Wallet> {
  type Raw = { balance: number, counter: number };
  const raw = await persistence.get<Raw>(`
    WITH path(id,max) AS (
      SELECT json_extract(value, '$.id'),json_extract(value, '$.maxExc') FROM json_each(?)
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
      SELECT json_extract(value, '$.id'),json_extract(value, '$.maxExc') FROM json_each(?)
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
      SELECT json_extract(value, '$.id'),json_extract(value, '$.maxExc') FROM json_each(?)
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
      SELECT json_extract(value, '$.id'),json_extract(value, '$.maxExc') FROM json_each(?)
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
      SELECT json_extract(value, '$.id'),json_extract(value, '$.maxExc') FROM json_each(?)
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
      SELECT json_extract(value, '$.id'),json_extract(value, '$.maxExc') FROM json_each(?)
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
      SELECT json_extract(value, '$.id'),json_extract(value, '$.maxExc') FROM json_each(?)
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
      SELECT json_extract(value, '$.id'),json_extract(value, '$.maxExc') FROM json_each(?)
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

async function getPath(persistence: Persistence, topString: number): Promise<StringInfo[]> {
  return await persistence.all<StringInfo>(`
            WITH string_walk(id,min,prev) AS (
              SELECT e.id,e.minInc,e.prev FROM String AS e WHERE e.id = ?
              UNION ALL
              SELECT c.id,c.minInc,c.prev FROM String AS c
              INNER JOIN string_walk AS p ON c.id = p.prev
            )
            SELECT id,min FROM string_walk
            ORDER BY min ASC;`, topString);
}

class Stepper {
  cache: {
    wallet: Map<string, StepperValue<Wallet> | Promise<StepperValue<Wallet>>>;
    broker: Map<string, HeldStepperValue<Broker> | Promise<HeldStepperValue<Broker>>>;
    sensor: Map<string, HeldStepperValue<Sensor> | Promise<HeldStepperValue<Sensor>>>;
    integration: Map<string, HeldStepperValue<Integration> | Promise<HeldStepperValue<Integration>>>;
    brokerPublicKeys: string[] | null;
    curBlockDifficulty: number;
    /*We want to cache the checkXExists result, and it returns false on non-existence, and true on existence
    Therefore
      if the value is undefined(doesn't exist in map) we don't know, and we query
      if the value is false, we are adding this triple
      if the value is true, it already exists */
    nodeTriples: Map<string, boolean | Promise<boolean>>
    literalTriples: Map<string, boolean | Promise<boolean>>
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
      curBlockDifficulty: INITIAL_MINE_DIFFICULTY,
      nodeTriples: new Map<string, boolean | Promise<boolean>>(),
      literalTriples: new Map<string, boolean | Promise<boolean>>()
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
      string: number;
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
          const stringPath = await getPath(this.persistence, readPrevBlockInfo.string);

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
              maxExc: stringPath[i + 1].minInc
            });
          }
          this.prevBlockInfo.stringPath.push({
            id: stringPath[stringPath.length - 1].id,
            maxExc: readPrevBlockInfo.depth + 1 //+1 so that the prevBlock is included when searching for data
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
    if (isFailure(res = await this.stepTxs(block.reward, block.timestamp, block.txs))) {
      await this.persistence.run("ROLLBACK;");
      res.reason = "Failed step txs: " + res.reason;
      return res;
    }
    await this.addRdf(block.reward, makeBlockName(block.hash), block.txs);

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

    for (const [key, val] of this.cache.nodeTriples.entries()) {
      if (!(val instanceof Promise) && !val) {
        await this.persistence.run("INSERT INTO NodeTriples(string,depth,escaped) VALUES (?,?,?);",
          newBlockInfo.stringId, this.prevBlockInfo.depth + 1, key);
      }
    }
    for (const [key, val] of this.cache.literalTriples.entries()) {
      if (!(val instanceof Promise) && !val) {
        await this.persistence.run("INSERT INTO LiteralTriples(string,depth,escaped) VALUES (?,?,?);",
          newBlockInfo.stringId, this.prevBlockInfo.depth + 1, key);
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
        maxExc: this.prevBlockInfo.depth + 1 //+1 so that we are included when searching for data
      });
    } else {
      this.prevBlockInfo.stringPath[this.prevBlockInfo.stringPath.length - 1].maxExc++; //increase max by one, to include us
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

    const res = await this.stepTxs(reward, timestamp, txs);

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

  private async addNodeTriple(s: string, p: string, o: string): Promise<void> {
    const escaped = escapeRdfTriple(s, p, o);

    const found = this.cache.nodeTriples.get(escaped);

    if (found === undefined) {
      const got_promise = checkNodeTripleExists(this.persistence, escaped, this.prevBlockInfo.stringifiedStringPath);
      this.cache.nodeTriples.set(escaped, got_promise);
      await got_promise;
      return;
    } else {
      return;
    }
  }

  private async addLiteralTriple(s: string, p: string, o: string): Promise<void> {
    const escaped = escapeRdfTriple(s, p, o);

    const found = this.cache.literalTriples.get(escaped);

    if (found === undefined) {
      const got_promise = checkLiteralTripleExists(this.persistence, escaped, this.prevBlockInfo.stringifiedStringPath);
      this.cache.literalTriples.set(escaped, got_promise);
      await got_promise;
      return;
    } else {
      return;
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

  private async stepPayment(tx: PaymentTx, reward: string): Promise<Result> {
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

  private async payoutIntegration(integration: Integration): Promise<void> {
    const integrateeWallet = await this.getWallet(integration.owner);

    for (let i = 0; i < integration.outputs.length; i++) {
      const output = integration.outputs[i];

      const compensationRatio = output.compensationTotal / Object.values(output.witnesses).length;

      const brokerGettingPaid = output.witnesses[output.brokerOwner];

      let amount_left = output.amount;

      if (brokerGettingPaid) {
        const brokerWallet = await this.getWallet(output.brokerOwner);
        const paying = BROKER_COMMISION * amount_left
        brokerWallet.balance += paying;
        amount_left -= paying;
      }

      const sensorWallet = await this.getWallet(output.sensorOwner);
      const paying = compensationRatio * amount_left;
      sensorWallet.balance += paying;
      amount_left -= paying;

      integrateeWallet.balance += amount_left;
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
    }

    if (foundIntegration.v.uncommittedCount === 0) {
      await this.payoutIntegration(foundIntegration.v);
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
      SELECT json_extract(value, '$.id'),json_extract(value, '$.maxExc') FROM json_each(?)
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
        this.payoutIntegration(found.cur.v);
        found.cur.v.state = INTEGRATION_STATE.TIMED_OUT;
      }
    }, this.prevBlockInfo.stringifiedStringPath, INTEGRATION_STATE.RUNNING, timestamp);
  }

  private async stepTxs(reward: string, timestamp: number, txs: BlockTxs): Promise<Result> {
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
      const res = await this.stepSensorTx(tx, reward);
      if (isFailure(res)) {
        return {
          result: false,
          reason: "Failed to step sensor registration\n" + res.reason
        };
      }
    }

    for (const tx of BlockTxs.getBrokerRegistrations(txs)) {
      const res = await this.stepBrokerRegistration(tx, reward);
      if (isFailure(res)) {
        return {
          result: false,
          reason: "Failed to step broker registration\n" + res.reason
        };
      }
    }

    for (const tx of BlockTxs.getPayments(txs)) {
      const res = await this.stepPayment(tx, reward);
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

  private async addCommitRdf(blockName: string, tx: CommitTx): Promise<void> {
    const transactionName = makeCommitTransactionName(ChainUtil.hash(CommitTx.toHash(tx)));

    await this.addNodeTriple(blockName, IRIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
    await this.addNodeTriple(blockName, IRIS.PREDICATE.CONTAINS_COMMIT, transactionName);

    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.TYPE, IRIS.OBJECT.COMMIT_TX);
  }

  private async addIntegrationRdf(blockName: string, tx: IntegrationTx): Promise<void> {
    const transactionName = makeIntegrationTransactionName(ChainUtil.hash(IntegrationTx.toHash(tx)));

    await this.addNodeTriple(blockName, IRIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
    await this.addNodeTriple(blockName, IRIS.PREDICATE.CONTAINS_INTEGRATION, transactionName);

    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.REWARDED, String(tx.rewardAmount));
    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.HAS_HASH, ChainUtil.hash(IntegrationTx.toHash(tx)));
    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.TYPE, IRIS.OBJECT.INTEGRATION_TX);
  }

  private async addSensorRdf(blockName: string, tx: SensorTx): Promise<void> {
    const transactionName = makeSensorTransactionName(ChainUtil.hash(SensorTx.toHash(tx)));

    for (const triple of SensorTx.getExtraNodeMetadata(tx)) {
      await this.addNodeTriple(iriReplacePrefix(triple.s, transactionName), iriReplacePrefix(triple.p, transactionName), iriReplacePrefix(triple.o, transactionName));
    }
    for (const triple of SensorTx.getExtraLiteralMetadata(tx)) {
      await this.addLiteralTriple(iriReplacePrefix(triple.s, transactionName), iriReplacePrefix(triple.p, transactionName), String(triple.o));
    }

    await this.addNodeTriple(blockName, IRIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
    await this.addNodeTriple(blockName, IRIS.PREDICATE.CONTAINS_SENSOR_REGISTRATION, transactionName);

    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.REWARDED, String(tx.rewardAmount));
    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.HAS_HASH, ChainUtil.hash(SensorTx.toHash(tx)));

    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.TYPE, IRIS.OBJECT.SENSOR_REGISTRATION_TX);
    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.HAS_COUNTER, String(tx.counter));
    await this.addNodeTriple(transactionName, IRIS.PREDICATE.IS_OWNED_BY, makeWalletName(tx.input));
    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.DEFINES, SensorTx.getSensorName(tx));
    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.COSTS_PER_MINUTE, String(SensorTx.getCostPerMinute(tx)));
    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.COSTS_PER_KB, String(SensorTx.getCostPerKB(tx)));
    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.USES_BROKER, SensorTx.getIntegrationBroker(tx));

    //since we are adding the rdf, a sensor registration tx was stepped, and so the sensor should be in cache
    const found = this.cache.sensor.get(SensorTx.getSensorName(tx));

    if (found === undefined || found instanceof Promise) {
      throw new Error("Internal state is inconsistent, see comment above in source");
    }

    if (found.orig !== null) {
      const prevTxName = makeSensorTransactionName(found.orig.hash);
      await this.addNodeTriple(transactionName, IRIS.PREDICATE.SUPERCEDES, prevTxName);
    }
  }

  private async addBrokerRdf(blockName: string, tx: BrokerTx): Promise<void> {
    const transactionName = makeBrokerTransactionName(ChainUtil.hash(BrokerTx.toHash(tx)));

    for (const triple of BrokerTx.getExtraNodeMetadata(tx)) {
      await this.addNodeTriple(iriReplacePrefix(triple.s, transactionName), iriReplacePrefix(triple.p, transactionName), iriReplacePrefix(triple.o, transactionName));
    }
    for (const triple of BrokerTx.getExtraLiteralMetadata(tx)) {
      await this.addLiteralTriple(iriReplacePrefix(triple.s, transactionName), iriReplacePrefix(triple.p, transactionName), String(triple.o));
    }

    await this.addNodeTriple(blockName, IRIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
    await this.addNodeTriple(blockName, IRIS.PREDICATE.CONTAINS_BROKER_REGISTRATION, transactionName);

    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.REWARDED, String(tx.rewardAmount));
    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.HAS_HASH, ChainUtil.hash(BrokerTx.toHash(tx)));

    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.TYPE, IRIS.OBJECT.BROKER_REGISTRATION_TX);
    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.HAS_COUNTER, String(tx.counter));
    await this.addNodeTriple(transactionName, IRIS.PREDICATE.IS_OWNED_BY, makeWalletName(tx.input));
    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.DEFINES, BrokerTx.getBrokerName(tx));
    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.HAS_ENDPOINT, BrokerTx.getEndpoint(tx));

    //since we are adding the rdf, a broker registration tx was stepped, and so the broker should be in cache
    const found = this.cache.broker.get(BrokerTx.getBrokerName(tx));

    if (found === undefined || found instanceof Promise) {
      throw new Error("Internal state is inconsistent, see comment above in source");
    }

    if (found.orig !== null) {
      const prevTxName = makeBrokerTransactionName(found.orig.hash);
      await this.addNodeTriple(transactionName, IRIS.PREDICATE.SUPERCEDES, prevTxName);
    }
  }

  private async addPaymentRdf(blockName: string, tx: PaymentTx): Promise<void> {
    const transactionName = makePaymentTransactionName(tx);

    await this.addNodeTriple(blockName, IRIS.PREDICATE.CONTAINS_TRANSACTION, transactionName);
    await this.addNodeTriple(blockName, IRIS.PREDICATE.CONTAINS_PAYMENT, transactionName);

    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.REWARDED, String(tx.rewardAmount));
    await this.addLiteralTriple(transactionName, IRIS.PREDICATE.TYPE, IRIS.OBJECT.PAYMENT_TX);
  }

  private async addRdf(reward: string, blockName: string, txs: BlockTxs): Promise<void> {
    const prevBlockName = makeBlockName(this.prevBlockInfo.hash);

    await this.addLiteralTriple(blockName, IRIS.PREDICATE.TYPE, IRIS.OBJECT.BLOCK);
    await this.addNodeTriple(blockName, IRIS.PREDICATE.LAST_BLOCK, prevBlockName);
    await this.addLiteralTriple(blockName, IRIS.PREDICATE.MINED_BY, makeWalletName(reward));

    for (const tx of BlockTxs.getCommits(txs)) {
      await this.addCommitRdf(blockName, tx);
    }

    for (const tx of BlockTxs.getIntegrations(txs)) {
      await this.addIntegrationRdf(blockName, tx);
    }

    for (const tx of BlockTxs.getSensorRegistrations(txs)) {
      await this.addSensorRdf(blockName, tx);
    }

    for (const tx of BlockTxs.getBrokerRegistrations(txs)) {
      await this.addBrokerRdf(blockName, tx);
    }

    for (const tx of BlockTxs.getPayments(txs)) {
      await this.addPaymentRdf(blockName, tx);
    }
  }

  private async createHeadAndString(block: Block): Promise<NewBlockInfo> {
    //create string and head for our new block
    const ourNewStringId = (await this.persistence.get<IdDbRes>("INSERT INTO String(prev, minInc) VALUES (?,?) RETURNING id;", this.prevBlockInfo.stringId, this.prevBlockInfo.depth + 1) as IdDbRes).id;
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

////called when the blockchain changes, calls all listeners
//function onChange(blockchain: Blockchain, newBlocks: Block[], changes: UpdaterChanges, difference: number): void {
//  for (const listener of blockchain.listeners) {
//    listener(newBlocks, changes, difference);
//  }
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

//type Listener = (newBlocks: Block[], changes: UpdaterChanges, difference: number) => void;

type FusekiQueryRes = {
  head: string[];
  results: {
    [index: string]: {
      type: string;
      value: string;
    };
  }[];
};

const FUSEKI_QUERY_TYPE = {
  QUERY: "query",
  UPDATE: "update"
} as const;

export type FusekiQueryType = typeof FUSEKI_QUERY_TYPE[keyof typeof FUSEKI_QUERY_TYPE];

async function fuseki_query(location: string, type: FusekiQueryType, query: string): Promise<FusekiQueryRes> {
  type FusekiResRaw = {
    head: {
      vars: string[];
    };
    results: {
      bindings: {
        [index: string]: {
          type: string;
          value: string;
        };
      }[];
    }
  };

  const fetch_res = await fetch(location + '/' + type, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    body: type + '=' + encodeURIComponent(query)
  });

  if (400 <= fetch_res.status && fetch_res.status <= 500) {
    const err_string = await fetch_res.text();
    throw new Error(`Query failed with status ${fetch_res.status}: ${err_string}`, { cause: fetch_res });
  }

  const res = (await fetch_res.json()) as FusekiResRaw;
  return {
    head: res.head.vars,
    results: res.results.bindings
  };
}

async function updateFuseki(location: string, persistence: Persistence, toHash: string) {
  const curHash = (await fuseki_query(location, FUSEKI_QUERY_TYPE.QUERY, `SELECT ?at WHERE { <${IRIS.OBJECT.SYSTEM}> <${IRIS.PREDICATE.CUR_HEAD_HASH}> ?at }.`)).results[0]["at"].value;
  //write WAL tx triple
  await fuseki_query(location, FUSEKI_QUERY_TYPE.UPDATE,
    `INSERT DATA { <${IRIS.OBJECT.SYSTEM}> <${IRIS.PREDICATE.NEXT_HEAD_HASH}> "${toHash}" }`);

  //find paths of cur and to so we can walk them to find all the blocks we need

  type Pos = { string: number, depth: number };

  const curPos = await persistence.get<Pos>(`SELECT string,depth FROM Blocks WHERE hash = ?;`, curHash);
  if (curPos === undefined) {
    throw new Error(`Cannot find block with hash '${curHash}'`);
  }
  const curPath = await getPath(persistence, curPos.string);
  const toPos = await persistence.get<Pos>(`SELECT string,depth FROM Blocks WHERE hash = ?;`, toHash);
  if (toPos === undefined) {
    throw new Error(`Cannot find block with hash '${toPos}'`);
  }
  const toPath = await getPath(persistence, toPos.string);

  const toPathInfo: PathInfo[] = [];

  //string id->index in toPathInfo
  const toStrings = new Map<number,number>();

  /*
    similar to setPrevBlock, the path is much more useful as a list of [string id, max depth] than [string id, min depth] so we convert it here
    by using the min of the string after to become the max of the cur. The last max is the depth at which we start
  */
  for (let i = 0; i < toPath.length - 1; ++i) {
    toStrings.set(toPath[i].id, i);
    toPathInfo.push({
      id: toPath[i].id,
      maxExc: toPath[i + 1].minInc
    });

  }

  toStrings.set(toPath[toPath.length - 1].id, toPath.length - 1);
  toPathInfo.push({
    id: toPath[toPath.length - 1].id,
    maxExc: toPos.depth + 1 //as max is excluded, we +1 so that the block at cur is included
  });

  //the current depth we're working at
  let depthAt = curPos.depth;
  //used to store where the intersection happens for after the deleting phase
  let stringIntersection: number | undefined = undefined; 

  type GetTriple = { escaped: string };

  let triples: GetTriple[] = [];

  //setting up helping lambdas and data for the actual updating of fuseki
  let queryHeader = "DELETE DATA {";
  let query = queryHeader;

  const addNodeTriple = async (v: string) => {
    const unescaped = unEscapeNodeMetadata(v);

    query += `<${unescaped.s}> <${unescaped.p}> <${unescaped.s}>.`;

    if (query.length >= MAX_FUSEKI_MESSAGE_SIZE) {
      query += '};';
      await fuseki_query(location, FUSEKI_QUERY_TYPE.UPDATE, query);
      query = queryHeader;
    }
  };
  const addLiteralTriple = async (v: string) => {
    const unescaped = unEscapeNodeMetadata(v);

    query += `<${unescaped.s}> <${unescaped.p}> "${unescaped.s}>"`;

    if (query.length >= MAX_FUSEKI_MESSAGE_SIZE) {
      query += '};';
      await fuseki_query(location, FUSEKI_QUERY_TYPE.UPDATE, query);
      query = queryHeader;
    }
  };

  //we walk down the cur path, waiting until we hit a string that is in the to path
  for (const curString of curPath) {
    //is this string in the to path?
    stringIntersection = toStrings.get(curString.id);
    if (stringIntersection !== undefined) {
      //because the to path might come off the intersecting string before the cur path intersects it, we need to check to see if we still need to delete anything
      if (toPathInfo[stringIntersection].maxExc <= depthAt) {
        //we still have a bit to go
        triples = await persistence.all<GetTriple>(`SELECT escaped FROM NodeTriples WHERE string = ? AND depth <= ? AND depth >= ?`, curString.id, depthAt, toPathInfo[stringIntersection].maxExc);
        for (const triple of triples) {
          await addNodeTriple(triple.escaped);
        }
        triples = await persistence.all<GetTriple>(`SELECT escaped FROM LiteralTriples WHERE string = ? AND depth <= ? AND depth >= ?`, curString.id, depthAt, toPathInfo[stringIntersection].maxExc);
        for (const triple of triples) {
          await addLiteralTriple(triple.escaped);
        }
      }
      break;
    } else {
      //remove all nodes and triples on this string
      triples = await persistence.all<GetTriple>(`SELECT escaped FROM NodeTriples WHERE string = ? AND depth <= ?;`, curString.id, depthAt);
      for (const triple of triples) {
        await addNodeTriple(triple.escaped);
      }
      triples = await persistence.all<GetTriple>(`SELECT escaped FROM LiteralTriples WHERE string = ? AND depth <= ?;`, curString.id, depthAt);
      for (const triple of triples) {
        await addLiteralTriple(triple.escaped);
      }
      //set our new depth
      depthAt = curString.minInc;
    }
  }

  if (stringIntersection === undefined) {
    //if we never intersected before, we must intersect on the genesis block
    stringIntersection = 0;
  }

  //if we have left over data to delete, do that
  if (query !== queryHeader) {
    query += '};';
    await fuseki_query(location, FUSEKI_QUERY_TYPE.UPDATE, query);
  }
  //we're now inserting, set up our helpers for that
  queryHeader = "INSERT DATA {";
  query = queryHeader;

  //now we walk up the to path, inserting all nodes and triples on that path
  for (; stringIntersection < toPathInfo.length; ++stringIntersection) {
    triples = await persistence.all<GetTriple>(`SELECT escaped FROM NodeTriples WHERE string = ? AND depth >= ? AND depth < ?;`, toPathInfo[stringIntersection].id, depthAt, toPathInfo[stringIntersection].maxExc);
    for (const triple of triples) {
      await addNodeTriple(triple.escaped);
    }
    triples = await persistence.all<GetTriple>(`SELECT escaped FROM LiteralTriples WHERE string = ? AND depth >= ? AND depth < ?;`, toPathInfo[stringIntersection].id, depthAt, toPathInfo[stringIntersection].maxExc);
    for (const triple of triples) {
      await addLiteralTriple(triple.escaped);
    }
    //update our depth
    depthAt = toPathInfo[stringIntersection].maxExc;
  }

  //if we have left over data to insert, do that
  if (query !== queryHeader) {
    query += '};';
    await fuseki_query(location, FUSEKI_QUERY_TYPE.UPDATE, query);
  }

  //remove the WAL tx triple
  await fuseki_query(location, FUSEKI_QUERY_TYPE.UPDATE, `DELETE DATA { <${IRIS.OBJECT.SYSTEM}> <${IRIS.PREDICATE.NEXT_HEAD_HASH}> "${toHash}" }`);

  //and we're done
}

//this culls all heads/blocks/strings that haven't been seen after (CURRENT_TIME - cullLength).
//So with a cullLength of 1000, it will cull all heads and blocks/strings associated with them that were lastSeen 1000 seconds or more in the past
async function checkHeadsForCullImpl(persistence: Persistence, cullLength: number): Promise<void> {
  //first get the blockchain head block, and it's assocated head, so we don't cull our longest chain just because of network loss or something silly
  const headBlock = await persistence.get<{ id: number }>("SELECT id FROM Blocks ORDER BY depth DESC, timestamp ASC LIMIT 1;");
  if (headBlock === undefined) {
    //if no 'best' block, there are no blocks, there are no strings, there are no heads. Just short-circuit and return
    return;
  }
  const headHead = await persistence.get<{ id: number }>("SELECT id FROM Head WHERE block = ?;", headBlock.id);
  if (headHead === undefined) {
    //inconsistent db
    throw new Error(`Inconsistent db: Head block (id:${headBlock.id}) does not have a head.`);
  }

  //remove all heads with lastSeen before or equal to our cutoff time (but not our head head), returning the ids of their blocks
  const culledBlocks = await persistence.all<{ block: number }>("DELETE FROM Head WHERE lastSeen <= (unixEpoch() - ?) AND id != ? RETURNING block;", cullLength, headHead.id);

  type StringInfo = {
    id: number;
    minInc: number;
    prev: number;
  }

  //this stores our queue/stack of strings to cull
  const cullingStrings: StringInfo[] = [];

  //for every block from a head we culled, find it's string, and at it to the stack
  for (const culled of culledBlocks) {
    const stringRes = await persistence.get<StringInfo>(`
        SELECT Blocks.string AS id,String.minInc AS minInc,String.prev AS prev FROM Blocks
        INNER JOIN String
          ON String.id = Blocks.string
        WHERE Blocks.id = ?`, culled.block);
    if (stringRes === undefined) {
      throw new Error(`Tried to cull head with block id ${culled.block} but couldn't select it's string`);
    }
    cullingStrings.push(stringRes);
  }

  //while we have strings to cull
  for(const culling of cullingStrings) {
    const maxChildMinRes = await persistence.all<{ id: number, minInc: number }>("SELECT id, minInc FROM String WHERE prev = ? ORDER BY minInc DESC;", culling.id);
    if (maxChildMinRes.length === 0) {
      //if nothing uses us as a child, we can just delete all our stuff
      //  delete all our blocks
      await persistence.run("DELETE FROM Blocks WHERE string = ?;", culling.id);
      //  delete ourselves
      await persistence.run("DELETE FROM String WHERE id = ?;", culling.id);
    } else if (maxChildMinRes.length === 1) {
      //if one thing branches off us, we will delete everything above the split, and then merge us into the child
      //We do that so that cached paths are still valid
      //since paths are (stringId, max)[], the child string id and the old child string max still works since we are adding blocks from below it
      //  cull all blocks >= their min
      await persistence.run("DELETE FROM Blocks WHERE string = ? AND depth >= ?;", culling.id, maxChildMinRes[0].minInc);
      //  set all blocks below to be their string
      await persistence.run("UPDATE Blocks SET string = ? WHERE string = ?;", maxChildMinRes[0].id, culling.id);
      //  update the child string to have our minInc, and our prev
      await persistence.run("UPDATE String SET minInc=?, prev=? WHERE id=?;", culling.minInc, culling.prev, maxChildMinRes[0].id);
      //  delete this string
      await persistence.run("DELETE FROM String WHERE id = ?;", culling.id);
    } else {
      //if we have multiple that branch off us, we will find the highest split, and then merge into that child
      //we merge into the child for the same reasons as in the children == 1 case
      //we are already sorted from highest(largest) minInc from the query

      //  cull all blocks >= highest min
      await persistence.run("DELETE FROM Blocks WHERE string = ? AND depth >= ?;", culling.id, maxChildMinRes[0].minInc);
      //  set all blocks below to be their string
      await persistence.run("UPDATE Blocks SET string = ? WHERE string = ?;", maxChildMinRes[0].id, culling.id);
      // update child string to have our minInv and our prev
      await persistence.run("UPDATE String SET minInc=?, prev=? WHERE id=?;", culling.minInc, culling.prev, maxChildMinRes[0].id);
      // update all other child strings to have their string. Since we've already changed their prev, we can just set all with prev=us
      await persistence.run("UPDATE String SET prev=? WHERE prev=?;", maxChildMinRes[0].id, culling.id);
      //  delete this string
      await persistence.run("DELETE FROM String WHERE id = ?;", culling.id);
    }
  }
}

//`SELECT ?version WHERE { <${IRIS.OBJECT.SYSTEM}> <${IRIS.PREDICATE.HAS_VERSION}> ?version }.`

type DbState = {
  persistence: Persistence; //our wrapper to the sqlite3 based persitence
  fusekiLocation: string | null; //the URL of a fuseki instance
  currentChain: Stepper;
  cullingTimer: NodeJS.Timeout | null; //set to null to stop timeout callback from executing in a race
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
      currentChain: new Stepper(persistence),
      cullingTimer: null
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

    type ChainHeadBlock = { id: number; depth: number; hash: string };
    let blockChainHeadBlock = await persistence.get<ChainHeadBlock>(`SELECT id,depth,hash AS max FROM Blocks ORDER BY depth DESC, timestamp ASC;`);
    let deepestHead: number | null = null;

    if (blockChainHeadBlock !== undefined) {
      await me.state.currentChain.setPrevBlock(blockChainHeadBlock.hash);
      const deepestHeadRes = await persistence.get<{ id: number }>("SELECT id FROM Head WHERE block = ?;", blockChainHeadBlock.id);
      if (deepestHeadRes === undefined) {
        throw new Error(`Inconsistent Db, the deepest block (id:${blockChainHeadBlock.id}) doesn't have a head associated with it`);
      }
      deepestHead = deepestHeadRes.id;
    } else {
      blockChainHeadBlock = {
        id: 0, //this is dirty
        depth: 1,
        hash: Block.genesis().hash
      };
    }

    if (fuseki_location !== null) {
      const version_res = await fuseki_query(fuseki_location, FUSEKI_QUERY_TYPE.QUERY,
        `SELECT ?version ?at WHERE { <${IRIS.OBJECT.SYSTEM}> <${IRIS.PREDICATE.HAS_VERSION}> ?version. <${IRIS.OBJECT.SYSTEM}> <${IRIS.PREDICATE.CUR_HEAD_HASH}> ?at }.`);

      if (version_res.head.length !== 2) {
        throw new Error("Expected only 2 'columns' from fuseki version query");
      }

      if (version_res.results.length === 0) {
        //empty DB
        await fuseki_query(fuseki_location, FUSEKI_QUERY_TYPE.UPDATE,
          `INSERT DATA { <${IRIS.OBJECT.SYSTEM}> <${IRIS.PREDICATE.HAS_VERSION}> "${FUSEKI_EXPECTED_VERSION}". <${IRIS.OBJECT.SYSTEM}> <${IRIS.PREDICATE.CUR_HEAD_HASH}> "${Block.blockHash(Block.genesis())}" }.`);
      } else if (version_res.results.length > 1) {
        //?????
        throw new Error("Fuseki db is inconsistent, more than 1 version result");
      } else {
        const res_version = version_res.results[0]["version"].value;
        if (res_version !== FUSEKI_EXPECTED_VERSION) {
          throw new Error(`Unexpected fuseki db version. Expected ${FUSEKI_EXPECTED_VERSION}, found ${res_version}`);
        }
      }

      //we first need to finish any old transaction for fuseki consistency before we check if fuseki is representing what we have in the db

      const get_next_block_at_hash_res = await fuseki_query(fuseki_location, FUSEKI_QUERY_TYPE.QUERY,
        `SELECT ?to WHERE {<${IRIS.OBJECT.SYSTEM}> <${IRIS.PREDICATE.NEXT_HEAD_HASH}> ?to }.`);

      if (get_next_block_at_hash_res.results.length > 0) {
        //we're in the middle of a WAL, we need to complete this
        await updateFuseki(fuseki_location, persistence, get_next_block_at_hash_res.results[0]["to"].value);
        version_res.results[0]["at"] = get_next_block_at_hash_res.results[0]["to"];
      }

      //now fuseki is internally consistent, we can check to see if fuseki matches sqlite
      if (version_res.results[0]["at"].value !== blockChainHeadBlock.hash) {
        await updateFuseki(fuseki_location, persistence, blockChainHeadBlock.hash);
      }
    }

    //if we've been stopped for a while, all lastSeens will be far in the past since we couldn't have seen them since we were stopped
    //so when starting up, we add the (currentTime - deepest head lastSeen) to all heads.
    //This is better than setting all lastSeen to currentTime since we won't have 1 cull that tries to remove all of the stale heads at once
    //we can only do this if the blockchain isn't empty, and we check this by whether the head block has a head attached to it. If no, it must be genesis, and we're empty
    if (deepestHead !== null) {
      const res = (await persistence.get("SELECT lastSeen - unixEpoch() AS delta FROM Head WHERE id = ?;", deepestHead)) as { delta: number };
      await persistence.run("UPDATE Head SET lastSeen = lastSeen + ?;", res.delta);
    }

    //do an initial cull, and this starts the culling timer loop
    await me.onCullingTimer();


    return me;
  }

  getHeadHash(): string {
    return this.state.currentChain.getPrevBlockHash();
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

  async getBlock(hash: string): Promise<Block | null> {
    return await this.addOp(async () => {
      const got = await this.state.persistence.get<{ raw: string }>("SELECT raw FROM Blocks WHERE hash = ?;", hash);
      if (got === undefined) {
        return null;
      }
      return JSON.parse(got.raw) as Block;
    });
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


        //if we have fuseki, we need to update fuseki
        if (this.state.fusekiLocation !== null) {
          await updateFuseki(this.state.fusekiLocation, this.state.persistence, stepper.getPrevBlockHash());
        }

        this.state.currentChain = stepper;
      }
      return res;
    });
  }

  async manualCull(cullTimeS: number): Promise<void> {
    return await this.addOp<void>(async () => {
      return await checkHeadsForCullImpl(this.state.persistence, cullTimeS);
    });
  }

  async close(): Promise<void> {
    if (this.state.cullingTimer !== null) {
      this.state.cullingTimer.unref();
      clearTimeout(this.state.cullingTimer);
      this.state.cullingTimer = null;
    }
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

  private async onCullingTimer(): Promise<void> {
    //cull everything older than 1 hour
    await checkHeadsForCullImpl(this.state.persistence, CULL_TIME_S);
    this.state.cullingTimer = setTimeout(() => {
      this.addOp<void>(async () => {
        if (this.state.cullingTimer === null) {
          //this was set to null to stop races
          return;
        }
        await this.onCullingTimer(); 
      }); //don't need to await
    }, 60*1000); //do it every minute
  }

  //addListener(listener:Listener): void {
  //  this.listeners.push(listener);
  //}
}

export default Blockchain;
export { Blockchain, Persistence, type Integration, type Sensor, type Broker, type Wallet };
