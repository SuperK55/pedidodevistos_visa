#!/bin/bash

# Deployment script for VPS
# This script sets up and runs the visa booking automation on a VPS

set -e

echo "=========================================="
echo "Visa Booking Automation - VPS Deployment"
echo "=========================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    echo "✅ Docker installed successfully"
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Installing..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose installed successfully"
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your credentials before continuing!"
    exit 1
fi

# Check if configuration files exist
if [ ! -f config/accounts.json ]; then
    echo "⚠️  config/accounts.json not found. Creating from example..."
    cp config/accounts.example.json config/accounts.json
    echo "⚠️  Please edit config/accounts.json with your accounts!"
    exit 1
fi

if [ ! -f config/proxies.txt ]; then
    echo "⚠️  config/proxies.txt not found. Creating from example..."
    cp config/proxies.example.txt config/proxies.txt
    echo "⚠️  Please edit config/proxies.txt with your proxies!"
    exit 1
fi

# Create necessary directories
mkdir -p logs screenshots

# Stop existing container if running
echo "Stopping existing container..."
docker-compose down || true

# Build and start container
echo "Building Docker image..."
docker-compose build

echo "Starting container..."
docker-compose up -d

echo ""
echo "=========================================="
echo "✅ Deployment complete!"
echo "=========================================="
echo ""
echo "View logs:"
echo "  docker-compose logs -f"
echo ""
echo "Stop automation:"
echo "  docker-compose down"
echo ""
echo "Restart automation:"
echo "  docker-compose restart"
echo ""
echo "View container status:"
echo "  docker-compose ps"
echo ""
echo "=========================================="

