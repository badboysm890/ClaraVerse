@echo off
echo 🎨 Rebuilding ComfyUI Docker Image with CUDA PyTorch...
echo.

cd docker
bash build-comfyui.sh

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ ComfyUI image rebuilt successfully!
    echo 🔄 You can now restart Clara to use the new image
    echo.
    pause
) else (
    echo.
    echo ❌ Build failed! Check the output above for errors.
    echo.
    pause
) 

