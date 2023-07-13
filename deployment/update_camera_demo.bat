@echo off

plink -batch -pw %2 garbo@%3 "sudo systemctl stop senshamart_demo"
pscp -r -pw %2 %1/demo/camera_client garbo@%3:Downloads/senshamart_demo
pscp -r -pw %2 %1/demo/sensor_client garbo@%3:Downloads/senshamart_demo
pscp -pw %2 %1/demo/CMakeLists.txt garbo@%3:Downloads/senshamart_demo/CMakeLists.txt
plink -batch -w %2 garbo@%3 "cd Downloads/senshamart_demo && cmake ."
plink -batch -w %2 garbo@%3 "cd Downloads/senshamart_demo && make"
pscp -pw %2 %1/deployment/senshamart_demo.service garbo@%3:Downloads/senshamart_demo/senshamart_demo.service
plink -batch -pw %2 garbo@%3 "sudo cp Downloads/senshamart_demo/senshamart_demo.service /etc/systemd/system/senshamart_demo.service"
plink -batch -pw %2 garbo@%3 "sudo systemctl daemon-reload"
plink -batch -pw %2 garbo@%3 "sudo systemctl enable senshamart_demo"
plink -batch -pw %2 garbo@%3 "sudo systemctl start senshamart_demo"