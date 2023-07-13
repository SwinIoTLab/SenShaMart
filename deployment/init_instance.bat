@echo off
plink -batch -i %1 ubuntu@%2 "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"