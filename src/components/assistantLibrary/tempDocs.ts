// Temporary document management utilities for Assistant

export interface TemporaryDocument {
  id: string;
  name: string;
  collection: string;
  timestamp: number;
}

export const MAX_TEMP_COLLECTIONS = 5;

export const getNextTempCollectionName = (
  tempCollectionNames: string[]
): string => {
  const stored = localStorage.getItem('current_temp_collection_index');
  const currentIndex = stored ? parseInt(stored) : 0;
  const nextIndex = (currentIndex + 1) % MAX_TEMP_COLLECTIONS;
  localStorage.setItem('current_temp_collection_index', nextIndex.toString());
  return tempCollectionNames[nextIndex];
};

export const cleanupTempCollection = async (
  collectionName: string,
  pythonPort: number | null
) => {
  if (!pythonPort) return;
  try {
    await fetch(`http://0.0.0.0:${pythonPort}/collections/${collectionName}`, {
      method: 'DELETE',
    });
    console.log(`Successfully cleaned up collection: ${collectionName}`);
  } catch (error) {
    console.error('Error cleaning up temporary collection:', error);
  }
};

export const cleanupAllTempCollections = async (
  tempCollectionNames: string[],
  pythonPort: number | null
) => {
  if (!pythonPort) return;
  for (const collectionName of tempCollectionNames) {
    await cleanupTempCollection(collectionName, pythonPort);
  }
}; 
