import { type KeyPair } from '../util/chain-util.js'
import { Blockchain, type IntegrationOutput, type RetrievedAt } from '../blockchain/blockchain.js'
import { default as IntegrationCache, type IntegrationOutput as CachedOutput } from './integration-cache.js'
import { Commit as CommitTx } from '../blockchain/commit.js'

import assert from 'assert/strict';

type MQTT = {
  publish: (topic: string, payload: string | Buffer) => void;
}

type Commiter = {
  commit: (tx: CommitTx) => void;
}

type Packet = {
  nowMinutes: number;
  retrieveAtNow: RetrievedAt;
  data: string | Buffer;
  fin: () => void;
}

function minutesNow(now: number = Date.now()) {
  //divide by 1000 for ms, 60 for seconds, and floor to get whole minutes passed
  return now / (1000 * 60);
}

class Broker {
  kp: KeyPair;
  passthrough: boolean;
  brokerName: string;
  blockchain: Blockchain;
  mqtt: MQTT;
  //sensor name -> packet queue
  packetQueue: Map<string, Packet[]>;
  cache: IntegrationCache;
  committer: Commiter;
  logToConsole: boolean;

  constructor(kp: KeyPair, passthrough: boolean, brokerName: string, blockchain: Blockchain, mqtt: MQTT, cache: IntegrationCache, committer: Commiter, logToConsole: boolean = false) {
    this.kp = kp;
    this.passthrough = passthrough;
    this.brokerName = brokerName;
    this.blockchain = blockchain;
    this.mqtt = mqtt;
    this.packetQueue = new Map<string, Packet[]>();
    this.cache = cache;
    this.committer = committer;
    this.logToConsole = logToConsole;
  }

  static getCost(cachedInfo: CachedOutput, staticInfo: IntegrationOutput, nowMinutes: number, data_length: number): number {
    let timeDelta = nowMinutes - cachedInfo.dataLastAtMinutes;
    //if the timeDelta is negative, we're 'back in time'
    if (timeDelta < 0) {
      timeDelta = 0;
    }
    return timeDelta * staticInfo.sensorCostPerMin
      + data_length / 1024 * staticInfo.sensorCostPerKB;
  }

  private async pumpPackets(sensor: string, queue: Packet[]) {
    //use a for loop so we can't forget to shift AFTER we work
    for (; queue.length > 0; queue.shift()) {
      const packet = queue[0];

      const foundSensor = await this.blockchain.getSensor(sensor, packet.retrieveAtNow);

      if (foundSensor.val === null) {
        if (this.logToConsole) {
          console.log(`Sensor ${sensor} doesn't exist on the blockchain at headhash ${foundSensor.headHash}`);
        }
        packet.fin();
        continue;
      }

      //if we aren't brokering this sensor, ignore
      if (foundSensor.val.broker !== this.brokerName) {
        if (this.logToConsole) {
          console.log(`Sensor ${sensor} is not being brokered by us at headhash ${foundSensor.headHash}`);
        }
        packet.fin();
        continue;
      }

      const integrations = (await this.blockchain.getRunningIntegrationsUsingSensor(sensor, packet.retrieveAtNow)).val;

      for (const integration of integrations) {
        assert(integration.outputs[sensor] !== undefined);
        let got = await this.cache.get(integration.hash, sensor);
        if (got === null) {
          got = {
            sensorName: sensor,
            integrationHash: integration.hash,
            dataLastAtMinutes: minutesNow(integration.startTime),
            coinsLeft: integration.outputs[sensor].amount
          };
        }

        if (got.coinsLeft <= 0) {
          //out of money, ignore
          packet.fin();
          continue;
        }

        //we always send even if we run out of coins on this message
        this.mqtt.publish("out/" + integration.key + '/' + sensor, packet.data);

        const cost = Broker.getCost(got, integration.outputs[sensor], packet.nowMinutes, packet.data.length);
        got.coinsLeft -= cost;
        got.dataLastAtMinutes = packet.nowMinutes;
        if (this.logToConsole) {
          console.log(`out/${integration.key}/${sensor} : cost=${cost}, coinsLeft=${got.coinsLeft}`);
        }

        await this.cache.set(got);

        if (got.coinsLeft <= 0) {
          //we're out of time, integration is over
          if (this.logToConsole) {
            console.log(`out of coins for ${integration.key}/${sensor}`);
          }
          this.committer.commit(new CommitTx(this.kp, integration.key, [CommitTx.createOutput(sensor, 1)]));
        }
      }
      packet.fin();
    }
  }

  onNewPacket(sensor: string, data: string | Buffer, now = Date.now()): Promise<void> {
    //check to see if sensor has been paid for

    const nowMinutes = minutesNow(now);
    const retrieveAtNow = this.blockchain.retrieveAtNow();

    if (this.logToConsole) {
      console.log(`New packet from ${sensor} with size ${data.length}`);
    }

    if (this.passthrough) {
      this.mqtt.publish("out/" + sensor, data);
    }

    let found = this.packetQueue.get(sensor);

    if (found === undefined) {
      found = [];
      this.packetQueue.set(sensor, found);
    }

    const returning = new Promise<void>((res, _rej) => {
      assert(found !== undefined);
      found.push({
        nowMinutes: nowMinutes,
        retrieveAtNow: retrieveAtNow,
        data: data,
        fin: res
      });
    });


    //if length is 1 after we've just pushed ours, we can pump this queue
    if (found.length === 1) {
      //we let this async function run by itself, without awaiting
      this.pumpPackets(sensor, found);
    }

    return returning;
  }
}

export default Broker;