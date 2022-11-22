const jsonld = require('jsonld');

const doc = {
  "http://schema.org/name": "Manu Sporny",
  "http://schema.org/url": {"@id": "http://manu.sporny.org/"},
  "http://schema.org/PrsnOwner": "0400985d4fca84fe0e8cff7e8902326a6703ba182cc8d6d8e20866b0acfc79ecb6bfd3d3b5d6ad7f48cd10fadc6d4348cab918f13db2ebb387ba16c57802bf47b1",

};


  jsonld.toRDF(doc, {format: 'application/n-quads'}, (err, nquads) => {
    // nquads is a string of N-Quads
    console.log(nquads);

  });
// const start = async function (a,b){
// const rdf = await jsonld.toRDF(doc, {format: 'application/n-quads'});
// console.log(rdf);
// };
// start(); 