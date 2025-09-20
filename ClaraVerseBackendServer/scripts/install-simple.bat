@echo off
cls
echo.
echo    ██████╗██╗      █████╗ ██████╗  █████╗ ██╗   ██╗███████╗██████╗ ███████╗███████╗
echo   ██╔════╝██║     ██╔══██╗██╔══██╗██╔══██╗██║   ██║██╔════╝██╔══██╗██╔════╝██╔════╝
echo   ██║     ██║     ███████║██████╔╝███████║██║   ██║█████╗  ██████╔╝███████╗█████╗  
echo   ██║     ██║     ██╔══██║██╔══██╗██╔══██║╚██╗ ██╔╝██╔══╝  ██╔══██╗╚════██║██╔══╝  
echo   ╚██████╗███████╗██║  ██║██║  ██║██║  ██║ ╚████╔╝ ███████╗██║  ██║███████║███████╗
echo    ╚═════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝
echo.
echo                      🚀 REMOTE SERVER DEPLOYMENT 🚀
echo                         The AI-Powered Creative Suite
echo.
echo    ╔══════════════════════════════════════════════════════════════════╗
echo    ║  🎨 ComfyUI     - AI Image Generation Powerhouse                ║
echo    ║  🐍 Python Backend - Advanced AI Processing APIs                ║
echo    ║  🔧 n8n Workflows - Automation Made Simple                      ║
echo    ║  🌐 Nginx Proxy  - Professional Reverse Proxy                   ║
echo    ╚══════════════════════════════════════════════════════════════════╝
echo.
echo        ⚡ Auto-GPU Detection  🔒 Secure Deployment  📈 Production Ready
echo.
echo ═══════════════════════════════════════════════════════════════════════════════
echo                          🔍 SYSTEM VERIFICATION                          
echo ═══════════════════════════════════════════════════════════════════════════════
echo.

REM Step 1: Check Docker Desktop
echo [1/8] 🔍 Checking Docker Desktop installation...
docker --version >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo ❌ ERROR: Docker Desktop is not installed or not in PATH
    echo.
    echo Please install Docker Desktop for Windows:
    echo    1. Download from: https://docs.docker.com/desktop/windows/install/
    echo    2. Install Docker Desktop
    echo    3. Start Docker Desktop and wait for it to be ready
    echo    4. Run this script again
    echo.
    pause
    exit /b 1
)

for /f "tokens=3" %%v in ('docker --version') do set "DOCKER_VERSION=%%v"
echo ✅ Docker Desktop %DOCKER_VERSION% detected

REM Step 2: Check Docker daemon
echo [2/8] 🔍 Verifying Docker daemon status...
docker info >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ Docker daemon not responding
    echo 💡 Please start Docker Desktop and wait for it to be ready
    echo.
    pause
    exit /b 1
)
echo ✅ Docker daemon is running

REM Step 3: GPU Detection
echo [3/8] 🎮 Scanning for NVIDIA GPU...
nvidia-smi >nul 2>&1
if %errorLevel% equ 0 (
    for /f "skip=8 tokens=2" %%g in ('nvidia-smi --query-gpu=name --format=csv,noheader 2^>nul') do (
        echo ✅ GPU Detected: %%g
        set "GPU_AVAILABLE=true"
        goto gpu_check_done
    )
) else (
    echo ⚠️  No NVIDIA GPU detected - CPU mode will be used
    set "GPU_AVAILABLE=false"
)

:gpu_check_done

REM Step 4: Test GPU Docker support
echo [4/8] 🧪 Testing Docker GPU integration...
if "%GPU_AVAILABLE%"=="true" (
    docker run --rm --gpus all --pull=always nvidia/cuda:12.0-base-ubuntu20.04 nvidia-smi >nul 2>&1
    if %errorLevel% equ 0 (
        echo ✅ GPU Docker acceleration ready
        set "GPU_DOCKER=true"
    ) else (
        echo ⚠️  GPU available but Docker GPU support not working
        echo 💡 Continuing with CPU mode
        set "GPU_DOCKER=false"
        set "GPU_AVAILABLE=false"
    )
) else (
    echo 🖥️  Configuring for CPU-only deployment
    set "GPU_DOCKER=false"
)

echo.
echo ═══════════════════════════════════════════════════════════════════════════════
echo                        🛠️  DEPLOYMENT CONFIGURATION                     
echo ═══════════════════════════════════════════════════════════════════════════════
echo.

REM Step 5: Create directories
echo [5/8] 📁 Setting up data directories...
if not exist "data" mkdir data
if not exist "data\comfyui" mkdir data\comfyui
if not exist "data\python" mkdir data\python  
if not exist "data\n8n" mkdir data\n8n
if not exist "logs" mkdir logs
echo ✅ Directory structure created

REM Step 6: Configure for GPU/CPU
echo [6/8] ⚙️  Generating optimized configuration...
if "%GPU_AVAILABLE%"=="false" (
    echo 🖥️  Creating CPU-optimized configuration...
    
    REM Create CPU-only version
    powershell -Command "(Get-Content 'docker-compose.yml') | Where-Object { $_ -notmatch 'runtime: nvidia' -and $_ -notmatch 'NVIDIA_VISIBLE_DEVICES' -and $_ -notmatch 'CUDA_VISIBLE_DEVICES' -and $_ -notmatch 'PYTORCH_CUDA_ALLOC_CONF' -and $_ -notmatch 'CUDA_LAUNCH_BLOCKING' -and $_ -notmatch 'TORCH_CUDNN_V8_API_ENABLED' -and $_ -notmatch 'CUDA_MODULE_LOADING' -and $_ -notmatch 'CUDA_CACHE_DISABLE' -and $_ -notmatch 'WHISPER_CUDA' -and $_ -notmatch 'COMFYUI_' } | ForEach-Object { $_ -replace 'FASTER_WHISPER_DEVICE=cuda', 'FASTER_WHISPER_DEVICE=cpu' } | Set-Content 'docker-compose-active.yml'"
    
    echo ✅ CPU-optimized configuration ready
) else (
    echo 🚀 Creating GPU-accelerated configuration...
    copy docker-compose.yml docker-compose-active.yml >nul
    echo ✅ GPU-accelerated configuration ready
)

echo.
echo ═══════════════════════════════════════════════════════════════════════════════
echo                        📥 DOWNLOADING COMPONENTS                        
echo ═══════════════════════════════════════════════════════════════════════════════
echo.

REM Step 7: Pull images
echo [7/8] 📥 Downloading ClaraVerse containers...
echo      This may take several minutes for first-time setup
echo.
docker compose -f docker-compose-active.yml pull
if %errorLevel% neq 0 (
    echo ❌ Failed to download container images
    echo Please check your internet connection and try again
    pause
    exit /b 1
)
echo ✅ All container images downloaded successfully

echo.
echo ═══════════════════════════════════════════════════════════════════════════════
echo                        🚀 LAUNCHING CLARAVERSE                         
echo ═══════════════════════════════════════════════════════════════════════════════
echo.

REM Step 8: Deploy services
echo [8/8] 🚀 Starting all ClaraVerse services...
docker compose -f docker-compose-active.yml up -d
if %errorLevel% neq 0 (
    echo ❌ Failed to start services
    echo Check Docker Desktop and try again
    pause
    exit /b 1
)
echo ✅ All services launched successfully

REM Wait for services
echo.
echo ⏳ Waiting for services to initialize...
set /a "attempts=0"
set /a "max_attempts=24"

:health_check_loop
set /a "attempts+=1"
echo    [%attempts%/%max_attempts%] Checking service health...

curl -f http://localhost/health >nul 2>&1
if %errorLevel% equ 0 (
    echo ✅ All services are healthy and ready!
    goto services_ready
)

if %attempts% geq %max_attempts% (
    echo ⚠️  Services are taking longer than expected to start
    echo 💡 You can check status with: docker compose -f docker-compose-active.yml ps
    goto services_ready
)

timeout /t 5 /nobreak >nul
goto health_check_loop

:services_ready

REM Get local IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" ^| findstr "192.168\|10\.\|172\."') do (
    set "LOCAL_IP=%%a"
    set "LOCAL_IP=!LOCAL_IP: =!"
    goto ip_found
)
set "LOCAL_IP=localhost"

:ip_found

cls
echo.
echo    ██████╗ ███████╗██████╗ ██╗      ██████╗ ██╗   ██╗███████╗██████╗ 
echo    ██╔══██╗██╔════╝██╔══██╗██║     ██╔═══██╗╚██╗ ██╔╝██╔════╝██╔══██╗
echo    ██║  ██║█████╗  ██████╔╝██║     ██║   ██║ ╚████╔╝ █████╗  ██║  ██║
echo    ██║  ██║██╔══╝  ██╔═══╝ ██║     ██║   ██║  ╚██╔╝  ██╔══╝  ██║  ██║
echo    ██████╔╝███████╗██║     ███████╗╚██████╔╝   ██║   ███████╗██████╔╝
echo    ╚═════╝ ╚══════╝╚═╝     ╚══════╝ ╚═════╝    ╚═╝   ╚══════╝╚═════╝ 
echo.
echo    ╔═══════════════════════════════════════════════════════════════╗
echo    ║                                                               ║
echo    ║            🎉 CLARAVERSE DEPLOYMENT SUCCESSFUL! 🎉            ║
echo    ║                                                               ║
echo    ╚═══════════════════════════════════════════════════════════════╝
echo.
echo 🌐 Your ClaraVerse server is now running at:
echo.
echo    ┌─────────────────────────────────────────────────────────────────┐
echo    │                                                                 │
echo    │  📊 Main Dashboard: http://%LOCAL_IP%                      │
echo    │  🎨 ComfyUI:        http://%LOCAL_IP%/comfyui/              │
echo    │  🔧 n8n Workflows:  http://%LOCAL_IP%/n8n/                  │
echo    │  🐍 API Docs:       http://%LOCAL_IP%/api/docs              │
echo    │                                                                 │
echo    └─────────────────────────────────────────────────────────────────┘
echo.
echo 💡 Quick Management Commands:
echo    📊 Check Status: docker compose -f docker-compose-active.yml ps
echo    📝 View Logs:    docker compose -f docker-compose-active.yml logs -f
echo    🔄 Restart:      docker compose -f docker-compose-active.yml restart
echo    ⏹️  Stop:         docker compose -f docker-compose-active.yml down
echo.

if "%GPU_AVAILABLE%"=="true" (
    echo 🚀 GPU Acceleration: ENABLED ^(NVIDIA CUDA^)
) else (
    echo 🖥️  Running Mode: CPU Only ^(No GPU detected^)
)

echo.
echo System Specifications:
echo   • Docker: %DOCKER_VERSION%
if "%GPU_AVAILABLE%"=="true" (
    echo   • GPU: NVIDIA GPU with CUDA support
) else (
    echo   • GPU: CPU-only mode
)
echo   • Services: ComfyUI, Python Backend, n8n, Nginx
echo   • Architecture: Windows with Docker Desktop
echo.
echo ═══════════════════════════════════════════════════════════════════════════════
echo Thank you for using ClaraVerse! Happy creating! 🎨✨
echo ═══════════════════════════════════════════════════════════════════════════════
echo.
echo Press any key to open the dashboard in your browser...
pause >nul

REM Open browser
start http://%LOCAL_IP%

echo Browser opened! Installation complete.
timeout /t 3 /nobreak >nul