@echo off

plink -batch -i %1 ubuntu@%3 "sudo systemctl stop senshamart_wallet"
pscp -r -i %1 %2/blockchain ubuntu@%3:wallet
pscp -r -i %1 %2/wallet ubuntu@%3:wallet
pscp -r -i %1 %2/util ubuntu@%3:wallet
pscp -r -i %1 %2/network ubuntu@%3:wallet
pscp -r -i %1 %2/ui ubuntu@%3:wallet
pscp -i %1 %2/package.json ubuntu@%3:wallet/package.json
plink -batch -i %1 ubuntu@%3 "cd wallet && npm install"
pscp -i %1 %2/deployment/senshamart_wallet.service ubuntu@%3:wallet/senshamart_wallet.service
plink -batch -i %1 ubuntu@%3 "sudo cp wallet/senshamart_wallet.service /etc/systemd/system/senshamart_wallet.service"
plink -batch -i %1 ubuntu@%3 "sudo systemctl daemon-reload"
plink -batch -i %1 ubuntu@%3 "sudo systemctl enable senshamart_wallet"