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
  console.log("Connected");
});

client.on("disconnect", () => {
  console.log("Disconnected");
  client.connect();
});

setInterval(() => {
  const sending = JSON.stringify({ time: new Date().toTimeString() });
  if (client.connected) {
    client.publish(process.argv[3], sending);
    console.log(`published: ${sending}`);
  } else {
    console.log(`Couldn't publish, not connected: ${sending}`);
  }
}, 1000);