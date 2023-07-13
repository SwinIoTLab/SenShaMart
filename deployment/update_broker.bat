@echo off

plink -batch -i %1 ubuntu@%3 "sudo systemctl stop senshamart_broker"
pscp -r -i %1 %2/blockchain ubuntu@%3:broker
pscp -r -i %1 %2/broker ubuntu@%3:broker
pscp -r -i %1 %2/util ubuntu@%3:broker
pscp -r -i %1 %2/network ubuntu@%3:broker
pscp -i %1 %2/package.json ubuntu@%3:broker/package.json
plink -batch -i %1 ubuntu@%3 "cd broker && npm install"
pscp -i %1 %2/deployment/senshamart_broker.service ubuntu@%3:broker/senshamart_broker.service
plink -batch -i %1 ubuntu@%3 "sudo cp broker/senshamart_broker.service /etc/systemd/system/senshamart_broker.service"
plink -batch -i %1 ubuntu@%3 "sudo systemctl daemon-reload"
plink -batch -i %1 ubuntu@%3 "sudo systemctl enable senshamart_broker"