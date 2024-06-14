# How to query for and integrate with a sensor

The SenShaMart (SSM) Blockchain can contain many sensor registrations, and so an efficient querying method is needed to find sensor registrations of interest.
This efficient querying is provided by SPARQL queries using an Apache Jena Fuseki instance.
If the app you are using is not configured with a Fuseki instance, you will not be able to query.
This allows apps that requires SPARQL querying to be configured with that capability, and apps such as miners that don't need it, to not waste resources maintaining it.

## SPARQL queries

SPARQL query documentation can be found here [here](https://www.w3.org/TR/2013/REC-sparql11-overview-20130321/)

### Stale registrations

RDF triples are never removed from the Fuseki instance when a block is added.
Sensor and broker registrations can also overwrite previous registrations, meaning that special care must be taken to only return current registrations if looking to integrate.
This can be achieved through a `FILTER NOT EXISTS { ?x <ssm://Supercedes> ?tx }` where `?tx` is the registration transaction you are looking at.

### Namespacing

As users can specify their own RDF triple metadata during sensor and broker registration, there may be misleading RDF triples in the Fuseki instance.
The system takes care to ensure that any URI that begins with the scheme `ssm://` is controlled by the system.
The system does this to stop users from 'spoofing' metadata for our sensors.
A sensor or broker registration's RDF metadata can begin with the scheme `SSMS://` which will be replaced with the URI to the transaction.

e.g. `SSMS://#CameraSensorVideo` can become `ssm://SensorRegistration/1T8P5caKCrtzp5lj8dxIsE0UOt1cwd9MWzF1VbrVRVA=#CameraSensorVideo`.
The `ssm://SensorRegistration/1T8P5caKCrtzp5lj8dxIsE0UOt1cwd9MWzF1VbrVRVA=` prefix is unique to that transaction and no user supplied metadata from another transaction can have it.

### System generated triples

The system generates triples to allow the blockchain to be searched via SPARQL.
You can see the triples generates in `blockchain/blockchain.ts` and see the URIs used in `blockchain/uris.ts`.
The basic shape is that there is a chain of blocks which are linked by `ssm://LastBlock`.
Transactions branch off the blockchain through `ssm://ContainsTransaction`.
These transactions have types given by `http://www.w3.org/1999/02/22-rdf-syntax-ns#type`
These transactions also have their own transaction specific triples, such as which broker a sensor registration is using, or the endpoint of a broker registration.

### An example query used in the UI

```
SELECT ?sensor_name ?sensor_hash ?broker_name ?broker_hash ?broker_endpoint ?lat ?long ?measures ?sensor_cpm ?sensor_cpkb WHERE {
       ?sensor_tx <ssm://Defines> ?sensor_name.
       ?sensor_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://SensorRegistration".
       ?sensor_tx <ssm://HasHash> ?sensor_hash.
       ?sensor_tx <ssm://UsesBroker> ?broker_name.
       ?sensor_tx <ssm://CostsPerMinute> ?sensor_cpm.
       ?sensor_tx <ssm://CostsPerKB> ?sensor_cpkb.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?sensor_tx }.
       
       ?broker_tx <ssm://Defines> ?broker_name.
       ?broker_tx <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "ssm://BrokerRegistration".
       ?broker_tx <ssm://HasHash> ?broker_hash.
       ?broker_tx <ssm://HasEndpoint> ?broker_endpoint.
       FILTER NOT EXISTS { ?x <ssm://Supercedes> ?broker_tx }.
       
       ?sensor_tx <http://www.w3.org/ns/sosa/observes> ?observes.
       ?sensor_tx <http://www.w3.org/ns/sosa/hasFeatureOfInterest> ?location.
       ?observes <http://www.w3.org/2000/01/rdf-schema#label> ?measures.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat.
       ?location <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?long.
       ?observes <http://www.w3.org/2000/01/rdf-schema#label> "video".}
```

This query gets a
- sensor name
- sensor hash
- broker name
- broker hash
- broker endpoint
- latitude
- longitude
- measures
- sensor cost per minute
- sensor cost per kilobyte
It does this by finding:
- the name of the sensor defined by `?sensor_tx` as `?sensor_name`
- that `?sensor_tx` is a sensor registration
- the hash of `?sensor_tx` as `sensor_hash`
- the name of the broker used by the `?sensor_tx` as `?broker_name`
- the cost per minute of the `?sensor_tx` as `sensor_cpm`
- the cost per kilobyte of the `?sensor_tx` as `sensor_cpkb`
- that the `?sensor_tx` has not been superceded

- the broker transaction that defined `?broker_name` as `?broker_tx`
- that `?broker_tx` is in fact a broker registration
- the hash of `?broker_tx` as `?broker_hash`
- the endpoint used by the `?broker_tx` as `broker_endpoint`
- That the `?broker_tx` has not been superceded

- what the `?sensor_tx` observes as `?observes`
- the location of the `?sensor_tx` as `?location`
- what is being measured by `?observes`  as `?measures`
- the latitude of `?location` as `?lat`
- the longitude of `?location` as `?long`
- what is being measured by `?observes` is `"video"`

## Querying with the UI

The UI provides a selection of default queries, and also allows the user to write their own query into the text area below the query selector.
The text area is also resizable, to allow for easier editing.
Once the query is decided upon, the query can be ran with 'Go!'.

This will then create a table of results.
If these results are viable to be integrated against, the `Add Sensor Results To Selected Sensors` will enable.
This button allows the user to add all results from the query to the selected sensors control.
If all sensors are not wanted, individual sensors can be added via the `Add Sensor` button for each row can be used.

A query requires certain headers to be viable to be integrated against.
These are:
- sensor_name
  This is the name of the sensor
- sensor_hash
  This is the hash of the current sensor transaction
- broker_hash
  This is the hash of the current broker transaction
- broker_endpoint
  This is the current endpoint of the broker
If these are not present you cannot add these query results to the selected sensors control as they are required to create the integration transaction.

There are also optional headers:
- broker_name
  The name of the broker
- sensor_cpm
  The cost per minute of the sensor
- sensor_cpkb
  The cost per kilobyte of the sensor
If these headers are present their values will be used in the UI to display more information.

## Integrating with the UI

Once a sensor has been added to the selected sensors control, the user can click it, and set how many coins they wish to spend on it.
They can also choose to deselect it if they made a mistake or no longer want that sensor.

The pay and integrate button will send the input information to the wallet, which will create, sign, and propagate your integration transaction.
After this has happened, connection information will appear below for every sensor integrated against.  
It will show which sensor the information row belongs to, the IP of the MQTT broker servicing it, and the MQTT topic on which to connect to. For Example: `Broker IP:
mqtt://136.186.108.94:5003` and  `MQTT topic:out/BMnQDb6nveqKDBRW3Lb76NuwFF3DMs9dmOCzxa1pwUw=/0`

Due to the asynchronous nature of the blockchain, some time may be needed before the brokers servicing the sensors validate and accept this integration, and start forwarding the data to the user.

You can use the `dummy_consumer.js` provided in `Tools` folder to integrate with the selected sensor using the information returned form the API. You need to do the following:

1. Run the dummy consumer code by `node tools/dummy_consume.js.
2. Enter the Broker IP `mqtt://136.186.108.94:5003` and MQTT topic:`out/BMnQDb6nveqKDBRW3Lb76NuwFF3DMs9dmOCzxa1pwUw=/0`
3. Now, you start reciving data

## Querying via API

The API to query is `/sparql` and is described in the [APIs](./APIs.md) document.

The headers will be an array of header names, and the values are an array of rows, each row an array of values of the corresponding header.

## Integrating via API

The API to integrate is `/Integration/Register` and is described in the [APIs](./APIs.md) document.

The broker IPs must be obtained some other way.
This is most easily done at the same time you find the sensors you are wishing to integrate against.
It can also be done after the fact by querying for the brokerEndpoint belonging to the broker registration transaction with hash brokerHash.

The topic is given by `out/${hash}/${index}`. 
`${hash}` is the hash of the integration transaction. 
`${index}` is the index of the output in the integration transaction.
