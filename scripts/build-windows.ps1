# RestMan Windows Build Script

Write-Host "🚀 Starting RestMan build for Windows..." -ForegroundColor Green

# Check if Rust is installed
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Rust is not installed. Please install Rust from https://rustup.rs/" -ForegroundColor Red
    exit 1
}

# Check if Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is not installed. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Install frontend dependencies
Write-Host "📦 Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location webui
npm install

# Build frontend
Write-Host "🔨 Building frontend..." -ForegroundColor Yellow
npm run build

# Build Tauri app
Write-Host "🔨 Building Tauri application..." -ForegroundColor Yellow
Set-Location ..
cargo tauri build

Write-Host "✅ Build completed!" -ForegroundColor Green
Write-Host "📦 Build artifacts can be found in: src-tauri\target\release\bundle\" -ForegroundColor Cyan
Write-Host ""
Write-Host "   MSI: src-tauri\target\release\bundle\msi\" -ForegroundColor Cyan
Write-Host "   EXE: src-tauri\target\release\" -ForegroundColor Cyan
