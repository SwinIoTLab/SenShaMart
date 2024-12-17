if (process.argv.length < 2) {
  console.error("Expected argv string with 'node <PATH TO FILE>'");
  process.exit(-1);
}
if (process.argv.length < 3) {
  console.error(`Expected 'node "${process.argv[1]}" <location of fuseki instance>`);
  process.exit(-2);
}
const datasets = await (await fetch(`${process.argv[2]}/$/datasets`)).json();
for (const dataset of datasets.datasets) {
  let status = await fetch(`${process.argv[2]}${dataset["ds.name"]}/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    body: 'update=' + encodeURIComponent("CLEAR ALL")
  });
  if (status.status !== 200) {
    console.error(`Couldn't clear dataset '${dataset["ds.name"]}': ${await status.text()}`);
    process.exit(-1);
  }
  status = await fetch(`${process.argv[2]}/$/datasets${dataset["ds.name"]}`, {
    method: 'DELETE'
  });
  if (status.status !== 200) {
    console.error(`Couldn't drop dataset '${dataset["ds.name"]}': ${await status.text()}`);
    process.exit(-1);
  }
}