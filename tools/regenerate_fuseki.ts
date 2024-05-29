import { Blockchain, unEscapeLiteralMetadata, unEscapeNodeMetadata } from "../blockchain/blockchain.js";

const MAX_MESSAGE_SIZE = 1 * 1024 * 1024
const QUERY_HEADER = "INSERT DATA {";
const QUERY_FOOTER = '};';

if (process.argv.length < 2) {
  console.error("Expected argv string with 'node <PATH TO FILE>'");
  process.exit(-1);
}
if (process.argv.length < 4) {
  console.error(`Expected 'node "${process.argv[1]}" <path to blockchain db> <location of fuseki instance>`);
  process.exit(-2);
}

async function sendUpdate(query: string) {
  const response = await fetch(process.argv[3] + "/update", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    body: 'update=' + encodeURIComponent(query)
  });

  console.log(`Response status: ${response.status}`);

  if (response.status !== 200) {
    process.exit(-1);
  }
}

const chain = await Blockchain.create(process.argv[2], null);

let createQuery: string = QUERY_HEADER;

for (const node of chain.triples().nodes.keys()) {
  const triple = unEscapeNodeMetadata(node);

  createQuery += `<${triple.s}> <${triple.p}> <${triple.o}>.`;
  console.log(`<${triple.s}> <${triple.p}> <${triple.o}>.`);

  if (createQuery.length >= MAX_MESSAGE_SIZE) {
    createQuery += QUERY_FOOTER;
    await sendUpdate(createQuery);
    createQuery = QUERY_HEADER
  }
}

for (const literal of chain.triples().literals.keys()) {
  const triple = unEscapeLiteralMetadata(literal);

  createQuery += `<${triple.s}> <${triple.p}> "${triple.o}".`;
  console.log(`<${triple.s}> <${triple.p}> <${triple.o}>.`);

  if (createQuery.length >= MAX_MESSAGE_SIZE) {
    createQuery += QUERY_FOOTER;
    await sendUpdate(createQuery);
    createQuery = QUERY_HEADER;
  }
}

createQuery += QUERY_FOOTER;
await sendUpdate(createQuery);