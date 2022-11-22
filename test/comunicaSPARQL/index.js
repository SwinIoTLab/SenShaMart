const newEngine = require('@comunica/actor-init-sparql').newEngine;
const N3 = require('n3');
const jsonld = require('jsonld')
const DataFactory = require('n3').DataFactory;
const parser = new N3.Parser({format: 'application/n-quads'});

const store = new N3.Store();
const myEngine = newEngine();

const doc = {
    "http://schema.org/name": "Manu Sporny",
    "http://schema.org/url": {"@id": "http://manu.sporny.org/"},
    "http://schema.org/image": {"@id": "http://manu.sporny.org/images/manu.png"}
  };

  jsonld.toRDF(doc, {format: 'application/n-quads'}, (err, nquads) => {
    // nquads is a string of N-Quads
   // console.log(nquads);
  var quad= [];
    parser.parse(
       nquads,
        (error, quadN, prefixes) => {
        // console.log(quadN)
        if (quadN)
        {
          store.addQuad(DataFactory.quad(
              DataFactory.namedNode(quadN.subject.id), DataFactory.namedNode(quadN.predicate.id), DataFactory.namedNode(quadN.object.id)));
          
        }
        else 
        console.log("finished");
       // console.log(quadN)
        });

        const start = async function (a,b){
          const result = await myEngine.query('SELECT * WHERE {?s ?p ?o } LIMIT 100',
                    { sources: [{ type: 'rdfjsSource', value: store}] })
                    result.bindingsStream.on('data', (data) => console.log(data.toObject()));
                    };
                    start()
        console.log(quad)
        // store.addQuad(DataFactory.quad(
        //   DataFactory.namedNode(quad.subject.id), DataFactory.namedNode(quad.predicate.id), DataFactory.namedNode(quad.object.id)));
          
        
        //    store.addQuad(DataFactory.quad(
        //         DataFactory.namedNode('http://schema.org/image'), DataFactory.namedNode('http://manu.sporny.org/images/manu.png'), DataFactory.namedNode('http://schema.org/name')));
        //    store.addQuad(DataFactory.quad(
        //         DataFactory.namedNode('http://schema.org/url'), DataFactory.namedNode('http://manu.sporny.org/'), DataFactory.namedNode('http://dbpedia.org/resource/Ghent')));
            //console.log(store)
            // const start = async function (a,b){
            //     const result = await myEngine.query('SELECT * WHERE {?s ?p <http://manu.sporny.org/images/manu.png>. ?s ?p ?o } LIMIT 100',
            //       { sources: [{ type: 'rdfjsSource', value: store}] })
            //     result.bindingsStream.on('data', (data) => console.log(data.toObject()));
            //     };
            //     start()
        });
      
 
// store.addQuad(DataFactory.quad(
//     DataFactory.namedNode('http://schema.org/image'), DataFactory.namedNode('http://manu.sporny.org/images/manu.png'), DataFactory.namedNode('http://schema.org/name')));
//   store.addQuad(DataFactory.quad(
//     DataFactory.namedNode('http://schema.org/url'), DataFactory.namedNode('http://manu.sporny.org/'), DataFactory.namedNode('http://dbpedia.org/resource/Ghent')));
  
//    // console.log(store)


 
