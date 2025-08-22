@echo off
REM Save this as python-mcp-server.bat in C:/Users/Admin/angelaVerse/angela-mcp/

echo Python MCP Server Test Script
echo This will help verify your setup

REM Check if Go is installed
where go >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Go is not installed or not in PATH
    echo Please install Go from https://go.dev/dl/
    exit /b 1
)

REM Check if the .go file exists
if not exist "%~dp0python-mcp-server.go" (
    echo Error: python-mcp-server.go not found in %~dp0
    echo Please create the Go source file first
    exit /b 1
)

REM Build the executable
echo Building python-mcp-server.exe...
cd /d "%~dp0"
go build -o python-mcp-server.exe python-mcp-server.go

if %errorlevel% neq 0 (
    echo Error: Failed to build the executable
    exit /b 1
)

echo Build successful! python-mcp-server.exe created
echo.
echo You can now use this in your MCP configuration:
echo   "command": "%~dp0python-mcp-server.exe"
