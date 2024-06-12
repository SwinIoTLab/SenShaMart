# How To Register and Share a Sensor

All IoT sensors involved with sharing data need to be registered into the SenShaMart (SSM) blockchain.
Their semantic description (i.e., user defined metadata), as well as metadata needed by the system needs to be included in this registration.
IoT sensor providers can register their IoT sensors by using the API directly or using the User Interface.


## Using the User Interface

The User Interface can be used by the users of SenShaMart to register IoT sensors easily by following these steps:

1. The user needs to create a key-pair to have a wallet in SenShaMart.
   This can be created on the landing page of the public wallet UI, or by using the `/gen-key` API.
2. The user needs to choose IoT sensor provider section to access the sensor registration service.
3. The user (IoT device provider) needs to provide some information about the sensor including:
    - Name
    - Cost
    - Location
    - Measurment
    - Interval
   If the user wishes to provide more details about the sensor, then it is better to use the developer option on the landing page. 
   The developer option allows the user to provide a file of RDF triples that contains the semantic description of IoT sensor.
   It also allows the user to chose the endpoint (Broker) that will share the sensors data with potential data consumers (IoT applications).
4. Hit Create!
5. If all is successful, the UI will tell you the connection address and connection topic. **Note these down**.
6. To start sharing data, configure your sensing device to send its data to the MQTT broker at the connection address, and on the connection topic.

## Using the API

The IoT sensor registration API, which is provided in [API.md](./APIs.md) can be used to register IoT sensors. 
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

If the integrationBroker is null, a random broker is selected for you. If interval is null, the sensor is assumed to not be periodic.

To start sharing data, configure your sensing device to send its data to the MQTT broker at the broker IP returned by the API, and on the connection topic given by `in/${SENSOR_NAME}`.

`${SENSOR_NAME}` is the name of your sensor.

