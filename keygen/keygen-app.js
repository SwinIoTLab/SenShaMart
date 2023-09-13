const ChainUtil = require('../util/chain-util');

const gennedKey = ChainUtil.genKeyPair();

const publicKey = gennedKey.getPublic().encode('hex');
const privateKey = ChainUtil.serializeKeyPair(gennedKey);

console.log("Generated key:");
console.log(`\tPublic Key: ${publicKey}`);
console.log(`\tPrivate Key: ${privateKey}`);