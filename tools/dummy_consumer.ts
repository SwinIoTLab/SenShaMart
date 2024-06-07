import mqtt from "mqtt";

if (process.argv.length < 2) {
  console.error("Expected argv string with 'node <PATH TO FILE>'");
  process.exit(-1);
}
if (process.argv.length < 4) {
  console.error(`Expected 'node "${process.argv[1]}" <path to blockchain db> <MQTT endpoint> <MQTT topic>`);
  process.exit(-2);
}

const client = mqtt.connect(process.argv[2]);

setInterval(() => {
  if (client.connected) {
    client.publish(process.argv[3], JSON.stringify({ time: new Date().toTimeString() }));
  }
}, 1000);

client.on("connect", () => {
  client.subscribe(process.argv[4], (err) => {
    if (err) {
      throw err;
    }
  });
});

client.on("message", (_topic, message) => {
  console.log(`${new Date().toTimeString()}: ${message.toString()}`);
});