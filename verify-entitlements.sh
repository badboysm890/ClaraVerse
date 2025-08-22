#!/bin/bash

# Path to the app (adjust as needed)
APP_PATH="./release/mac-universal/angela.app"

if [ ! -d "$APP_PATH" ]; then
  echo "Error: App not found at $APP_PATH"
  exit 1
fi

echo "==== Verifying entitlements in app bundle ===="

# Check main app executable
MAIN_EXEC="$APP_PATH/Contents/MacOS/angela"
echo "Checking main executable: $MAIN_EXEC"
codesign -d --entitlements :- "$MAIN_EXEC" | grep -i 'audio\|microphone'

# Check frameworks (including Electron)
echo "Checking frameworks..."
find "$APP_PATH/Contents/Frameworks" -type f -name "*.dylib" -o -name "*.so" -o -name "Electron Framework" | while read -r file; do
  echo "Checking: $file"
  codesign -d --entitlements :- "$file" | grep -i 'audio\|microphone'
done

echo "==== Verification complete ===="
