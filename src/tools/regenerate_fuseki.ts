import { Blockchain, unEscapeLiteralMetadata, unEscapeNodeMetadata, DATA_TYPE } from "../blockchain/blockchain.js";

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
    console.log(`Reason: ${response.statusText}`);
    process.exit(-1);
  }
}

const chain = await Blockchain.create(process.argv[2], null);

let createQuery: string = QUERY_HEADER;

let n = 0;

for (const node of chain.getAll(DATA_TYPE.NODE_RDF).keys()) {
  const triple = unEscapeNodeMetadata(node);

  createQuery += `<${triple.s}> <${triple.p}> <${triple.o}>.`;
  n = n + 1;

  if (createQuery.length >= MAX_MESSAGE_SIZE) {
    createQuery += QUERY_FOOTER;
    console.log(`Sending ${n} triples}`);
    await sendUpdate(createQuery);
    n = 0;
    createQuery = QUERY_HEADER
  }
}

for (const literal of chain.getAll(DATA_TYPE.LITERAL_RDF).keys()) {
  const triple = unEscapeLiteralMetadata(literal);

  createQuery += `<${triple.s}> <${triple.p}> "${triple.o}".`;
  n = n + 1;

  if (createQuery.length >= MAX_MESSAGE_SIZE) {
    createQuery += QUERY_FOOTER;
    console.log(`Sending ${n} triples}`);
    await sendUpdate(createQuery);
    n = 0;
    createQuery = QUERY_HEADER;
  }
}

createQuery += QUERY_FOOTER;
await sendUpdate(createQuery);