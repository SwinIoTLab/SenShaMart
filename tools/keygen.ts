import { ChainUtil } from '../util/chain-util.js';

const gennedKey = ChainUtil.genKeyPair();

const publicKey = ChainUtil.serializePublicKey(gennedKey.pub);
const privateKey = ChainUtil.serializeKeyPair(gennedKey);

console.log("Generated key:");
console.log(`\n\n\tPublic Key:\n${publicKey}`);
console.log(`\n\n\tKeypair:\n${privateKey}\n\n`);