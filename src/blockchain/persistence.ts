import { default as sqlite3, type Statement, type Database } from 'sqlite3';

type CachedStatement = {
  stmt: Statement;
  cache: Statement[];
}

async function syncRun(db: Database, query: string): Promise<void> {
  return new Promise<void>((resolve, reject) => db.run(query, (err) => {
    if (err) {
      reject(err);
    } else {
      resolve();
    }
  }));
}

class Persistence {
  db: Database;
  stmts: Map<string, Statement[]>;
  private constructor(db: Database) {
    this.db = db;
    this.stmts = new Map<string, Statement[]>();
  }

  static async openDb(db_location: string): Promise<Persistence> {
    const db = await new Promise<Database>((resolve, reject) => {
      const returning = new sqlite3.Database(db_location, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(returning);
        }
      });
    });

    await syncRun(db, "PRAGMA foreign_keys = ON;");

    await syncRun(db, "PRAGMA journal_mode = WAL;");

    return new Persistence(db);
  }

  private async prepare(query: string): Promise<Statement> {
    return new Promise<Statement>((resolve, reject) => {
      const stmt = this.db.prepare(query, (err) => {
        if (err) {
          reject(new Error(`Couldn't prepare '${query}': ${err.message}`));
        } else {
          resolve(stmt);
        }
      });
    });
  }

  private async getStmt(query: string): Promise<CachedStatement> {
    let stmtList = this.stmts.get(query);
    if (stmtList === undefined) {
      stmtList = [];
      this.stmts.set(query, stmtList);
    }

    const popped = stmtList.pop();

    if (popped === undefined) {
      return {
        stmt: await this.prepare(query),
        cache: stmtList
      };
    } else {
      return {
        stmt: popped,
        cache: stmtList
      };
    }
  }

  async each<Row>(query: string, cb: (row: Row) => void, ...input: unknown[]): Promise<void> {
    const stmt = await this.getStmt(query);

    return new Promise<void>((resolve, reject) => {
      stmt.stmt.each<Row>([...input], (err, row) => {
        if (!err) {
          cb(row);
        }
      }, (err, _count) => {
        if (err) {
          stmt.stmt.reset(() => {
            stmt.cache.push(stmt.stmt);
            reject(err)
          });
        } else {
          stmt.stmt.reset(() => {
            stmt.cache.push(stmt.stmt);
            resolve()
          });
        }
      });
    });
  }

  async all<Row>(query: string, ...input: unknown[]): Promise<Row[]> {
    const stmt = await this.getStmt(query);

    return new Promise<Row[]>((resolve, reject) => {
      stmt.stmt.all<Row>([...input], (err, rows) => {
        if (err) {
          stmt.stmt.reset(() => {
            stmt.cache.push(stmt.stmt);
            reject(err)
          });
        } else {
          stmt.stmt.reset(() => {
            stmt.cache.push(stmt.stmt);
            resolve(rows)
          });
        }
      });
    });
  }

  async get<Row>(query: string, ...input: unknown[]): Promise<Row | undefined> {
    const stmt = await this.getStmt(query);

    return new Promise<Row | undefined>((resolve, reject) => {
      stmt.stmt.get<Row>([...input], (err, row) => {
        if (err) {
          stmt.stmt.reset(() => {
            stmt.cache.push(stmt.stmt);
            reject(err)
          });
        } else {
          stmt.stmt.reset(() => {
            stmt.cache.push(stmt.stmt);
            resolve(row)
          });
        }
      });
    });
  }

  async run(query: string, ...input: unknown[]): Promise<void> {
    const stmt = await this.getStmt(query);

    return new Promise<void>((resolve, reject) => {
      stmt.stmt.run(...input, (err: Error) => {
        if (err) {
          stmt.stmt.reset(() => {
            stmt.cache.push(stmt.stmt);
            reject(err);
          });
        } else {
          stmt.stmt.reset(() => {
            stmt.cache.push(stmt.stmt);
            resolve();
          });
        }
      });
    });
  }
}

export default Persistence;