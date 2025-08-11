# Clara Build Variants

This document explains the different build variants available for Clara Electron app on Windows.

## Build Variants

### 1. Full Build (`electron:clean-build-win-full`)
- **Includes**: All llamaCpp binaries for all platforms
- **Services**: All files from `electron/services` folder
- **Use case**: Complete distribution with all features
- **Command**: `npm run electron:clean-build-win-full`

### 2. Barebone Build (`electron:clean-build-win-barebone`)
- **Includes**: llamaCpp binaries except specific Windows variants
- **Excludes**: 
  - `win32-x64-cpu`
  - `win32-x64-cuda` 
  - `win32-x64-rocm`
  - `win32-x64-vulkan`
- **Services**: All files from `electron/services` folder (always included)
- **Use case**: Smaller distribution size, missing some Windows-specific optimizations
- **Command**: `npm run electron:clean-build-win-barebone`
- **Artifact naming**: Will be named `Clara-{version}-barebone.exe`

### 3. Legacy Build (`electron:clean-build-win`)
- **Behavior**: Same as full build (maintains backward compatibility)
- **Command**: `npm run electron:clean-build-win`

## Services Folder

The `electron/services` folder contains important binaries and is **always included** in all build variants:

- `llama-optimizer-windows.exe`
- `python-mcp-server-windows.exe`
- `widgets-service-windows.exe`
- Other platform-specific service binaries

## Build Scripts

The build system uses these helper scripts:

- `scripts/build-config.cjs`: Configures package.json for different variants
- `scripts/cleanup-barebone.cjs`: Resets configuration after barebone build
- `scripts/cleanup-win.cjs`: General Windows cleanup (existing)

## Usage Examples

```bash
# Build full version with all binaries
npm run electron:clean-build-win-full

# Build barebone version (smaller size)
npm run electron:clean-build-win-barebone

# Legacy build (same as full)
npm run electron:clean-build-win
```

## Technical Details

- The build system dynamically modifies `package.json` before building
- Configuration is automatically reset after each build
- Services folder is always included via both global and Windows-specific `extraResources`
- Barebone builds use file filters to exclude specific llamaCpp binary folders
