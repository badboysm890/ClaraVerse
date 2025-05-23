import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db, Provider } from '../db';

interface ProvidersContextType {
  providers: Provider[];
  primaryProvider: Provider | null;
  loading: boolean;
  addProvider: (provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateProvider: (id: string, updates: Partial<Provider>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  setPrimaryProvider: (id: string) => Promise<void>;
  refreshProviders: () => Promise<void>;
}

const ProvidersContext = createContext<ProvidersContextType | undefined>(undefined);

export const useProviders = () => {
  const context = useContext(ProvidersContext);
  if (context === undefined) {
    throw new Error('useProviders must be used within a ProvidersProvider');
  }
  return context;
};

interface ProvidersProviderProps {
  children: ReactNode;
}

export const ProvidersProvider: React.FC<ProvidersProviderProps> = ({ children }) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [primaryProvider, setPrimaryProviderState] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProviders = async () => {
    try {
      setLoading(true);
      const allProviders = await db.getAllProviders();
      setProviders(allProviders);
      
      const primary = await db.getPrimaryProvider();
      setPrimaryProviderState(primary);
    } catch (error) {
      console.error('Error refreshing providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const addProvider = async (provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const id = await db.addProvider(provider);
      await refreshProviders();
      return id;
    } catch (error) {
      console.error('Error adding provider:', error);
      // Re-throw the error so the UI can handle it
      throw error;
    }
  };

  const updateProvider = async (id: string, updates: Partial<Provider>) => {
    await db.updateProvider(id, updates);
    await refreshProviders();
  };

  const deleteProvider = async (id: string) => {
    await db.deleteProvider(id);
    await refreshProviders();
  };

  const setPrimaryProvider = async (id: string) => {
    await db.setPrimaryProvider(id);
    await refreshProviders();
  };

  useEffect(() => {
    const initializeProviders = async () => {
      await db.initializeDefaultProviders();
      await refreshProviders();
    };

    initializeProviders();
  }, []);

  const value: ProvidersContextType = {
    providers,
    primaryProvider,
    loading,
    addProvider,
    updateProvider,
    deleteProvider,
    setPrimaryProvider,
    refreshProviders
  };

  return (
    <ProvidersContext.Provider value={value}>
      {children}
    </ProvidersContext.Provider>
  );
}; 