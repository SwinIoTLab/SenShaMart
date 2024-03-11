const rollbackPrefix = 'rollback_';
const metaFile = 'meta.json';

interface NodeError extends Error {
  code: string
}

type UnderlyingDataCb = (e: NodeError, data: string) => void;
type DataCb = (e: Error, data: unknown) => void;
type UnderlyingCb = (e: NodeError) => void;
type Cb = (e: Error) => void;

interface Underlying {
  readFile(path: string, options: string, UnderlyingCb: UnderlyingDataCb): void;
  writeFile(path: string, data: string, UnderlyingCb: UnderlyingCb): void;
  copyFile(from: string, to: string, UnderlyingCb: UnderlyingCb): void; 
}

type MetaBlock = {
  blockCount: number;
  rollback: null | {
    from: number,
    count: number
  };
};

function createDefaultMetaBlock() : MetaBlock {
  return {
    blockCount: 0,
    rollback: null
  };
}

function onConstructReadMeta(persistence: Persistence, err: NodeError, data: string, UnderlyingCb: UnderlyingCb): void {
  if (err) {
    console.log(err.code);
    if (err.code === "ENOENT") {
      const defaultMetaBlock = createDefaultMetaBlock();
      persistence.underlying.writeFile(persistence.folderPrefix + metaFile, JSON.stringify(defaultMetaBlock), UnderlyingCb);
      persistence.meta = defaultMetaBlock;
      return;
    }

    UnderlyingCb(err);
    return;
  }

  try {
    const asObj = JSON.parse(data);
    console.log('Found meta object:');
    console.log(JSON.stringify(asObj));
    persistence.meta = asObj;
  } catch (e) {
    UnderlyingCb(e);
    return;
  }

  if (persistence.meta.rollback !== null) {
    copySequence(persistence, persistence.folderPrefix + rollbackPrefix, persistence.folderPrefix, persistence.meta.rollback.from, persistence.meta.rollback.count, UnderlyingCb);
  } else {
    UnderlyingCb(null);
  }
}

function onReadBlock(err: NodeError, data: string, UnderlyingCb: DataCb): void {
  if (err) {
    UnderlyingCb(err, null);
    return;
  }

  let asObj: unknown = null;

  try {
    asObj = JSON.parse(data);
  } catch (e) {
    UnderlyingCb(e, null);
    return;
  }

  UnderlyingCb(null, asObj);
}

function writeSequence(persistence: Persistence, i: number, data: unknown[], UnderlyingCb: UnderlyingCb): void {
  if (data.length === 0) {
    UnderlyingCb(null);
    return;
  }

  console.log(`Writing ${i}`);

  persistence.underlying.writeFile(
    persistence.folderPrefix + i.toString() + '.json',
    JSON.stringify(data[0]),
    (err) => {
      if (err) {
        UnderlyingCb(err);
        return;
      }

      writeSequence(persistence, i + 1, data.slice(1), UnderlyingCb);
    });
}

function copySequence(persistence: Persistence, prefixFrom: string, prefixTo: string, from: number, count:number, UnderlyingCb: UnderlyingCb):void {
  if (count === 0) {
    UnderlyingCb(null);
    return;
  }

  persistence.underlying.copyFile(
    prefixFrom + from.toString() + '.json',
    prefixTo + from.toString() + '.json',
    (err) => {
      if (err) {
        UnderlyingCb(err);
        return;
      }

      copySequence(persistence, prefixFrom, prefixTo, from + 1, count - 1, UnderlyingCb);
    });
}

function writeMeta(persistence: Persistence, UnderlyingCb: UnderlyingCb): void {
  persistence.underlying.writeFile(persistence.folderPrefix + metaFile, JSON.stringify(persistence.meta), UnderlyingCb);
}

class Persistence {
  underlying: Underlying;
  folderPrefix: string;
  meta: MetaBlock;
  constructor(folderPrefix: string, UnderlyingCb: Cb, underlying: Underlying) {
    this.underlying = underlying;
    if (!folderPrefix.endsWith('/')) {
      this.folderPrefix = folderPrefix + '/';
    } else {
      this.folderPrefix = folderPrefix;
    }

    this.meta = null;

    this.underlying.readFile(this.folderPrefix + metaFile, 'utf8', (err, data) => onConstructReadMeta(this, err, data, UnderlyingCb));
  }

  readBlock(i: number, UnderlyingCb: DataCb) {
    if (i >= this.blockCount()) {
      setImmediate(() => UnderlyingCb(new Error(`${i} is larger than or equal to the current blockCount of ${this.blockCount()}`), null));
      return;
    }
    this.underlying.readFile(this.folderPrefix + i.toString() + ".json", 'utf8', (err, data) => onReadBlock(err, data, UnderlyingCb));
  }

  writeBlocks(i: number, objs: unknown[], UnderlyingCb: Cb): void {
    if (!UnderlyingCb) {
      throw Error('no UnderlyingCb');
    }
    if (i > this.blockCount()) {
      setImmediate(() => UnderlyingCb(new Error(`${i} is larger than the current blockCount of ${this.blockCount()}. It must be in bounds or equal for a new block`)));
      return;
    }
    if (objs.length === 0) {
      setImmediate(() => UnderlyingCb(null));
      return;
    }

    if (i === this.meta.blockCount) {
      writeSequence(this, i, objs, (err) => {
        if (err) {
          UnderlyingCb(err);
          return;
        }
        this.meta.blockCount += objs.length;
        writeMeta(this, UnderlyingCb);
      });
    } else {
      const rollbackCount = Math.min(objs.length, this.meta.blockCount - i);

      copySequence(this, this.folderPrefix, this.folderPrefix + rollbackPrefix, i, rollbackCount, (err) => { //copy files for rollback
        if (err) {
          UnderlyingCb(err);
          return;
        }

        this.meta.rollback = {
          from: i,
          count: rollbackCount
        };
        writeMeta(this, (err) => { //write rollback info to meta
          if (err) {
            UnderlyingCb(err);
            return;
          }

          writeSequence(this, i, objs, (err) => { //write new data
            if (err) {
              UnderlyingCb(err);
              return;
            }

            this.meta.rollback = null;
            this.meta.blockCount = Math.max(this.meta.blockCount, i + objs.length);
            writeMeta(this, UnderlyingCb); //write no more rollback to meta
          });
        });
      });
    }
  }

  blockCount(): number {
    return this.meta.blockCount;
  }
}

export { Persistence, type Underlying };
export default Persistence;