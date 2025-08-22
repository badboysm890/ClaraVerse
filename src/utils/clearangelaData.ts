import { angelaDB } from '../db/angelaDatabase';

/**
 * Utility to clear all angela chat data
 * This will permanently delete all chat sessions, messages, and files
 */
export async function clearAllangelaData(): Promise<boolean> {
  try {
    // Get current stats before clearing
    const stats = await angelaDB.getangelaStorageStats();
    
    console.log('Current angela data:', stats);
    
    // Clear IndexedDB angela data
    await angelaDB.clearAllangelaSessions();
    
    // Clear localStorage angela data
    const angelaKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.includes('angela') || 
        key.includes('angela') ||
        key === 'angela_interpreter_session' ||
        key === 'angela_provider_configs'
      )) {
        angelaKeys.push(key);
      }
    }
    
    // Remove all angela-related localStorage items
    angelaKeys.forEach(key => {
      localStorage.removeItem(key);
      console.log(`Removed localStorage item: ${key}`);
    });
    
    // Clear sessionStorage as well
    const angelaSessionKeys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (
        key.includes('angela') || 
        key.includes('angela')
      )) {
        angelaSessionKeys.push(key);
      }
    }
    
    angelaSessionKeys.forEach(key => {
      sessionStorage.removeItem(key);
      console.log(`Removed sessionStorage item: ${key}`);
    });
    
    console.log(`Successfully cleared ${stats.totalSessions} sessions, ${stats.totalMessages} messages, and ${stats.totalFiles} files`);
    console.log(`Cleared ${angelaKeys.length} localStorage items and ${angelaSessionKeys.length} sessionStorage items`);
    
    return true;
  } catch (error) {
    console.error('Failed to clear angela data:', error);
    return false;
  }
}

/**
 * Clear angela data with user confirmation (browser only)
 */
export async function clearangelaDataWithConfirmation(): Promise<boolean> {
  try {
    const stats = await angelaDB.getangelaStorageStats();
    
    const confirmMessage = `This will permanently delete:\n` +
                         `• ${stats.totalSessions} chat sessions\n` +
                         `• ${stats.totalMessages} messages\n` +
                         `• ${stats.totalFiles} files\n` +
                         `• All localStorage/sessionStorage angela data\n\n` +
                         `Are you sure you want to continue?`;

    if (confirm(confirmMessage)) {
      const success = await clearAllangelaData();
      if (success) {
        alert('angela chat data cleared successfully!\n\nThe page will reload to refresh the UI.');
        // Add a small delay before reload to ensure all operations complete
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        alert('Failed to clear angela chat data. Check console for details.');
      }
      return success;
    }
    
    return false;
  } catch (error) {
    console.error('Error in clearangelaDataWithConfirmation:', error);
    alert('Error clearing data. Check console for details.');
    return false;
  }
}

/**
 * Emergency clear function - clears everything and forces reload
 * Use this if the normal clear doesn't work
 */
export async function emergencyClearangelaData(): Promise<void> {
  try {
    console.log('🚨 Emergency angela data clear initiated...');
    
    // Force clear IndexedDB by deleting the entire database
    if (typeof indexedDB !== 'undefined') {
      const deleteRequest = indexedDB.deleteDatabase('angela_db');
      deleteRequest.onsuccess = () => console.log('IndexedDB angela_db deleted');
      deleteRequest.onerror = () => console.log('Failed to delete IndexedDB angela_db');
    }
    
    // Clear all localStorage
    localStorage.clear();
    console.log('localStorage cleared');
    
    // Clear all sessionStorage
    sessionStorage.clear();
    console.log('sessionStorage cleared');
    
    alert('Emergency clear completed. The page will reload.');
    window.location.reload();
    
  } catch (error) {
    console.error('Emergency clear failed:', error);
    alert('Emergency clear failed. Try manually refreshing the page.');
  }
}

// Make it available globally for easy access from browser console
if (typeof window !== 'undefined') {
  (window as any).clearangelaData = clearangelaDataWithConfirmation;
  (window as any).clearangelaDataNow = clearAllangelaData;
  (window as any).emergencyClearangela = emergencyClearangelaData;
} 
