@echo off

pscp -r -pw %1 %2/blockchain rfid-tunnel@%3:senshamart_demo
pscp -r -pw %1 %2/wallet rfid-tunnel@%3:senshamart_demo
pscp -r -pw %1 %2/util rfid-tunnel@%3:senshamart_demo
pscp -r -pw %1 %2/network rfid-tunnel@%3:senshamart_demo
pscp -r -pw %1 %2/ui rfid-tunnel@%3:senshamart_demo
pscp -pw %1 %2/package.json rfid-tunnel@%3:senshamart_demo/package.json
plink -batch -pw %1 rfid-tunnel@%3 "cd senshamart_demo && npm install"