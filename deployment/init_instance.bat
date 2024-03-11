@echo off
plink -batch -i %1 ubuntu@%2 "sudo apt-get update"
plink -batch -i %1 ubuntu@%2 "sudo apt-get install -y ca-certificates curl gnupg"
plink -batch -i %1 ubuntu@%2 "sudo mkdir -p /etc/apt/keyrings"
plink -batch -i %1 ubuntu@%2 "curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg"
plink -batch -i %1 ubuntu@%2 "echo ""deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main"" | sudo tee /etc/apt/sources.list.d/nodesource.list"
plink -batch -i %1 ubuntu@%2 "sudo apt-get update"
plink -batch -i %1 ubuntu@%2 "sudo apt-get install nodejs -y"