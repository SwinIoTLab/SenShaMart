#How To Register a Sensor

All IoT sensors involved with sharing data need to be registered by storing their semantic description (i.e., metadata) in SSM Blockchain. IoT sensor providers can register their IoT sensors by using the API directly or using the User Interface.


##Using the User Interface

The User Interface can be used by the users of SenShaMart to reigster IoT sensors easly. First, the user needs to create a key-pair to have a wallet in SenShaMart. Then, the user needs to chose IoT sensor provider section to access to sensor registration service. After that, the use (IoT device provider) needs to provide some information about the sensor including Name,Cost, Location, measurment, and interval. 

If the user wish to provide more details about the sensor, then it is better to chose the developer section at the beggining. This section allows the user to provide a file of tribles that contains the semantic description of IoT sensor. Also, it allows the user to chose the endpoint (Broker) that will share the sensors data with potential data consumers (IoT applications).

##Using the API

The IoT sensor registration API, which is provided in API.md can be used to register IoT sensors. 
The IoT sensor provider needs to provide information about the sensor that is required by the API below.

```
'/SensorRegistration/Register'
{
  keyPair: string;
  sensorName: string;
  costPerMinute: number;
  costPerKB: number;
  integrationBroker: string | null;
  interval: number | null;
  rewardAmount: number;
  extraNodeMetadata?: {
    s: string;
    p: string;
    o: string;
  }[];
  extraLiteralMetadata?: {
    s: string;
    p: string;
    o: string;
  }[];
}
=>
ResultFailure | {
  result: true;
  tx: SensorRegistration;
  brokerIp: string;
}
```



