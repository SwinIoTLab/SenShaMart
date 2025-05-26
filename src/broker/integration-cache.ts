import Persistence from '../blockchain/persistence.js';

const DB_EXPECTED_VERSION = '1' as const;

const DB_CREATE_QUERY = [
  `CREATE TABLE Configs(
    id INTEGER NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    value TEXT NOT NULL);`,

  `INSERT INTO Configs(name,value) VALUES(
    'version','${DB_EXPECTED_VERSION}');`,

  `CREATE TABLE SensorOutput(
    sensorName TEXT NOT NULL,
    integrationHash TEXT NOT NULL,
    dataLastAtMinutes INTEGER NOT NULL,
    coinsLeft REAL NOT NULL,
    PRIMARY KEY(sensorName,integrationHash));`,
];

export type IntegrationOutput = {
  sensorName: string;
  integrationHash: string;
  dataLastAtMinutes: number;
  coinsLeft: number;
};

export default class IntegrationCache {
  persistence: Persistence;

  private constructor(persistence: Persistence) {
    this.persistence = persistence;
  }

  static async create(db_location: string) {
    const persistence = await Persistence.openDb(db_location);

    const me = new IntegrationCache(persistence);

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

    return me;
  }

  async get(integrationHash: string, sensorName: string): Promise<IntegrationOutput | null> {
    type Raw = { perKB: number, perMin: number, dataLastAtMinutes: number, coinsLeft: number };
    const res = await this.persistence.get<Raw>(`
      SELECT dataLastAtMinutes, coinsLeft
      FROM SensorOutput
      WHERE integrationHash = ? AND sensorName = ?;`, integrationHash, sensorName);

    if (res === undefined) {
      return null;
    } else {
      return {
        integrationHash: integrationHash,
        sensorName: sensorName,
        dataLastAtMinutes: res.dataLastAtMinutes,
        coinsLeft: res.coinsLeft
      };
    }
  }
  async set(info: IntegrationOutput): Promise<void> {
    await this.persistence.run(`
      INSERT INTO SensorOutput(sensorName,integrationHash,dataLastAtMinutes,coinsLeft) VALUES (?,?,?,?)
        ON CONFLICT(sensorName,integrationHash) DO UPDATE SET dataLastAtMinutes=excluded.dataLastAtMinutes,coinsLeft=excluded.coinsLeft;`,
      info.sensorName, info.integrationHash, info.dataLastAtMinutes, info.coinsLeft);
  }
}