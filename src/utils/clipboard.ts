/**
 * Unified clipboard utility that works with both Electron and browser environments
 */

// Type guard to check if we're in an Electron environment
const isElectronEnvironment = (): boolean => {
  return typeof window !== 'undefined' && 
         'electron' in window && 
         window.electron !== null &&
         typeof window.electron === 'object';
};

// Type guard to check if Electron clipboard is available
const hasElectronClipboard = (): boolean => {
  return isElectronEnvironment() && 
         'clipboard' in (window as any).electron &&
         typeof (window as any).electron.clipboard === 'object' &&
         typeof (window as any).electron.clipboard.writeText === 'function';
};

/**
 * Copy text to clipboard using the best available method
 * @param text - The text to copy
 * @returns Promise<boolean> - Success status
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    // Try to use Electron's clipboard API first (most reliable in Electron apps)
    if (hasElectronClipboard()) {
      (window as any).electron.clipboard.writeText(text);
      return true;
    }
    
    // Try browser clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    
    // Fallback to legacy method
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    return successful;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
};

/**
 * Read text from clipboard using the best available method
 * @returns Promise<string> - The clipboard text
 */
export const readFromClipboard = async (): Promise<string> => {
  try {
    // Try to use Electron's clipboard API first
    if (hasElectronClipboard() && typeof (window as any).electron.clipboard.readText === 'function') {
      return (window as any).electron.clipboard.readText();
    }
    
    // Try browser clipboard API
    if (navigator.clipboard && navigator.clipboard.readText) {
      return await navigator.clipboard.readText();
    }
    
    // No fallback for reading clipboard in browsers without permission
    throw new Error('Clipboard read not supported');
  } catch (error) {
    console.error('Failed to read from clipboard:', error);
    return '';
  }
};

/**
 * Check if clipboard operations are supported
 * @returns boolean - Whether clipboard operations are available
 */
export const isClipboardSupported = (): boolean => {
  return hasElectronClipboard() || !!(navigator.clipboard);
}; 
