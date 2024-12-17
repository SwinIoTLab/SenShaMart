import mqtt from "mqtt";

if (process.argv.length < 2) {
  console.error("Expected argv string with 'node <PATH TO FILE>'");
  process.exit(-1);
}
if (process.argv.length < 4) {
  console.error(`Expected 'node "${process.argv[1]}" <MQTT endpoint> <MQTT topic>`);
  process.exit(-2);
}

const client = mqtt.connect(process.argv[2]);

client.on("connect", () => {
  console.log("connected");
  client.subscribe(process.argv[3], (err) => {
    if (err) {
      throw err;
    }
  });
});

client.on("disconnect", () => {
  console.log("Disconncted");
  client.connect();
});

client.on("message", (topic, message) => {
  console.log(`${new Date().toTimeString()} - ${topic}: ${message.toString()}`);
});