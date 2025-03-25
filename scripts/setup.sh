#!/bin/bash

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting World Social setup...${NC}"

# Check OS and install prerequisites accordingly
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux setup
    echo "Installing prerequisites for Linux..."
    
    # Install Terraform
    sudo apt-get update
    sudo apt-get install -y gnupg software-properties-common
    wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
    sudo apt-get update && sudo apt-get install terraform

    # Install Docker
    sudo apt-get install -y docker.io docker-compose
    sudo usermod -aG docker $USER

    # Install kubectl
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
    sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

    # Install doctl
    snap install doctl

    # Install AWS CLI
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip awscliv2.zip
    sudo ./aws/install

elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS setup
    echo "Installing prerequisites for macOS..."
    
    # Install Homebrew if not installed
    if ! command -v brew &> /dev/null; then
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi

    # Install prerequisites
    brew install terraform docker kubectl doctl awscli

elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    # Windows setup
    echo "Installing prerequisites for Windows..."
    
    # Check if Chocolatey is installed
    if ! command -v choco &> /dev/null; then
        echo "Installing Chocolatey..."
        powershell -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))"
    fi

    # Install prerequisites
    choco install -y terraform docker-desktop kubernetes-cli doctl awscli
fi

# Create credentials directory
mkdir -p ~/.world-social/credentials

# Prompt for credentials
echo -e "\n${GREEN}Please enter your credentials:${NC}"

# AWS credentials
echo -e "\n${GREEN}AWS Credentials:${NC}"
read -p "AWS Access Key ID: " AWS_ACCESS_KEY_ID
read -p "AWS Secret Access Key: " AWS_SECRET_ACCESS_KEY
read -p "AWS Region (default: us-east-1): " AWS_REGION
AWS_REGION=${AWS_REGION:-us-east-1}

# DigitalOcean credentials
echo -e "\n${GREEN}DigitalOcean Credentials:${NC}"
read -p "DigitalOcean API Token: " DO_TOKEN
read -p "DigitalOcean Region (default: nyc1): " DO_REGION
DO_REGION=${DO_REGION:-nyc1}

# Save credentials
cat > ~/.world-social/credentials/terraform.tfvars << EOF
aws_access_key = "$AWS_ACCESS_KEY_ID"
aws_secret_key = "$AWS_SECRET_ACCESS_KEY"
aws_region = "$AWS_REGION"
do_token = "$DO_TOKEN"
do_region = "$DO_REGION"
EOF

# Configure AWS CLI
aws configure set aws_access_key_id $AWS_ACCESS_KEY_ID
aws configure set aws_secret_access_key $AWS_SECRET_ACCESS_KEY
aws configure set region $AWS_REGION

# Configure doctl
doctl auth init -t $DO_TOKEN

echo -e "\n${GREEN}Setup completed successfully!${NC}"
echo "Credentials saved in ~/.world-social/credentials/terraform.tfvars"
echo "You can now run the deployment script: ./scripts/deploy.sh" 