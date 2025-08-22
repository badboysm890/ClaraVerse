@echo off
echo 🎨 Building and Pushing ComfyUI Docker Container for angela...

REM Change to the docker directory
cd /d "%~dp0"

REM Get current date for versioning
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "DATE_TAG=%dt:~0,8%"
set "LATEST_TAG=latest"

REM Docker Hub repository name
set "REPO_NAME=angela17verse/angela-comfyui"

echo 🔨 Building ComfyUI container with custom nodes...
echo    - Acly's ComfyUI Tooling Nodes
echo    - Jags111's Efficiency Nodes
echo.

REM Build the container with multiple tags
docker build -f Dockerfile.comfyui -t %REPO_NAME%:%LATEST_TAG% -t %REPO_NAME%:%DATE_TAG% -t %REPO_NAME%:with-custom-nodes .

if %errorlevel% neq 0 (
    echo ❌ Build failed!
    exit /b 1
)

echo ✅ ComfyUI container built successfully!
echo.

REM Check if user is logged into Docker Hub
echo 🔐 Checking Docker Hub authentication...
docker info | findstr "Username:" >nul
if %errorlevel% neq 0 (
    echo ⚠️  You need to log in to Docker Hub first:
    echo    docker login
    echo.
    set /p choice="Would you like to log in now? (y/n): "
    if /i "%choice%"=="y" (
        docker login
        if %errorlevel% neq 0 (
            echo ❌ Docker login failed!
            exit /b 1
        )
    ) else (
        echo ❌ Cannot push without Docker Hub authentication
        exit /b 1
    )
)

echo 🚀 Pushing to Docker Hub...
echo    Repository: %REPO_NAME%
echo    Tags: %LATEST_TAG%, %DATE_TAG%, with-custom-nodes
echo.

REM Push all tags
echo 📤 Pushing latest tag...
docker push %REPO_NAME%:%LATEST_TAG%

echo 📤 Pushing date tag...
docker push %REPO_NAME%:%DATE_TAG%

echo 📤 Pushing custom nodes tag...
docker push %REPO_NAME%:with-custom-nodes

if %errorlevel% equ 0 (
    echo.
    echo 🎉 Successfully pushed ComfyUI container to Docker Hub!
    echo.
    echo 📋 Available tags:
    echo    - %REPO_NAME%:latest
    echo    - %REPO_NAME%:%DATE_TAG%
    echo    - %REPO_NAME%:with-custom-nodes
    echo.
    echo 🔗 Docker Hub: https://hub.docker.com/r/angela17verse/angela-comfyui
    echo.
    echo 🚀 Users can now pull with:
    echo    docker pull %REPO_NAME%:latest
    echo.
    echo 📦 Included Custom Nodes:
    echo    ✅ ComfyUI Manager (ltdrdata/ComfyUI-Manager)
    echo    ✅ ControlNet Auxiliary (Fannovel16/comfyui_controlnet_aux)
    echo    ✅ ComfyUI Essentials (cubiq/ComfyUI_essentials)
    echo    ✅ Custom Scripts (pythongosssss/ComfyUI-Custom-Scripts)
    echo    ✅ Acly's Tooling Nodes (Acly/comfyui-tooling-nodes)
    echo    ✅ Jags111's Efficiency Nodes (jags111/efficiency-nodes-comfyui)
) else (
    echo ❌ Push failed!
    exit /b 1
) 
