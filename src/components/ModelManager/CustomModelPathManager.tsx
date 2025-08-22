import React, { useState, useEffect } from 'react';
import { HardDrive, Download } from 'lucide-react';
import { useProviders } from '../../contexts/ProvidersContext';
import { Confirmation, Notification } from './types';

interface CustomModelPathManagerProps {
  onNotification: (notification: Notification) => void;
  onConfirmation: (confirmation: Confirmation) => void;
}

const CustomModelPathManager: React.FC<CustomModelPathManagerProps> = ({ 
  onNotification, 
  onConfirmation 
}) => {
  const [isSettingCustomPath, setIsSettingCustomPath] = useState(false);
  
  // Initialize downloadToCustomPath directly from localStorage to avoid race condition
  const [downloadToCustomPath, setDownloadToCustomPath] = useState(() => {
    try {
      const savedSetting = localStorage.getItem('downloadToCustomPath');
      console.log('Initializing download setting from localStorage:', savedSetting);
      return savedSetting ? JSON.parse(savedSetting) : false;
    } catch (error) {
      console.error('Error initializing download setting from localStorage:', error);
      return false;
    }
  });
  
  const { customModelPath, setCustomModelPath } = useProviders();

  // Save download setting to localStorage whenever it changes
  useEffect(() => {
    try {
      console.log('Saving download setting to localStorage:', downloadToCustomPath);
      localStorage.setItem('downloadToCustomPath', JSON.stringify(downloadToCustomPath));
      // Also save to sessionStorage as backup
      sessionStorage.setItem('downloadToCustomPath', JSON.stringify(downloadToCustomPath));
    } catch (error) {
      console.error('Error saving download setting to localStorage:', error);
    }
  }, [downloadToCustomPath]);

  // Handler for folder picker (Electron only)
  const handlePickCustomModelPath = async () => {
    // @ts-expect-error Electron dialog is injected by preload and not typed
    if (window.electron && window.electron.dialog) {
      try {
        // @ts-expect-error Electron dialog is injected by preload and not typed
        const result = await window.electron.dialog.showOpenDialog({
          properties: ['openDirectory']
        });
        
        if (result && result.filePaths && result.filePaths[0]) {
          const selectedPath = result.filePaths[0];
          
          // Show loading only when we have a selected directory
          setIsSettingCustomPath(true);
          
          // First, scan for models in the selected path
          if (window.llamaSwap?.scanCustomPathModels) {
            const scanResult = await window.llamaSwap.scanCustomPathModels(selectedPath);
            
            if (scanResult.success && scanResult.models && scanResult.models.length > 0) {
              // Models found, show confirmation dialog with model details
              // Create detailed model information
              const folderGroups = scanResult.models.reduce((acc: any, model: any) => {
                const folder = model.folderHint || 'root folder';
                if (!acc[folder]) acc[folder] = [];
                acc[folder].push(model.file);
                return acc;
              }, {});
              
              const folderSummary = Object.entries(folderGroups)
                .map(([folder, models]: [string, any]) => `${models.length} in ${folder}`)
                .join(', ');
              
              onConfirmation({
                title: 'Confirm Model Directory',
                message: scanResult.models.length === 1 
                  ? 'Found 1 model. Do you want to use this folder as your custom model directory?'
                  : `Found ${scanResult.models.length} models${Object.keys(folderGroups).length > 1 ? ` (${folderSummary})` : ''}. Do you want to use this folder as your custom model directory?`,
                modelCount: scanResult.models.length,
                modelNames: scanResult.models.map((m: any) => m.file),
                selectedPath,
                onConfirm: async () => {
                  // Set the custom model path
                  await setCustomModelPath(selectedPath);
                  
                  // Show detailed success notification
                  const successMessage = scanResult.models.length === 1
                    ? 'Found 1 model that will be available for use.'
                    : `Found ${scanResult.models.length} models${Object.keys(folderGroups).length > 1 ? ` across ${Object.keys(folderGroups).length} folders` : ''} that will be available for use.`;
                  
                  onNotification({
                    type: 'success',
                    title: 'Directory Set Successfully',
                    message: successMessage
                  });
                },
                onCancel: () => {}
              });
            } else if (scanResult.success && (!scanResult.models || scanResult.models.length === 0)) {
              // No models found, ask user if they still want to use this directory
              onConfirmation({
                title: 'No Models Found',
                message: 'No GGUF models found in this directory. Do you still want to select it?',
                modelCount: 0,
                modelNames: ['You can add models to this directory later.'],
                selectedPath,
                onConfirm: async () => {
                  // Set the custom model path even though no models found
                  await setCustomModelPath(selectedPath);
                  
                  // Show success notification
                  onNotification({
                    type: 'success',
                    title: 'Directory Set Successfully',
                    message: 'Custom model directory has been set. You can now download or copy models to this location.'
                  });
                },
                onCancel: () => {}
              });
            } else {
              // Scan failed
              onNotification({
                type: 'error',
                title: 'Scan Error',
                message: `Error scanning folder for models: ${scanResult.error || 'Unknown error'}`
              });
            }
          } else {
            // Fallback: just set the path without scanning
            await setCustomModelPath(selectedPath);
            onNotification({
              type: 'success',
              title: 'Directory Set',
              message: 'Custom model directory has been set successfully.'
            });
          }
        }
      } catch (error) {
        console.error('Error setting custom model path:', error);
        onNotification({
          type: 'error',
          title: 'Setup Error',
          message: 'An error occurred while setting the custom model directory.'
        });
      } finally {
        setIsSettingCustomPath(false);
      }
    } else {
      onNotification({
        type: 'info',
        title: 'Desktop App Required',
        message: 'Folder picker is only available in the desktop app.'
      });
    }
  };

  // Handler to clear custom path
  const handleClearCustomModelPath = async () => {
    await setCustomModelPath(null);
  };

  // Handler to manually toggle and verify persistence
  const handleDownloadToggle = (checked: boolean) => {
    console.log('Manual toggle to:', checked);
    setDownloadToCustomPath(checked);
  };

  return (
    <div className="glassmorphic rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <HardDrive className="w-6 h-6 text-sakura-500" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Custom Model Directory
        </h2>
        <button
          onClick={handlePickCustomModelPath}
          disabled={isSettingCustomPath}
          className="px-3 py-1 bg-sakura-500 text-white rounded hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm flex items-center gap-2"
        >
          {isSettingCustomPath && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
          {isSettingCustomPath ? 'Setting up...' : (customModelPath ? 'Change Folder' : 'Set Folder')}
        </button>
        {customModelPath && !isSettingCustomPath && (
          <button
            onClick={handleClearCustomModelPath}
            className="px-2 py-1 ml-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-xs"
          >
            Clear
          </button>
        )}
      </div>
      
      {isSettingCustomPath ? (
        <div className="flex items-center gap-3 p-4 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border border-blue-200/50 dark:border-blue-700/50">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Loading models from custom directory</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Scanning for .gguf model files...</p>
          </div>
        </div>
      ) : customModelPath ? (
        <div className="space-y-4">
          <div className="text-xs text-gray-600 dark:text-gray-300 break-all">
            <span>Current: </span>
            <span className="font-mono">{customModelPath}</span>
          </div>
          
          {/* Download to Custom Path Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50/50 dark:bg-gray-700/30 rounded-lg border border-gray-200/50 dark:border-gray-600/50">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Download className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Download New Models Here
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                When enabled, new model downloads will be saved to your custom directory instead of the default location
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                checked={downloadToCustomPath}
                onChange={(e) => handleDownloadToggle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sakura-300 dark:peer-focus:ring-sakura-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-sakura-600"></div>
            </label>
          </div>
          
          {downloadToCustomPath && (
            <div className="p-3 bg-green-50/50 dark:bg-green-900/20 rounded-lg border border-green-200/50 dark:border-green-700/50">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <div className="w-4 h-4">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                <span className="text-sm font-medium">
                  New downloads will be saved to custom directory
                </span>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 ml-6">
                Downloaded models will appear in both your library and be available for use immediately
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-500 dark:text-gray-400">No custom model directory set. Using default location.</div>
      )}
    </div>
  );
};

export default CustomModelPathManager; 
