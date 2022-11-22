const N3 = require('n3');
const newEngine = require('@comunica/actor-init-sparql-rdfjs').newEngine;
const jsonld = require('jsonld');
const N3Store = require('n3').Store;
const DataFactory = require('n3').DataFactory;



const myEngine = newEngine();
const parser = new N3.Parser();
const store = new N3Store();

const doc = {
    "http://schema.org/name": "Manu Sporny",
    "http://schema.org/url": {"@id": "http://manu.sporny.org/"},
    "http://schema.org/image": {"@id": "http://manu.sporny.org/images/manu.png"}
  };


  jsonld.toRDF(doc, {format: 'application/n-quads'}, (err, nquads) => {
    // nquads is a string of N-Quads
    //console.log(nquads);


    parser.parse(
        nquads,
        (error, quad, prefixes) => {
        if (quad)
            //console.log(quad);
            store.addQuad(quad);
        else
            console.log(store);

        const start = async function (a,b){
            const result = await myEngine.query('SELECT * { ?s ?p <http://manu.sporny.org/>. ?s ?p ?o} LIMIT 100',
              { sources: [ {  value: store } ] });
           //result.bindingsStream.on('data', (data) => {
              // Each data object contains a mapping from variables to RDFJS terms.
              console.log(result);
             // console.log(data.get('?p'));
             // console.log(data.get('?o'));
           // });
            };
            
            start();
        });
      

    });