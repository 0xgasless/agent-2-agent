#!/bin/bash
set -e

echo "🚀 Setting up Agent Frontend Demo..."
echo ""

# Check if agent-sdk is built
if [ ! -d "../agent-sdk/dist" ]; then
  echo "📦 Building agent-sdk..."
  cd ../agent-sdk
  npm run build
  cd ../agent-frontend-demo
fi

# Install dependencies
echo "📦 Installing frontend dependencies..."
npm install

# Check for .env file
if [ ! -f ".env" ]; then
  echo ""
  echo "⚠️  .env file not found!"
  echo "📝 Creating .env from .env.example..."
  cp .env.example .env
  echo ""
  echo "⚠️  IMPORTANT: Edit .env and add your private keys:"
  echo "   VITE_AGENT_A_PRIVATE_KEY=your_agent_a_private_key"
  echo "   VITE_AGENT_B_PRIVATE_KEY=your_agent_b_private_key"
  echo ""
  echo "Press Enter after adding your keys..."
  read
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the demo:"
echo "  npm run dev"
echo ""

