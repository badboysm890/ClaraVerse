@echo off
REM angela Core Docker Build and Run Script for Windows

setlocal enabledelayedexpansion

REM Configuration
set CONTAINER_NAME=angela_core
set IMAGE_NAME=angela-core
set DEFAULT_PORT=8091
set MODELS_PATH=.\models

REM Colors for output (Windows)
set RED=[91m
set GREEN=[92m
set YELLOW=[93m
set BLUE=[94m
set NC=[0m

REM Helper functions
:log_info
echo %BLUE%[INFO]%NC% %~1
goto :eof

:log_success
echo %GREEN%[SUCCESS]%NC% %~1
goto :eof

:log_warning
echo %YELLOW%[WARNING]%NC% %~1
goto :eof

:log_error
echo %RED%[ERROR]%NC% %~1
goto :eof

REM Detect GPU support
:detect_gpu
where nvidia-smi >nul 2>&1
if %ERRORLEVEL% == 0 (
    nvidia-smi >nul 2>&1
    if !ERRORLEVEL! == 0 (
        echo gpu
        goto :eof
    )
)
echo cpu
goto :eof

REM Check Docker and Docker Compose
:check_dependencies
call :log_info "Checking dependencies..."

where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    call :log_error "Docker is not installed or not in PATH"
    exit /b 1
)

where docker-compose >nul 2>&1
if %ERRORLEVEL% neq 0 (
    docker compose version >nul 2>&1
    if !ERRORLEVEL! neq 0 (
        call :log_error "Docker Compose is not installed or not in PATH"
        exit /b 1
    )
)

call :log_success "Dependencies check passed"
goto :eof

REM Build the container
:build
if "%~1"=="" (
    call :detect_gpu
    set COMPUTE_BACKEND=!gpu_result!
) else (
    set COMPUTE_BACKEND=%~1
)

call :log_info "Building angela Core container with !COMPUTE_BACKEND! support..."

REM Set environment variable for build
set COMPUTE_BACKEND=!COMPUTE_BACKEND!

REM Build using docker-compose
where docker-compose >nul 2>&1
if %ERRORLEVEL% == 0 (
    docker-compose -f docker\angela-core\docker-compose.yml build
) else (
    docker compose -f docker\angela-core\docker-compose.yml build
)

call :log_success "Build completed"
goto :eof

REM Run the container
:run
if "%~1"=="" (
    call :detect_gpu
    for /f %%i in ('call :detect_gpu') do set COMPUTE_BACKEND=%%i
) else (
    set COMPUTE_BACKEND=%~1
)

if "%~2"=="" (
    set MODELS_PATH_ABS=%CD%\models
) else (
    set MODELS_PATH_ABS=%~f2
)

call :log_info "Starting angela Core with !COMPUTE_BACKEND! support..."
call :log_info "Models path: !MODELS_PATH_ABS!"

REM Create models directory if it doesn't exist
if not exist "!MODELS_PATH_ABS!" mkdir "!MODELS_PATH_ABS!"

REM Set environment variables
set angela_MODELS_PATH=!MODELS_PATH_ABS!

REM Run using docker-compose
where docker-compose >nul 2>&1
if %ERRORLEVEL% == 0 (
    docker-compose -f docker\angela-core\docker-compose.yml up -d
) else (
    docker compose -f docker\angela-core\docker-compose.yml up -d
)

call :log_success "angela Core started successfully"
call :log_info "API available at: http://localhost:%DEFAULT_PORT%"
call :log_info "Health check: http://localhost:%DEFAULT_PORT%/health"

REM Show logs
timeout /t 2 /nobreak >nul
call :log_info "Showing startup logs..."
where docker-compose >nul 2>&1
if %ERRORLEVEL% == 0 (
    docker-compose -f docker\angela-core\docker-compose.yml logs --tail=20 angela-core
) else (
    docker compose -f docker\angela-core\docker-compose.yml logs --tail=20 angela-core
)
goto :eof

REM Stop the container
:stop
call :log_info "Stopping angela Core..."

where docker-compose >nul 2>&1
if %ERRORLEVEL% == 0 (
    docker-compose -f docker\angela-core\docker-compose.yml down
) else (
    docker compose -f docker\angela-core\docker-compose.yml down
)

call :log_success "angela Core stopped"
goto :eof

REM Show status
:status
call :log_info "angela Core status:"

where docker-compose >nul 2>&1
if %ERRORLEVEL% == 0 (
    docker-compose -f docker\angela-core\docker-compose.yml ps
) else (
    docker compose -f docker\angela-core\docker-compose.yml ps
)

REM Check if service is responding
curl -f -s http://localhost:%DEFAULT_PORT%/health >nul 2>&1
if %ERRORLEVEL% == 0 (
    call :log_success "Service is healthy and responding"
    curl -s http://localhost:%DEFAULT_PORT%/health
) else (
    call :log_warning "Service is not responding to health checks"
)
goto :eof

REM Show logs
:logs
if "%~1"=="" (
    set LOG_LINES=50
) else (
    set LOG_LINES=%~1
)

call :log_info "Showing angela Core logs (last !LOG_LINES! lines)..."

where docker-compose >nul 2>&1
if %ERRORLEVEL% == 0 (
    docker-compose -f docker\angela-core\docker-compose.yml logs --tail=!LOG_LINES! -f angela-core
) else (
    docker compose -f docker\angela-core\docker-compose.yml logs --tail=!LOG_LINES! -f angela-core
)
goto :eof

REM Update the container
:update
call :log_info "Updating angela Core..."

REM Pull latest changes (if using git)
if exist ".git" (
    git pull
)

REM Rebuild and restart
call :build %~1
call :stop
call :run %~1 %~2

call :log_success "Update completed"
goto :eof

REM Show usage
:usage
echo angela Core Docker Management Script for Windows
echo.
echo Usage: %~nx0 [COMMAND] [OPTIONS]
echo.
echo Commands:
echo   build [cpu^|gpu]     Build the container (auto-detects GPU if not specified)
echo   run [cpu^|gpu] [models_path]  Run the container
echo   stop                Stop the container
echo   restart             Restart the container
echo   status              Show container status
echo   logs [lines]        Show container logs
echo   update              Update and restart the container
echo   clean               Remove containers and images
echo.
echo Examples:
echo   %~nx0 build gpu        # Build with GPU support
echo   %~nx0 run cpu .\models # Run with CPU and custom models path
echo   %~nx0 logs 100         # Show last 100 log lines
echo.
for /f %%i in ('call :detect_gpu') do echo Current GPU detection: %%i
goto :eof

REM Clean up
:clean
call :log_info "Cleaning up angela Core containers and images..."

REM Stop containers
call :stop >nul 2>&1

REM Remove containers
docker rm -f %CONTAINER_NAME% >nul 2>&1

REM Remove images
docker rmi %IMAGE_NAME% >nul 2>&1
docker system prune -f

call :log_success "Cleanup completed"
goto :eof

REM Main script
if "%~1"=="build" (
    call :check_dependencies
    call :build %~2
) else if "%~1"=="run" (
    call :check_dependencies
    call :run %~2 %~3
) else if "%~1"=="stop" (
    call :stop
) else if "%~1"=="restart" (
    call :stop
    call :run %~2 %~3
) else if "%~1"=="status" (
    call :status
) else if "%~1"=="logs" (
    call :logs %~2
) else if "%~1"=="update" (
    call :check_dependencies
    call :update %~2 %~3
) else if "%~1"=="clean" (
    call :clean
) else (
    call :usage
)

endlocal
