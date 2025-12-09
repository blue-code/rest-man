#!/bin/bash

# RestMan macOS Build Script

set -e

echo "🚀 Starting RestMan build for macOS..."

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust is not installed. Please install Rust from https://rustup.rs/"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd webui
npm install

# Build frontend
echo "🔨 Building frontend..."
npm run build

# Build Tauri app
echo "🔨 Building Tauri application..."
cd ..
cargo tauri build

echo "✅ Build completed!"
echo "📦 Build artifacts can be found in: src-tauri/target/release/bundle/"
echo ""
echo "   DMG: src-tauri/target/release/bundle/dmg/"
echo "   APP: src-tauri/target/release/bundle/macos/"
