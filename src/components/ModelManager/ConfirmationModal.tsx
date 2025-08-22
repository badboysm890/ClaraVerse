import React, { useState } from 'react';
import { HardDrive, Loader } from 'lucide-react';
import { Confirmation } from './types';

interface ConfirmationModalProps {
  confirmation: Confirmation | null;
  onClose: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ confirmation, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  
  if (!confirmation) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-lg shadow-2xl">
        <div className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center flex-shrink-0">
              <HardDrive className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {confirmation.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {confirmation.message}
              </p>
              
              {/* Model details */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Found {confirmation.modelCount || 0} model(s) in:
                  </span>
                </div>
                <div className="text-xs font-mono text-gray-600 dark:text-gray-400 mb-3 break-all">
                  {confirmation.selectedPath}
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {confirmation.modelNames?.map((name, index) => (
                    <div key={index} className="text-sm text-gray-700 dark:text-gray-300 font-mono bg-white/50 dark:bg-gray-800/50 px-2 py-1 rounded">
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => {
                confirmation.onCancel();
                onClose();
              }}
              disabled={isLoading}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (confirmation.onConfirm) {
                  setIsLoading(true);
                  try {
                    await confirmation.onConfirm();
                    onClose();
                  } catch (error) {
                    console.error('Error confirming directory selection:', error);
                    // Don't close modal on error so user can see what happened
                  } finally {
                    setIsLoading(false);
                  }
                }
              }}
              disabled={isLoading}
              className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Setting Directory...
                </>
              ) : (
                'Use This Directory'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal; 
