# Platform-Specific Binary Structure

This document describes the platform-specific binary organization for the llama-swap service.

## Directory Structure

```
electron/llamacpp-binaries/
├── PLATFORM_STRUCTURE.md          # This document
├── config.yaml                    # Auto-generated configuration
├── models/                         # Bundled models
├── darwin-arm64/                   # macOS Apple Silicon binaries
│   ├── llama-swap-darwin-arm64     # Platform-specific llama-swap binary
│   ├── llama-server                # Platform-specific llama-server binary
│   ├── *.dylib                     # macOS dynamic libraries
│   ├── *.h                         # Header files
│   └── *.metal                     # Metal shaders for GPU acceleration
├── darwin-x64/                     # macOS Intel binaries (future)
├── linux-x64/                      # Linux x64 binaries (future)
├── linux-arm64/                    # Linux ARM64 binaries (future)
└── win32-x64/                      # Windows x64 binaries (future)
```

## Currently Supported Platforms

### ✅ darwin-arm64 (macOS Apple Silicon)
- **Status**: Fully supported
- **Binaries**: `llama-swap-darwin-arm64`, `llama-server`
- **Libraries**: `*.dylib` files for Metal acceleration
- **GPU Support**: Metal Performance Shaders

### 🔄 Future Platforms

The following platforms are planned for future releases:

#### darwin-x64 (macOS Intel)
- **Binaries**: `llama-swap-darwin-x64`, `llama-server`
- **Libraries**: `*.dylib` files
- **GPU Support**: Metal (limited)

#### linux-x64 (Linux x64)
- **Binaries**: `llama-swap-linux-x64`, `llama-server`
- **Libraries**: `*.so` files
- **GPU Support**: CUDA, OpenCL

#### linux-arm64 (Linux ARM64)
- **Binaries**: `llama-swap-linux-arm64`, `llama-server`
- **Libraries**: `*.so` files
- **GPU Support**: OpenCL

#### win32-x64 (Windows x64)
- **Binaries**: `llama-swap-win32-x64.exe`, `llama-server.exe`
- **Libraries**: `*.dll` files
- **GPU Support**: CUDA, DirectML

## Binary Management

### Automatic Platform Detection
The system automatically detects the current platform using Node.js `os.platform()` and `os.arch()` and selects the appropriate binary directory.

### Fallback Mechanism
If platform-specific binaries are not found, the system falls back to legacy locations in the root `llamacpp-binaries/` directory for backward compatibility.

### Environment Variables
Platform-specific environment variables are automatically set:
- **macOS**: `DYLD_LIBRARY_PATH` for dylib loading
- **Linux**: `LD_LIBRARY_PATH` for shared library loading
- **Windows**: Uses PATH for DLL loading

## Adding New Platforms

To add support for a new platform:

1. **Create Platform Directory**:
   ```bash
   mkdir electron/llamacpp-binaries/{platform-arch}/
   ```

2. **Add Binaries**:
   - Copy the platform-specific `llama-swap-{platform-arch}` binary
   - Copy the platform-specific `llama-server` binary
   - Copy all required shared libraries

3. **Update PlatformManager**:
   - Add the platform configuration to `getSupportedPlatforms()`
   - Set `supported: true` for the new platform

4. **Test**:
   - Verify binaries are detected and executable
   - Test service startup and model loading

## Binary Sources

### Pre-built Binaries
Currently, binaries are manually placed in the platform directories. Future versions will support:
- Automated downloads from GitHub releases
- CDN distribution
- Checksums and signature verification

### Just-In-Time Compilation
Future versions will support compiling binaries from source:
- Automatic detection of build tools
- Optimized compilation for target hardware
- CPU feature detection (AVX, AVX2, AVX-512)
- GPU acceleration support detection

## Optimization Levels

Different binary variants may be provided for different use cases:
- **Performance**: Optimized for speed
- **Memory**: Optimized for low memory usage
- **Compatibility**: Maximum compatibility across systems
- **GPU**: GPU-accelerated variants

## Troubleshooting

### Binary Not Found
If you see "binary not found" errors:
1. Check the platform directory exists
2. Verify binary names match the expected format
3. Check file permissions (must be executable)

### Library Loading Issues
If you see library loading errors:
1. Verify all required shared libraries are present
2. Check environment variables are set correctly
3. Ensure libraries are compatible with the binary

### Platform Not Supported
If your platform is not yet supported:
1. Check the supported platforms list
2. Consider using a compatible platform binary
3. Request support for your platform via GitHub issues

## Development Notes

### Testing New Platforms
When developing support for new platforms:
1. Use virtual machines or containers for testing
2. Verify all dependencies are included
3. Test with various model types and sizes

### Performance Optimization
Platform-specific optimizations to consider:
- CPU instruction sets (SSE, AVX, NEON)
- GPU acceleration (Metal, CUDA, OpenCL, DirectML)
- Memory management optimizations
- Platform-specific compiler flags 