@echo off
echo Building angela MCP Server for all platforms...

REM Set the output directory
set OUTPUT_DIR=../electron/mcp

REM Create output directory if it doesn't exist
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

REM Build for Windows (64-bit)
echo Building for Windows (amd64)...
set GOOS=windows
set GOARCH=amd64
go build -o "%OUTPUT_DIR%/python-mcp-servers.exe" python-mcp-server.go
if %errorlevel% neq 0 (
    echo Failed to build for Windows
    exit /b 1
)

REM Build for Linux (64-bit)
echo Building for Linux (amd64)...
set GOOS=linux
set GOARCH=amd64
go build -o "%OUTPUT_DIR%/python-mcp-servers" python-mcp-server.go
if %errorlevel% neq 0 (
    echo Failed to build for Linux
    exit /b 1
)

REM Build for macOS (64-bit Intel)
echo Building for macOS (amd64)...
set GOOS=darwin
set GOARCH=amd64
go build -o "%OUTPUT_DIR%/python-mcp-servers-mac" python-mcp-server.go
if %errorlevel% neq 0 (
    echo Failed to build for macOS
    exit /b 1
)

REM Build for macOS (ARM64 - Apple Silicon)
echo Building for macOS (arm64)...
set GOOS=darwin
set GOARCH=arm64
go build -o "%OUTPUT_DIR%/python-mcp-servers-mac-arm64" python-mcp-server.go
if %errorlevel% neq 0 (
    echo Failed to build for macOS ARM64
    exit /b 1
)

echo.
echo ✅ Build completed successfully!
echo.
echo Generated files:
echo   - %OUTPUT_DIR%/python-mcp-servers.exe (Windows)
echo   - %OUTPUT_DIR%/python-mcp-servers (Linux)
echo   - %OUTPUT_DIR%/python-mcp-servers-mac (macOS Intel)
echo   - %OUTPUT_DIR%/python-mcp-servers-mac-arm64 (macOS Apple Silicon)
echo.
echo Files are ready for Electron packaging.

pause 
