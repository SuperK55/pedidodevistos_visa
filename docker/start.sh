set -e

echo "Starting Visa Booking Automation..."

if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and configure it."
    exit 1
fi

if [ ! -f config/accounts.json ]; then
    echo "❌ Error: config/accounts.json not found!"
    echo "Please copy config/accounts.example.json to config/accounts.json and configure it."
    exit 1
fi

docker-compose up -d

echo "✅ Container started!"
echo ""
echo "View logs: docker-compose logs -f"
echo "Stop: docker-compose down"

