#Sensor registration

All IoT sensors involved with sharing data need to be registered by storing their semantic description (i.e., metadata) in SSM Blockchain. IoT sensor providers can register their IoT sensors by using the API directly or using the User Interface.


##Using the User Interface

The User Interface can be used by the users of SenShaMart to reigster IoT sensors easly. First, the user needs to create a key-pair to have a wallet in SenShaMart. 

##Using the API

The IoT sensor registration API, which is explained in API.md can be used to register IoT sensors. 
The IoT sensor provider needs to have at le

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



