@echo off
:: ComfyUI Docker Build Script for angela (Windows)
setlocal enabledelayedexpansion

echo 🎨 Building angela ComfyUI Docker Image...

:: Change to project root (parent directory of scripts)
cd /d "%~dp0.."

:: Detect architecture
set "ARCH=%PROCESSOR_ARCHITECTURE%"
if "%ARCH%"=="AMD64" (
    set "DOCKER_ARCH=amd64"
) else if "%ARCH%"=="ARM64" (
    set "DOCKER_ARCH=arm64"
) else (
    echo ⚠️  Unsupported architecture: %ARCH%
    exit /b 1
)

echo 🔧 Detected architecture: %ARCH% (Docker: %DOCKER_ARCH%)

:: Set image name with architecture tag
set "IMAGE_NAME=angela17verse/angela-comfyui"
set "TAG=latest-%DOCKER_ARCH%"
set "FULL_IMAGE_NAME=%IMAGE_NAME%:%TAG%"

echo 🏗️  Building Docker image: %FULL_IMAGE_NAME%

:: Build the Docker image
docker build --platform linux/%DOCKER_ARCH% --file docker/Dockerfile.comfyui --tag "%FULL_IMAGE_NAME%" --tag "%IMAGE_NAME%:latest" .

if %ERRORLEVEL% equ 0 (
    echo ✅ ComfyUI Docker image built successfully!
    echo 📦 Image: %FULL_IMAGE_NAME%
    
    :: Show image size
    echo 📏 Image size:
    docker images "%IMAGE_NAME%"
    
    echo.
    echo 🚀 You can now start angela and use the bundled ComfyUI!
    echo    • ComfyUI will be available at http://localhost:8188
    echo    • Access ComfyUI Manager through the Image Generation page
    echo    • First startup may take a few minutes to download models
) else (
    echo ❌ Failed to build ComfyUI Docker image
    exit /b 1
)

:: Optional: Test the image
set /p "test_image=🧪 Do you want to test the image now? (y/N): "
if /i "%test_image%"=="y" (
    echo 🧪 Testing ComfyUI container...
    
    :: Stop any existing container
    docker stop angela_comfyui_test >nul 2>&1
    docker rm angela_comfyui_test >nul 2>&1
    
    :: Run test container
    echo 🔄 Starting test container...
    docker run -d --name angela_comfyui_test --platform linux/%DOCKER_ARCH% -p 8188:8188 --gpus all "%FULL_IMAGE_NAME%"
    
    echo ⏳ Waiting for ComfyUI to start (30 seconds)...
    timeout /t 30 /nobreak >nul
    
    :: Test if ComfyUI is responding
    curl -s -f http://localhost:8188/ >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        echo ✅ ComfyUI is running successfully!
        echo 🌐 Access it at: http://localhost:8188
        echo.
        echo 🛑 To stop the test container:
        echo    docker stop angela_comfyui_test && docker rm angela_comfyui_test
    ) else (
        echo ❌ ComfyUI test failed - container may still be starting
        echo 📋 Check logs with: docker logs angela_comfyui_test
    )
)

pause 
