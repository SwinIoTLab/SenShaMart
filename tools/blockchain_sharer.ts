import { Blockchain, Persistence } from '../blockchain/blockchain.js';
import { PropServer, type SocketConstructor } from '../network/blockchain-prop.js';
import { WebSocket, WebSocketServer } from 'ws';
import { promises as fs } from 'fs';
import { default as express } from 'express';

const UPDATE_TIME = 60 * 60 * 1000; //1 hour

if (process.argv.length < 2) {
  console.error("Expected argv string with 'node <PATH TO FILE>'");
  process.exit(-1);
}
if (process.argv.length < 7) {
  console.error(`Expected 'node "${process.argv[1]}" <active blockchain location> <sharing blockchain location> <chain server port> <peers> <sharing port>`);
  process.exit(-2);
}

const activeBlockchainLocation = process.argv[2];
const passiveBlockchainLocation = process.argv[3];
const chainServerPort = Number.parseInt(process.argv[4]);
const peers = process.argv[5];
const sharingPort = Number.parseInt(process.argv[6]);

const blockchain = await Blockchain.create(activeBlockchainLocation, null);

const chainServer = new PropServer("Chain-server", blockchain, WebSocket as unknown as SocketConstructor, WebSocketServer);
chainServer.start(chainServerPort, '', JSON.parse(peers));

async function copyBlockchain() {
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
  await fs.copyFile(activeBlockchainLocation, passiveBlockchainLocation);
  blockchain.persistence = await Persistence.openDb(activeBlockchainLocation);
  setTimeout(copyBlockchain, UPDATE_TIME);
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

add_static_file('/blockchain.db', passiveBlockchainLocation, '.db');

app.listen(sharingPort, () => console.log(`Listening on port ${sharingPort}`));