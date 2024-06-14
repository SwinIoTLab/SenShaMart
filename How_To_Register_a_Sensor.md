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

## Sharing Sensor's data

To start sharing data, configure your sensing device to send its data to the MQTT broker at the broker IP returned by the API, and on the connection topic given by `in/${SENSOR_NAME}`.
`${SENSOR_NAME}` is the name of your sensor. For Example: the API will return the following `Connection address:
mqtt://136.186.108.94:5003` and  `Connection topic:in/TestSwin`

You can use the `dummy_sensor.js` provided in `Tools` folder to connect a sensor to SenShaMart using the information returned form the API. You need to do the following:

1. run the dummy sensor code by `node tools/dummy_sensor.js.
2. enter the connection address `mqtt://136.186.108.94:5003` and Connection topic:`in/TestSwin`
3. Now, your sensors is sharing data. You can test the data by integrating to it, which is explained in How_to_query_and_integrate.md file 

Also, Here is an example code (written in python) for sharing random temperature values via MQTT broker. To run this code, you need paho-MQTT library ``pip install paho-mqtt``. Also, you can use the dummy sensor provided tools section.

```
import paho.mqtt.client as mqtt
import time
import random

# MQTT settings
broker = "136.186.108.94"  # the connection address provided by the API
port = 5003 # It will be provided by the API along with the address.
topic = "in/TestSwin" # the topic provided by the API

# Create an MQTT client instance
client = mqtt.Client()

# Connect to the broker
client.connect(broker, port, 60)

def publish_temperature():
    while True:
        # Simulate reading a temperature value
        temperature = round(random.uniform(20.0, 30.0), 2)
        # Publish the temperature value to the MQTT topic
        result = client.publish(topic, temperature)
        # Result: [0, 2]
        status = result[0]
        if status == 0:
            print(f"Sent `{temperature}` to topic `{topic}`")
        else:
            print(f"Failed to send message to topic {topic}")
        # Wait before sending the next value
        time.sleep(5)

if __name__ == "__main__":
    try:
        publish_temperature()
    except KeyboardInterrupt:
        print("Exited by user")
        client.disconnect()
```
