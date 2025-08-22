import React from 'react';
import { Info, XCircle, Shield } from 'lucide-react';

interface PrivacyWidgetProps {
  id: string;
  onRemove: (id: string) => void;
}

const PrivacyWidget: React.FC<PrivacyWidgetProps> = ({ id, onRemove }) => {
  return (
    <div className="glassmorphic p-3 sm:p-4 h-full flex flex-col group relative">
      <button
        className="absolute top-2 right-2 sm:top-3 sm:right-3 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onRemove(id)}
        aria-label="Remove widget"
      >
        <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
      
      <div className="flex flex-row h-full">
        <div className="flex flex-shrink-0 items-start pr-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 sm:p-2 rounded-lg bg-blue-100 dark:bg-blue-500/20">
              <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Privacy Notice
            </h3>
          </div>
        </div>
        
        <div className="flex-grow overflow-hidden flex flex-row">
          <div className="flex-1 px-4 border-l border-gray-200 dark:border-gray-700/30">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Local Processing</h4>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
              angela processes your data locally on your device whenever possible, keeping your information private and secure.
            </p>
          </div>
          
          <div className="flex-1 px-4 border-l border-gray-200 dark:border-gray-700/30">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">End-to-End Encryption</h4>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
              When data must be transmitted, angela uses end-to-end encryption to protect your information.
            </p>
          </div>
          
          <div className="flex-1 px-4 border-l border-gray-200 dark:border-gray-700/30">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Your Control</h4>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
              You maintain control of your data at all times. Manage your privacy settings in the Settings menu.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyWidget; 
