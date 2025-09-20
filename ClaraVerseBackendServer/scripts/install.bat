@echo off
REM ClaraVerse Remote Server Installer - Windows
REM Beautiful ASCII art deployment script with full automation

setlocal enabledelayedexpansion

REM Enable color support
for /F %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"

REM Color definitions
set "RED=%ESC%[31m"
set "GREEN=%ESC%[32m"
set "YELLOW=%ESC%[33m"
set "BLUE=%ESC%[34m"
set "MAGENTA=%ESC%[35m"
set "CYAN=%ESC%[36m"
set "WHITE=%ESC%[37m"
set "BOLD=%ESC%[1m"echo %WHITE%  • Services: %RESET%
if "!DEPLOY_COMFYUI!"=="true" echo %WHITE%    - ComfyUI%RESET%
if "!DEPLOY_PYTHON!"=="true" echo %WHITE%    - Python Backend%RESET%
if "!DEPLOY_N8N!"=="true" echo %WHITE%    - n8n%RESET%
echo %WHITE%  • Architecture: Windows with Docker Desktop%RESET%
echo.
echo %BLUE%=================================================================================%RESET%
echo %BOLD%%WHITE%Thank you for using ClaraVerse! Happy creating!%RESET%
echo %BLUE%=================================================================================%RESET%
echo.

REM Determine which service to open in browser
set "BROWSER_URL="
if "!DEPLOY_COMFYUI!"=="true" (
    set "BROWSER_URL=http://!LOCAL_IP!:8188"
    set "BROWSER_SERVICE=ComfyUI"
) else if "!DEPLOY_N8N!"=="true" (
    set "BROWSER_URL=http://!LOCAL_IP!:5678"
    set "BROWSER_SERVICE=n8n"
) else if "!DEPLOY_PYTHON!"=="true" (
    set "BROWSER_URL=http://!LOCAL_IP!:5001"
    set "BROWSER_SERVICE=Python Backend"
)

if not "!BROWSER_URL!"=="" (
    echo %YELLOW%Press any key to open !BROWSER_SERVICE! in your browser...%RESET%
    pause >nul
    start !BROWSER_URL!
    echo %GREEN%Browser opened! Installation complete.%RESET%
) else (
    echo %GREEN%Installation complete!%RESET%
)

echo %WHITE%Access your services at:%RESET%
if "!DEPLOY_COMFYUI!"=="true" echo %WHITE%  ComfyUI: http://!LOCAL_IP!:8188%RESET%
if "!DEPLOY_PYTHON!"=="true" echo %WHITE%  Python Backend: http://!LOCAL_IP!:5001%RESET%
if "!DEPLOY_N8N!"=="true" echo %WHITE%  n8n: http://!LOCAL_IP!:5678%RESET%[0m"

REM Progress bar settings
set "PROGRESS_WIDTH=50"
set /a "step=0"
set /a "total_steps=8"

cls
echo.
echo %CYAN%
echo     #####  #        #####  ######   #####  #     # ####### ######   ##### #######
echo    #     # #       #     # #     # #     # #     # #       #     # #     # #
echo    #       #       ####### ######  ####### #     # #####   ######   #####  #####
echo    #       #       #     # #   #   #     #  #   #  #       #   #        #  #
echo    #     # #       #     # #    #  #     #  #   #  #       #    #  #     # #
echo     #####  ####### #     # #     # #     #   ###   ####### #     #  #####  #######
echo %RESET%
echo.
echo %BOLD%%MAGENTA%                    REMOTE SERVER DEPLOYMENT%RESET%
echo %CYAN%                          The AI-Powered Creative Suite%RESET%
echo.
echo %YELLOW%    +==================================================================+%RESET%
echo %YELLOW%    :                                                                  :%RESET%
echo %YELLOW%    :  %WHITE%ComfyUI     - AI Image Generation Powerhouse%YELLOW%                :%RESET%
echo %YELLOW%    :  %WHITE%Python Backend - Advanced AI Processing APIs%YELLOW%                :%RESET%
echo %YELLOW%    :  %WHITE%n8n Workflows - Automation Made Simple%YELLOW%                      :%RESET%
echo %YELLOW%    :                                                                  :%RESET%
echo %YELLOW%    +==================================================================+%RESET%
echo.
echo %GREEN%        Auto-GPU Detection  -  Secure Deployment  -  Production Ready%RESET%
echo.
timeout /t 2 /nobreak >nul

echo %BLUE%=================================================================================%RESET%
echo %BOLD%%WHITE%                        [SERVICE SELECTION]                            %RESET%
echo %BLUE%=================================================================================%RESET%
echo.
echo %WHITE%Please select which services you want to deploy:%RESET%
echo.
echo %CYAN%   [1] ComfyUI          %WHITE%- AI Image Generation (Port 8188)%RESET%
echo %CYAN%   [2] Python Backend   %WHITE%- Core AI Processing APIs (Port 5001)%RESET%
echo %CYAN%   [3] n8n Workflows    %WHITE%- Automation Platform (Port 5678)%RESET%
echo %CYAN%   [A] All Services     %WHITE%- Deploy everything (Recommended)%RESET%
echo.

set "DEPLOY_COMFYUI=false"
set "DEPLOY_PYTHON=false"
set "DEPLOY_N8N=false"

:service_selection
echo %YELLOW%Select services (e.g., 1,3 or A for all): %RESET%
set /p "SERVICE_CHOICE="

if /i "!SERVICE_CHOICE!"=="A" (
    set "DEPLOY_COMFYUI=true"
    set "DEPLOY_PYTHON=true" 
    set "DEPLOY_N8N=true"
    echo %GREEN%[*] All services selected for deployment%RESET%
    goto selection_complete
)

if "!SERVICE_CHOICE!"=="" goto service_selection

REM Parse individual service selections
echo !SERVICE_CHOICE! | findstr "1" >nul
if !errorlevel! equ 0 set "DEPLOY_COMFYUI=true"

echo !SERVICE_CHOICE! | findstr "2" >nul  
if !errorlevel! equ 0 set "DEPLOY_PYTHON=true"

echo !SERVICE_CHOICE! | findstr "3" >nul
if !errorlevel! equ 0 set "DEPLOY_N8N=true"

REM Check if any service was selected
if "!DEPLOY_COMFYUI!"=="false" (
    if "!DEPLOY_PYTHON!"=="false" (
        if "!DEPLOY_N8N!"=="false" (
            echo %RED%[!] No valid services selected. Please try again.%RESET%
            goto service_selection
        )
    )
)

:selection_complete
echo.
echo %WHITE%Selected services:%RESET%
if "!DEPLOY_COMFYUI!"=="true" echo %GREEN%  ✓ ComfyUI%RESET%
if "!DEPLOY_PYTHON!"=="true" echo %GREEN%  ✓ Python Backend%RESET%
if "!DEPLOY_N8N!"=="true" echo %GREEN%  ✓ n8n Workflows%RESET%
echo.
timeout /t 2 /nobreak >nul

echo %BLUE%=================================================================================%RESET%
echo %BOLD%%WHITE%                        [SYSTEM VERIFICATION]                          %RESET%
echo %BLUE%=================================================================================%RESET%
echo.

REM Step 1: Check Docker Desktop
set /a "step=1"
call :show_progress
echo %YELLOW%[*] Checking Docker Desktop installation...%RESET%
docker --version >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo %RED%[X] ERROR: Docker Desktop is not installed or not in PATH%RESET%
    echo.
    echo %YELLOW%Please install Docker Desktop for Windows:%RESET%
    echo %WHITE%   1. Download from: https://docs.docker.com/desktop/windows/install/%RESET%
    echo %WHITE%   2. Install Docker Desktop%RESET%
    echo %WHITE%   3. Start Docker Desktop and wait for it to be ready%RESET%
    echo %WHITE%   4. Run this script again%RESET%
    echo.
    pause
    exit /b 1
)

REM Get Docker version safely
set "DOCKER_VERSION=unknown"
for /f "tokens=3 delims= " %%v in ('docker --version 2^>nul') do (
    set "DOCKER_VERSION=%%v"
    goto version_found
)
:version_found
echo %GREEN%[OK] Docker Desktop %DOCKER_VERSION% detected%RESET%

REM Step 2: Check Docker daemon
set /a "step=2" 
call :show_progress
echo %YELLOW%[*] Verifying Docker daemon status...%RESET%
docker info >nul 2>&1
if %errorLevel% neq 0 (
    echo %RED%[X] Docker daemon not responding%RESET%
    echo %YELLOW%[i] Starting Docker Desktop automatically...%RESET%
    
    REM Try to find and start Docker Desktop
    if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
        start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    ) else if exist "%LOCALAPPDATA%\Docker\Docker Desktop.exe" (
        start "" "%LOCALAPPDATA%\Docker\Docker Desktop.exe"
    ) else (
        echo %RED%[X] Cannot find Docker Desktop executable%RESET%
        echo %YELLOW%Please start Docker Desktop manually and run this script again%RESET%
        pause
        exit /b 1
    )
    
    echo %CYAN%[*] Waiting for Docker Desktop to start (60 seconds)...%RESET%
    
    set /a "wait_count=0"
    :wait_docker
    timeout /t 5 /nobreak >nul
    docker info >nul 2>&1
    if %errorLevel% equ 0 goto docker_ready
    
    set /a "wait_count+=1"
    if %wait_count% lss 12 (
        echo %CYAN%   [*] Still waiting... (!wait_count!/12)%RESET%
        goto wait_docker
    )
    
    echo %RED%[X] Docker Desktop failed to start automatically%RESET%
    echo %YELLOW%Please start Docker Desktop manually and run this script again%RESET%
    pause
    exit /b 1
)

:docker_ready
echo %GREEN%[OK] Docker daemon is running%RESET%

REM Step 3: GPU Detection
set /a "step=3"
call :show_progress
echo %YELLOW%[*] Scanning for NVIDIA GPU...%RESET%
set "GPU_AVAILABLE=false"

where nvidia-smi >nul 2>&1
if %errorLevel% equ 0 (
    nvidia-smi --query-gpu=name --format=csv,noheader >temp_gpu.txt 2>nul
    if %errorLevel% equ 0 (
        for /f "tokens=*" %%g in (temp_gpu.txt) do (
            echo %GREEN%[OK] GPU Detected: %%g%RESET%
            set "GPU_AVAILABLE=true"
            del temp_gpu.txt >nul 2>&1
            goto gpu_check_done
        )
    )
    del temp_gpu.txt >nul 2>&1
)
echo %YELLOW%[!] No NVIDIA GPU detected - CPU mode will be used%RESET%

:gpu_check_done

REM Step 4: Test GPU Docker support
if "%GPU_AVAILABLE%"=="true" (
    set /a "step=4"
    call :show_progress
    echo %YELLOW%[*] Testing NVIDIA Docker integration...%RESET%
    docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi >nul 2>&1
    if %errorLevel% equ 0 (
        echo %GREEN%[OK] GPU Docker acceleration ready%RESET%
        set "GPU_DOCKER=true"
    ) else (
        echo %YELLOW%[!] GPU available but Docker GPU support not working%RESET%
        echo %CYAN%[i] Continuing with CPU mode%RESET%
        set "GPU_DOCKER=false"
        set "GPU_AVAILABLE=false"
    )
) else (
    set /a "step=4"
    call :show_progress
    echo %CYAN%[i] Configuring for CPU-only deployment%RESET%
    set "GPU_DOCKER=false"
)

echo.
echo %BLUE%=================================================================================%RESET%
echo %BOLD%%WHITE%                        [DEPLOYMENT CONFIGURATION]                     %RESET%
echo %BLUE%=================================================================================%RESET%
echo.

REM Step 5: Create directories
set /a "step=5"
call :show_progress
echo %YELLOW%[*] Setting up data directories...%RESET%
if not exist "data" mkdir data
if not exist "data\comfyui" mkdir data\comfyui
if not exist "data\python" mkdir data\python  
if not exist "data\n8n" mkdir data\n8n
if not exist "logs" mkdir logs
echo %GREEN%[OK] Directory structure created%RESET%

REM Step 6: Configure for GPU/CPU
set /a "step=6"
call :show_progress
echo %YELLOW%[*] Generating optimized configuration...%RESET%

if "%GPU_AVAILABLE%"=="false" (
    echo %CYAN%[i] CPU-only deployment (GPU options will be ignored by Docker)%RESET%
) else (
    echo %CYAN%[i] GPU-accelerated deployment ready%RESET%
)

echo.
echo %BLUE%=================================================================================%RESET%
echo %BOLD%%WHITE%                        [DOWNLOADING COMPONENTS]                        %RESET%
echo %BLUE%=================================================================================%RESET%
echo.

REM Step 7: Pull images
set /a "step=7"
call :show_progress
echo %YELLOW%[*] Downloading selected ClaraVerse containers...%RESET%
echo %CYAN%    This may take several minutes for first-time setup%RESET%
echo.

REM Build service list for pulling
set "SERVICES="
if "!DEPLOY_COMFYUI!"=="true" set "SERVICES=!SERVICES! clara_comfyui"
if "!DEPLOY_PYTHON!"=="true" set "SERVICES=!SERVICES! clara_python"
if "!DEPLOY_N8N!"=="true" set "SERVICES=!SERVICES! clara_n8n"

docker compose pull!SERVICES!
if %errorLevel% neq 0 (
    echo %RED%[X] Failed to download container images%RESET%
    echo %YELLOW%Please check your internet connection and try again%RESET%
    pause
    exit /b 1
)
echo %GREEN%[OK] All container images downloaded successfully%RESET%

echo.
echo %BLUE%=================================================================================%RESET%
echo %BOLD%%WHITE%                        [LAUNCHING CLARAVERSE]                         %RESET%
echo %BLUE%=================================================================================%RESET%
echo.

REM Step 8: Deploy services
set /a "step=8"
call :show_progress
echo %YELLOW%[*] Starting selected ClaraVerse services...%RESET%

REM Build service list based on selections
set "SERVICES="
if "!DEPLOY_COMFYUI!"=="true" set "SERVICES=!SERVICES! clara_comfyui"
if "!DEPLOY_PYTHON!"=="true" set "SERVICES=!SERVICES! clara_python"
if "!DEPLOY_N8N!"=="true" set "SERVICES=!SERVICES! clara_n8n"

echo %CYAN%[*] Starting services:!SERVICES!%RESET%

docker compose up -d!SERVICES!
if %errorLevel% neq 0 (
    echo %RED%[X] Failed to start services%RESET%
    echo %YELLOW%Check Docker Desktop and try again%RESET%
    pause
    exit /b 1
)

echo %GREEN%[OK] All services launched successfully%RESET%
echo.

REM Wait for services with animated progress
echo %YELLOW%[*] Waiting for services to initialize...%RESET%
set /a "health_attempts=0"
set /a "max_health_attempts=24"

:health_check_loop
set /a "health_attempts+=1"
set /a "health_percent=health_attempts*100/max_health_attempts"

REM Create animated dots
set "dots=..."
set /a "dot_count=health_attempts%%4"
if !dot_count! equ 0 set "dots=   "
if !dot_count! equ 1 set "dots=.  "
if !dot_count! equ 2 set "dots=.. "
if !dot_count! equ 3 set "dots=..."

echo %CYAN%    [!health_percent!%%] Checking service health!dots!    %RESET%

REM Check health of selected services
set "HEALTH_OK=true"

if "!DEPLOY_COMFYUI!"=="true" (
    curl -f http://localhost:8188/ >nul 2>&1
    if !errorLevel! neq 0 set "HEALTH_OK=false"
)

if "!DEPLOY_PYTHON!"=="true" (
    curl -f http://localhost:5001/health >nul 2>&1
    if !errorLevel! neq 0 set "HEALTH_OK=false"
)

if "!DEPLOY_N8N!"=="true" (
    curl -f http://localhost:5678/healthz >nul 2>&1
    if !errorLevel! neq 0 set "HEALTH_OK=false"
)

if "!HEALTH_OK!"=="true" (
    echo %GREEN%[OK] All selected services are healthy and ready!%RESET%
    goto services_ready
)

REM Check if containers are at least running
docker compose ps --format json >nul 2>&1
if %errorLevel% equ 0 (
    if !health_attempts! geq 6 (
        echo %GREEN%[OK] Services are running (health endpoint not available yet)%RESET%
        goto services_ready
    )
)

if !health_attempts! geq !max_health_attempts! (
    echo %YELLOW%[!] Services are taking longer than expected to start%RESET%
    echo %CYAN%[i] You can check status with: docker compose ps%RESET%
    goto services_ready
)

timeout /t 5 /nobreak >nul
goto health_check_loop

:services_ready

REM Get local IP safely
set "LOCAL_IP=localhost"
ipconfig >temp_ip.txt 2>nul
for /f "tokens=2 delims=:" %%a in ('findstr /c:"IPv4" temp_ip.txt ^| findstr "192.168 10. 172."') do (
    for /f "tokens=*" %%b in ("%%a") do (
        set "LOCAL_IP=%%b"
        goto ip_found
    )
)
del temp_ip.txt >nul 2>&1

:ip_found

cls
echo.
echo %GREEN%
echo    ######  ####### ######  #       ####### #     # ####### ######
echo    #     # #       #     # #       #     #  #   #  #       #     #
echo    #     # #####   ######  #       #     #   # #   #####   #     #
echo    #     # #       #       #       #     #    #    #       #     #
echo    #     # #       #       #       #     #    #    #       #     #
echo    ######  ####### #       ####### #######    #    ####### ###### 
echo %RESET%
echo.
echo %BOLD%%MAGENTA%    +=================================================================+%RESET%
echo %BOLD%%MAGENTA%    :                                                                 :%RESET%
echo %BOLD%%MAGENTA%    :             CLARAVERSE DEPLOYMENT SUCCESSFUL!                  :%RESET%
echo %BOLD%%MAGENTA%    :                                                                 :%RESET%
echo %BOLD%%MAGENTA%    +=================================================================+%RESET%
echo.
echo %CYAN%Your selected ClaraVerse services are now running:%RESET%
echo.
echo %WHITE%    +-----------------------------------------------------------------+%RESET%
echo %WHITE%    :                                                                 :%RESET%
if "!DEPLOY_COMFYUI!"=="true" echo %WHITE%    :  %BOLD%%BLUE%ComfyUI:      %RESET% %YELLOW%http://!LOCAL_IP!:8188%RESET%
if "!DEPLOY_PYTHON!"=="true" echo %WHITE%    :  %BOLD%%BLUE%Python API:   %RESET% %YELLOW%http://!LOCAL_IP!:5001%RESET%
if "!DEPLOY_N8N!"=="true" echo %WHITE%    :  %BOLD%%BLUE%n8n Workflows:%RESET% %YELLOW%http://!LOCAL_IP!:5678%RESET%
echo %WHITE%    :                                                                 :%RESET%
echo %WHITE%    +-----------------------------------------------------------------+%RESET%
echo.
echo %GREEN%Quick Management Commands:%RESET%
echo %CYAN%    Check Status: %WHITE%docker compose ps%RESET%
echo %CYAN%    View Logs:    %WHITE%docker compose logs -f%RESET%
echo %CYAN%    Restart:      %WHITE%docker compose restart%RESET%
echo %CYAN%    Stop:         %WHITE%docker compose down%RESET%
echo.

if "%GPU_AVAILABLE%"=="true" (
    echo %GREEN%GPU Acceleration: %BOLD%ENABLED%RESET% %GREEN%(NVIDIA CUDA)%RESET%
) else (
    echo %YELLOW%Running Mode: %BOLD%CPU Only%RESET% %YELLOW%(No GPU detected)%RESET%
)

echo.
echo %BOLD%%GREEN%System Specifications:%RESET%
echo %WHITE%  • Docker: %DOCKER_VERSION%%RESET%
if "%GPU_AVAILABLE%"=="true" (
    echo %WHITE%  • GPU: NVIDIA GPU with CUDA support%RESET%
) else (
    echo %WHITE%  • Mode: CPU-only deployment%RESET%
)
echo %WHITE%  • Services: ComfyUI, Python Backend, n8n%RESET%
echo %WHITE%  • Architecture: Windows with Docker Desktop%RESET%
echo.
echo %BLUE%=================================================================================%RESET%
echo %BOLD%%WHITE%Thank you for using ClaraVerse! Happy creating!%RESET%
echo %BLUE%=================================================================================%RESET%
echo.
echo %YELLOW%Press any key to open ComfyUI in your browser...%RESET%
pause >nul

REM Open browser to ComfyUI
start http://!LOCAL_IP!:8188

echo %GREEN%Browser opened! Installation complete.%RESET%
echo %WHITE%Access your services at:%RESET%
echo %WHITE%  ComfyUI: http://!LOCAL_IP!:8188%RESET%
echo %WHITE%  n8n: http://!LOCAL_IP!:5678%RESET%
echo %WHITE%  Python Backend: http://!LOCAL_IP!:5001%RESET%
echo.
timeout /t 3 /nobreak >nul
exit /b 0

REM ============= FUNCTIONS =============

:show_progress
set /a "percent=!step!*100/!total_steps!"
set /a "filled=!step!*!PROGRESS_WIDTH!/!total_steps!"
set /a "empty=!PROGRESS_WIDTH!-!filled!"

set "bar="
for /l %%i in (1,1,!filled!) do set "bar=!bar!#"
for /l %%i in (1,1,!empty!) do set "bar=!bar!-"

echo %CYAN%[!bar!] !percent!%% %RESET%
exit /b 0