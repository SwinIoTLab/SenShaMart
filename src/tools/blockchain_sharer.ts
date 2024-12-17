import { Blockchain, Persistence } from '../blockchain/blockchain.js';
import { PropServer, type SocketConstructor } from '../network/blockchain-prop.js';
import { WebSocket, WebSocketServer } from 'ws';
import { promises as fsPromises, createReadStream } from 'fs';
import { default as express } from 'express';

const UPDATE_TIME = 60 * 60 * 1000; //1 hour

if (process.argv.length < 2) {
  console.error("Expected argv string with 'node <PATH TO FILE>'");
  process.exit(-1);
}
if (process.argv.length < 7) {
  console.error(`Expected 'node "${process.argv[1]}" <active blockchain location> <sharing blockchain stem> <chain server port> <peers> <sharing port>`);
  process.exit(-2);
}

const activeBlockchainLocation = process.argv[2];
const passiveBlockchainLocation = process.argv[3];
const chainServerPort = Number.parseInt(process.argv[4]);
const peers = process.argv[5];
const sharingPort = Number.parseInt(process.argv[6]);

const blockchain = await Blockchain.create(activeBlockchainLocation, null);

type SharingFile = {
  location: string;
  usingCount: number;
};

const chainServer = new PropServer("Chain-server", blockchain, WebSocket as unknown as SocketConstructor, WebSocketServer);
chainServer.start(chainServerPort, '', JSON.parse(peers));

let sharingFileOn = 0;
//we start on usingCount 2, so our first copy Blockchain doesn't try and remove the file which doesn't exist.
//This never goes to 0 (since no one is actually using it) and so the non-existant file is never deleted
let currentSharingFile: SharingFile = {
  location: null,
  usingCount: 2
};

async function copyBlockchain() {
  console.log("Queueing create sharing blockchain");
  blockchain.addOp(async () => {
    console.log("Creating sharing blockchain");
    for (const stmt of blockchain.persistence.stmts.values()) {
      await new Promise<void>((resolve, reject) => stmt.finalize((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }));
    }
    await new Promise<void>((resolve, reject) => blockchain.persistence.db.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    }));
    const prevSharing = currentSharingFile;
    ++sharingFileOn;
    const newSharing = {
      location: `${passiveBlockchainLocation}.${sharingFileOn}.db`,
      usingCount: 1 //start with us using it
    };
    await fsPromises.copyFile(activeBlockchainLocation, newSharing.location);
    currentSharingFile = newSharing;
    --prevSharing.usingCount; //we aren't using the prev any more
    if (prevSharing.usingCount === 0) {
      //we don't wait on this, because we don't care about if it fails, and it doesn't impact anything as it's just cleanup of unused files
      fsPromises.rm(prevSharing.location);
    }
    blockchain.persistence = await Persistence.openDb(activeBlockchainLocation);
    setTimeout(copyBlockchain, UPDATE_TIME);
  });
}

copyBlockchain();

const app = express();

const add_static_file = (url: string, location: string, type: string) => {
  app.get(url, (_req, res) => {
    res.type(type).sendFile(location, {
      root: "./"
    });
  });
};

app.get('/blockchain.db', (_req, res) => {
  res.setHeader('content-type', 'octet-stream');
  const sharingFile = currentSharingFile;
  ++sharingFile.usingCount;
  createReadStream(sharingFile.location).pipe(res).on("finish", () => {
    --sharingFile.usingCount;
    if (sharingFile.usingCount === 0) {
      fsPromises.rm(sharingFile.location);
    }
  });
});

add_static_file('/blockchain.db', passiveBlockchainLocation, '.db');

app.listen(sharingPort, () => console.log(`Listening on port ${sharingPort}`));