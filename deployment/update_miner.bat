@echo off

echo "STARTING %3"
plink -batch -i %1 ubuntu@%3 "sudo systemctl stop senshamart_miner"
pscp -r -i %1 %2/blockchain ubuntu@%3:miner
pscp -r -i %1 %2/miner ubuntu@%3:miner
pscp -r -i %1 %2/util ubuntu@%3:miner
pscp -r -i %1 %2/network ubuntu@%3:miner
pscp -i %1 %2/package.json ubuntu@%3:miner/package.json
plink -batch -i %1 ubuntu@%3 "cd miner && npm install"
pscp -i %1 %2/deployment/senshamart_miner.service ubuntu@%3:miner/senshamart_miner.service
plink -batch -i %1 ubuntu@%3 "sudo cp miner/senshamart_miner.service /etc/systemd/system/senshamart_miner.service"
plink -batch -i %1 ubuntu@%3 "sudo systemctl daemon-reload"
plink -batch -i %1 ubuntu@%3 "sudo systemctl enable senshamart_miner"