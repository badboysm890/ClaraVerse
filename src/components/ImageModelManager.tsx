import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Download, Settings, Star, Eye, Heart, Filter, RefreshCw, Key, X, CheckCircle, HardDrive, Calendar, Trash2 } from 'lucide-react';

// Simple HTML sanitizer to prevent XSS while allowing basic formatting
const sanitizeHTML = (html: string): string => {
  // Basic sanitization - remove script tags and dangerous attributes
  let sanitized = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '');
  
  // Ensure external links open in new tab and have proper rel attributes
  sanitized = sanitized.replace(/<a\s+([^>]*href="[^"]*"[^>]*)>/gi, (_match, attrs) => {
    if (!attrs.includes('target=')) {
      attrs += ' target="_blank"';
    }
    if (!attrs.includes('rel=')) {
      attrs += ' rel="noopener noreferrer"';
    }
    return `<a ${attrs}>`;
  });
  
  return sanitized;
};

// CivitAI Model Interfaces
interface ModelInfo {
  id: string;
  name: string;
  description: string;
  creator: string;
  type: 'checkpoint' | 'lora' | 'vae' | 'controlnet' | 'upscaler' | 'embedding';
  tags: string[];
  stats: {
    downloads: number;
    likes: number;
    rating: number;
  };
  images: string[];
  versions: ModelVersion[];
  source: 'civitai';
  nsfw: boolean;
}

interface ModelVersion {
  id: string;
  name: string;
  baseModel: string;
  files: ModelFile[];
  downloadUrl?: string;
}

interface ModelFile {
  name: string;
  url: string;
  sizeKB: number;
  type: string;
  metadata: {
    fp?: string;
    size?: string;
    format?: string;
  };
}

interface DownloadProgress {
  filename?: string;
  fileName?: string; // Support both naming conventions
  progress: number;
  downloadedSize: number;
  totalSize: number;
  speed?: string;
  eta?: string;
  error?: string;
  completed?: boolean;
  modelType?: string;
}

interface ApiKeys {
  civitai?: string;
  huggingface?: string;
}

interface SearchCache {
  query: string;
  types: string[];
  sortBy: string;
  results: ModelInfo[];
  timestamp: number;
  nsfw: boolean;
}

interface TrendingModels {
  models: ModelInfo[];
  timestamp: number;
}

interface ImageModelManagerProps {
  onClose: () => void;
}

const ImageModelManager: React.FC<ImageModelManagerProps> = ({ onClose }) => {
  // State
  const [activeTab, setActiveTab] = useState<'discover' | 'library'>('discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [downloads, setDownloads] = useState<DownloadProgress[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('Highest Rated');
  const [searchResults, setSearchResults] = useState<ModelInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [showNSFW, setShowNSFW] = useState(false);
  const [localModels, setLocalModels] = useState<Record<string, any[]>>({});
  const [searchCache, setSearchCache] = useState<SearchCache[]>([]);
  const [trendingModels, setTrendingModels] = useState<TrendingModels | null>(null);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const modelTypes = [
    { value: 'checkpoint', label: 'Checkpoint', civitai: 'Checkpoint' },
    { value: 'lora', label: 'LoRA', civitai: 'LORA' },
    { value: 'vae', label: 'VAE', civitai: 'VAE' },
    { value: 'controlnet', label: 'ControlNet', civitai: 'Controlnet' },
    { value: 'upscaler', label: 'Upscaler', civitai: 'Upscaler' },
    { value: 'embedding', label: 'Embedding', civitai: 'TextualInversion' }
  ];

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      await loadApiKeys();
      await loadLocalModels();
      // Load trending after API keys to get better results
      setTimeout(() => loadTrendingModels(), 500);
    };
    
    loadData();
    
    // Set up download progress listeners for CivitAI
    const unsubscribeProgress = window.modelManager?.onComfyUILocalDownloadProgress?.(handleDownloadProgress);
    const unsubscribeComplete = window.modelManager?.onComfyUILocalDownloadComplete?.(handleDownloadComplete);
    const unsubscribeError = window.modelManager?.onComfyUILocalDownloadError?.(handleDownloadError);
    
    return () => {
      unsubscribeProgress?.();
      unsubscribeComplete?.();
      unsubscribeError?.();
    };
  }, []);

  // Reload trending when API key changes
  useEffect(() => {
    if (apiKeys.civitai) {
      // Reload trending models with API key for better access
      loadTrendingModels();
    }
  }, [apiKeys.civitai]);

  const loadApiKeys = useCallback(async () => {
    try {
      const keys = await window.modelManager?.getApiKeys?.();
      setApiKeys(keys || {});
      if (keys?.civitai) {
        console.log('🔑 API key loaded from storage');
      }
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  }, []);

  const saveApiKeys = useCallback(async (keys: ApiKeys) => {
    try {
      await window.modelManager?.saveApiKeys?.(keys);
      setApiKeys(keys);
      console.log('✅ API keys saved successfully');
    } catch (error) {
      console.error('Failed to save API keys:', error);
    }
  }, []);

  const loadLocalModels = useCallback(async () => {
    try {
      // Load models from all categories using the new local system
      const categories = ['checkpoints', 'loras', 'vae', 'controlnet', 'upscale_models', 'embeddings'];
      const allModels: Record<string, any[]> = {};
      
      for (const category of categories) {
        try {
          const result = await window.modelManager?.comfyuiLocalListModels?.(category);
          if (result?.success) {
            allModels[category] = result.models || [];
          } else {
            allModels[category] = [];
          }
        } catch (error) {
          console.error(`Failed to load ${category} models:`, error);
          allModels[category] = [];
        }
      }
      
      setLocalModels(allModels);
    } catch (error) {
      console.error('Failed to load local models:', error);
    }
  }, []);

  const loadTrendingModels = useCallback(async () => {
    // Check if we have recent trending data (cache for 30 minutes)
    const now = Date.now();
    if (trendingModels && (now - trendingModels.timestamp) < 30 * 60 * 1000) {
      return;
    }

    setIsLoadingTrending(true);
    try {
      // Load trending models on startup for instant engagement using enhanced search
      const response = await window.modelManager?.searchCivitAI?.(
        '', // Empty query for trending
        [], // All types
        'Most Downloaded', // Get the most popular
        apiKeys.civitai, // Pass API key if available
        false // Don't include NSFW in trending by default
      );
      
      if (response?.items) {
        const trending = response.items.slice(0, 15).map((item: any) => ({
          id: item.id.toString(),
          name: item.name,
          description: item.description || '',
          creator: item.creator?.username || 'Unknown',
          type: item.type?.toLowerCase() === 'textualinversion' ? 'embedding' : item.type?.toLowerCase() || 'checkpoint',
          tags: item.tags || [],
          stats: {
            downloads: item.stats?.downloadCount || 0,
            likes: item.stats?.favoriteCount || 0,
            rating: item.stats?.rating || 0
          },
          images: item.modelVersions?.[0]?.images?.map((img: any) => img.url) || [],
          versions: item.modelVersions?.map((version: any) => ({
            id: version.id.toString(),
            name: version.name,
            baseModel: version.baseModel || '',
            files: version.files?.map((file: any) => ({
              name: file.name,
              url: file.downloadUrl,
              sizeKB: Math.round((file.sizeKB || 0)),
              type: file.type || '',
              metadata: {
                fp: file.metadata?.fp,
                size: file.metadata?.size,
                format: file.metadata?.format
              }
            })) || []
          })) || [],
          source: 'civitai' as const,
          nsfw: item.nsfw || false,
          relevanceScore: item._relevanceScore || 0
        })).filter((model: ModelInfo) => !model.nsfw); // Keep trending SFW by default

        setTrendingModels({
          models: trending,
          timestamp: now
        });
        
        // Show trending models if no search has been performed
        if (!hasSearched) {
          setSearchResults(trending);
        }
        
        console.log(`✨ Loaded ${trending.length} trending models with enhanced search`);
      }
    } catch (error) {
      console.error('Failed to load trending models:', error);
    } finally {
      setIsLoadingTrending(false);
    }
  }, [apiKeys.civitai, trendingModels, hasSearched]);

  const getCachedSearch = useCallback((query: string, types: string[], sortBy: string, nsfw: boolean): ModelInfo[] | null => {
    const cacheKey = `${query}-${types.join(',')}-${sortBy}-${nsfw}`;
    const cached = searchCache.find(cache => 
      `${cache.query}-${cache.types.join(',')}-${cache.sortBy}-${cache.nsfw}` === cacheKey &&
      (Date.now() - cache.timestamp) < 10 * 60 * 1000 // 10 minutes cache
    );
    return cached?.results || null;
  }, [searchCache]);

  const setCachedSearch = useCallback((query: string, types: string[], sortBy: string, nsfw: boolean, results: ModelInfo[]) => {
    const newCache: SearchCache = {
      query,
      types,
      sortBy,
      nsfw,
      results,
      timestamp: Date.now()
    };
    
    setSearchCache(prev => {
      // Keep only last 20 searches
      const filtered = prev.filter(cache => (Date.now() - cache.timestamp) < 30 * 60 * 1000);
      return [newCache, ...filtered.slice(0, 19)];
    });
  }, []);

  const handleDownloadError = (data: { filename: string; error: string }) => {
    console.error(`❌ Download error for ${data.filename}:`, data.error);
    
    setDownloads(prev => 
      prev.map(d => 
        (d.filename || d.fileName) === data.filename 
          ? { 
              ...d, 
              error: data.error, 
              progress: 0,
              completed: false 
            }
          : d
      )
    );

    // Show user-friendly error message with specific guidance
    let userMessage = `Download failed for ${data.filename}`;
    
    if (data.error.includes('HTTP 401') || data.error.includes('Unauthorized')) {
      userMessage = 'API key required for download. Click Settings → Add CivitAI API key';
      setNotification({ 
        message: userMessage, 
        type: 'error' 
      });
    } else if (data.error.includes('HTTP 403') || data.error.includes('Forbidden')) {
      userMessage = 'Access forbidden. Check your API key or account permissions.';
      setNotification({ 
        message: userMessage, 
        type: 'error' 
      });
    } else if (data.error.includes('HTTP 404') || data.error.includes('Not Found')) {
      userMessage = 'Model file not found. The download link may be expired.';
      setNotification({ 
        message: userMessage, 
        type: 'error' 
      });
    } else if (data.error.includes('network') || data.error.includes('timeout')) {
      userMessage = 'Network connection issue. Please check your internet connection.';
      setNotification({ 
        message: userMessage, 
        type: 'error' 
      });
    } else {
      userMessage = `Download failed: ${data.error}`;
      setNotification({ 
        message: userMessage, 
        type: 'error' 
      });
    }

    // Auto-hide notification after 5 seconds
    setTimeout(() => {
      setNotification(null);
    }, 5000);

    // Also show detailed alert for API key errors
    if (data.error.includes('HTTP 401') || data.error.includes('Unauthorized')) {
      const detailedMessage = `Download failed for ${data.filename}\n\nThis model requires an API key for download. Please:\n• Click the "Settings" button above\n• Add your CivitAI API key\n• Then try downloading again\n\nTo get a CivitAI API key:\n1. Go to civitai.com\n2. Create an account or sign in\n3. Go to Account Settings → API Keys\n4. Generate a new API key`;
      setTimeout(() => {
        alert(detailedMessage);
      }, 100);
    }
  };

  const handleDownloadProgress = (progress: DownloadProgress) => {
    setDownloads(prev => {
      const filename = progress.filename || progress.fileName || '';
      const existing = prev.find(d => (d.filename || d.fileName) === filename);
      if (existing) {
        return prev.map(d => (d.filename || d.fileName) === filename ? { ...d, ...progress } : d);
      } else {
        return [...prev, progress];
      }
    });
  };

  const handleDownloadComplete = (data: { filename: string; category: string; localPath: string; containerPath: string; size: number }) => {
    setDownloads(prev => 
      prev.map(d => 
        (d.filename || d.fileName) === data.filename 
          ? { ...d, completed: true, progress: 100, modelType: data.category }
          : d
      )
    );
    
    console.log(`✅ Model downloaded to persistent storage: ${data.filename} -> ${data.localPath}`);
    
    // Show success notification
    setNotification({
      message: `✅ ${data.filename} downloaded successfully`,
      type: 'success'
    });
    
    // Auto-hide success notification after 3 seconds
    setTimeout(() => {
      setNotification(null);
    }, 3000);
    
    // Refresh local models after successful download
    setTimeout(() => {
      loadLocalModels();
    }, 1000);
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    
    // Mark that user has performed a search
    setHasSearched(true);
    
    // Check cache first for instant results
    const cachedResults = getCachedSearch(searchQuery, selectedTypes, sortBy, showNSFW);
    if (cachedResults) {
      setSearchResults(cachedResults);
      return;
    }
    
    setIsSearching(true);
    try {
      let results: any[] = [];
      
      const civitaiTypes = selectedTypes.map(type => {
        const modelType = modelTypes.find(mt => mt.value === type);
        return modelType?.civitai || type;
      });
      
      // Enhanced search with API key integration and improved parameters
      const response = await window.modelManager?.searchCivitAI?.(
        searchQuery.trim(),
        civitaiTypes,
        sortBy,
        apiKeys.civitai, // Pass API key for better access and NSFW content
        showNSFW // Pass NSFW setting
      );
      
      if (response?.items) {
        results = response.items.map((item: any) => ({
          id: item.id.toString(),
          name: item.name,
          description: item.description || '',
          creator: item.creator?.username || 'Unknown',
          type: item.type?.toLowerCase() === 'textualinversion' ? 'embedding' : item.type?.toLowerCase() || 'checkpoint',
          tags: item.tags || [],
          stats: {
            downloads: item.stats?.downloadCount || 0,
            likes: item.stats?.favoriteCount || 0,
            rating: item.stats?.rating || 0
          },
          images: item.modelVersions?.[0]?.images?.map((img: any) => img.url) || [],
          versions: item.modelVersions?.map((version: any) => ({
            id: version.id.toString(),
            name: version.name,
            baseModel: version.baseModel || '',
            files: version.files?.map((file: any) => ({
              name: file.name,
              url: file.downloadUrl,
              sizeKB: Math.round((file.sizeKB || 0)),
              type: file.type || '',
              metadata: {
                fp: file.metadata?.fp,
                size: file.metadata?.size,
                format: file.metadata?.format
              }
            })) || []
          })) || [],
          source: 'civitai' as const,
          nsfw: item.nsfw || false,
          relevanceScore: item._relevanceScore || 0
        })).filter((model: ModelInfo) => showNSFW || !model.nsfw);
        
        // Additional client-side filtering for better relevance
        const queryLower = searchQuery.toLowerCase();
        results = results.map((model: any) => {
          let relevanceBoost = 0;
          
          // Boost exact name matches
          if (model.name.toLowerCase().includes(queryLower)) {
            relevanceBoost += 20;
          }
          
          // Boost creator matches
          if (model.creator.toLowerCase().includes(queryLower)) {
            relevanceBoost += 15;
          }
          
          // Boost tag matches
          if (model.tags.some((tag: string) => tag.toLowerCase().includes(queryLower))) {
            relevanceBoost += 10;
          }
          
          // Boost popular models
          if (model.stats.downloads > 100000) {
            relevanceBoost += 5;
          }
          
          if (model.stats.rating > 4.0) {
            relevanceBoost += 3;
          }
          
          return {
            ...model,
            relevanceScore: (model.relevanceScore || 0) + relevanceBoost
          };
        }).sort((a, b) => b.relevanceScore - a.relevanceScore);
      }
      
      // Cache the results for future searches
      setCachedSearch(searchQuery, selectedTypes, sortBy, showNSFW, results);
      setSearchResults(results);
      
      // Show search success feedback
      if (response?.metadata) {
        console.log(`🔍 Enhanced search completed: ${results.length} results from ${response.metadata.searchStrategies} strategies`);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, selectedTypes, sortBy, showNSFW, apiKeys.civitai, getCachedSearch, setCachedSearch]);

  const handleDownload = useCallback(async (model: ModelInfo, _version: ModelVersion, file: ModelFile) => {
    try {
      const progress: DownloadProgress = {
        filename: file.name,
        progress: 0,
        downloadedSize: 0,
        totalSize: file.sizeKB * 1024,
        modelType: model.type
      };
      
      setDownloads(prev => [...prev, progress]);
      
      // Show user-friendly feedback
      console.log(`🚀 Starting download: ${file.name} (${model.type}) - ${(file.sizeKB * 1024 / 1024 / 1024).toFixed(2)} GB`);
      
      // Determine source and get appropriate API key
      const source = file.url.includes('civitai.com') ? 'civitai' : 
                    file.url.includes('huggingface.co') ? 'huggingface' : 'unknown';
      const apiKey = source === 'civitai' ? apiKeys.civitai : 
                    source === 'huggingface' ? apiKeys.huggingface : undefined;
      
      console.log(`🔑 Using API key for ${source}: ${!!apiKey}`);
      
      await window.modelManager?.comfyuiLocalDownloadModel?.(
        file.url,
        file.name,
        model.type === 'checkpoint' ? 'checkpoints' :
          model.type === 'lora' ? 'loras' :
        model.type === 'vae' ? 'vae' :
        model.type === 'controlnet' ? 'controlnet' :
        model.type === 'upscaler' ? 'upscale_models' :
        model.type === 'embedding' ? 'embeddings' : 'checkpoints',
        apiKey,
        source
      );
      
      console.log(`📥 Download initiated successfully for: ${file.name}`);
    } catch (error) {
      console.error('Download failed:', error);
      
      setDownloads(prev => 
        prev.map(d => 
          (d.filename || d.fileName) === file.name 
            ? { ...d, error: error instanceof Error ? error.message : 'Download failed' }
            : d
        )
      );
    }
  }, [apiKeys]);

  const clearDownloadError = useCallback((filename: string) => {
    setDownloads(prev => prev.filter(d => (d.filename || d.fileName) !== filename));
  }, []);

  const handleDeleteModel = useCallback(async (modelType: string, filename: string) => {
    try {
      await window.modelManager?.comfyuiLocalDeleteModel?.(filename, modelType);
      loadLocalModels();
    } catch (error) {
      console.error('Failed to delete model:', error);
    }
  }, []);

  const clearSearch = () => {
    setSearchQuery('');
    setHasSearched(false);
    setSelectedModel(null);
    // Show trending models when clearing search for instant engagement
    if (trendingModels && trendingModels.models.length > 0) {
      setSearchResults(trendingModels.models);
    } else {
      setSearchResults([]);
      // Load fresh trending if not available
      loadTrendingModels();
    }
  };

  const showTrendingModels = useCallback(() => {
    if (trendingModels && trendingModels.models.length > 0) {
      setSearchResults(trendingModels.models);
      setHasSearched(false);
    } else {
      loadTrendingModels();
    }
  }, [trendingModels, loadTrendingModels]);

  const formatBytes = useCallback((bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const getModelTypeDisplayName = useCallback((type: string) => {
    const typeMap: Record<string, string> = {
      'checkpoints': 'Checkpoints',
      'loras': 'LoRAs', 
      'vae': 'VAEs',
      'controlnet': 'ControlNet',
      'upscale_models': 'Upscalers',
      'embeddings': 'Embeddings'
    };
    return typeMap[type] || type;
  }, []);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50">
      <style>{`
        .model-description {
          line-height: 1.6;
        }
        .model-description p {
          margin-bottom: 0.75rem;
        }
        .model-description p:last-child {
          margin-bottom: 0;
        }
        .model-description strong, .model-description b {
          font-weight: 600;
        }
        .model-description ul, .model-description ol {
          margin: 0.75rem 0;
          padding-left: 1.5rem;
        }
        .model-description li {
          margin-bottom: 0.25rem;
        }
        .model-description a {
          color: #ec4899;
          text-decoration: none;
          font-weight: 500;
        }
        .model-description a:hover {
          text-decoration: underline;
        }
        
        /* Apple-inspired Design System */
        .apple-card {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
          transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        
        .dark .apple-card {
          background: rgba(31, 41, 55, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        
        .apple-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
        }
        
        .dark .apple-card:hover {
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
        }
        
        .action-button {
          transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          transform: translateZ(0);
        }
        
        .action-button:hover {
          transform: translateY(-1px) scale(1.02);
        }
        
        .action-button:active {
          transform: translateY(0) scale(0.98);
        }
        
        .category-pill {
          transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .category-pill:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        
        .stats-badge {
          border-radius: 16px;
          backdrop-filter: blur(10px);
          transition: all 0.2s ease;
        }
        
        .stats-badge:hover {
          transform: scale(1.05);
        }
      `}</style>
      
      {/* Main Container - Apple-style rounded window */}
      <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-white/20 dark:border-gray-700/30 rounded-3xl w-full max-w-7xl h-full max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header - Minimalist Apple style */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200/50 dark:border-gray-700/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-sakura-500 to-sakura-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Model Store</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Discover and manage AI models</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* API Status Indicator */}
            <div className="flex items-center gap-2">
              {apiKeys.civitai ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>Connected</span>
                </div>
              ) : (
                <button
                  onClick={() => setShowApiKeys(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                >
                  <Key className="w-4 h-4" />
                  <span>Connect API</span>
                </button>
              )}
            </div>
            
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Notification Banner */}
        {notification && (
          <div className={`px-6 py-3 border-b border-gray-200/50 dark:border-gray-700/20 ${
            notification.type === 'error' 
              ? 'bg-red-50/80 dark:bg-red-900/20' 
              : notification.type === 'success'
              ? 'bg-green-50/80 dark:bg-green-900/20'
              : 'bg-blue-50/80 dark:bg-blue-900/20'
          }`}>
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-3 text-sm font-medium ${
                notification.type === 'error'
                  ? 'text-red-700 dark:text-red-300'
                  : notification.type === 'success'
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-blue-700 dark:text-blue-300'
              }`}>
                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                  notification.type === 'error'
                    ? 'bg-red-500'
                    : notification.type === 'success'
                    ? 'bg-green-500'
                    : 'bg-blue-500'
                }`}>
                  {notification.type === 'error' ? (
                    <X className="w-3 h-3 text-white" />
                  ) : notification.type === 'success' ? (
                    <CheckCircle className="w-3 h-3 text-white" />
                  ) : (
                    <Settings className="w-3 h-3 text-white" />
                  )}
                </div>
                <span>{notification.message}</span>
              </div>
              <button
                onClick={() => setNotification(null)}
                className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* API Configuration Panel - Apple Card Style */}
        {showApiKeys && (
          <div className="p-6 bg-gradient-to-r from-gray-50/80 to-white/80 dark:from-gray-900/80 dark:to-gray-800/80 backdrop-blur-xl border-b border-gray-200/30 dark:border-gray-700/20">
            <div className="max-w-2xl mx-auto">
              <div className="apple-card rounded-2xl p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <Key className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">API Configuration</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Connect your CivitAI account for enhanced features</p>
                  </div>
                  {apiKeys.civitai && (
                    <div className="ml-auto px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      <span>Connected</span>
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      CivitAI API Key
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={apiKeys.civitai || ''}
                        onChange={(e) => setApiKeys(prev => ({ ...prev, civitai: e.target.value }))}
                        onBlur={() => saveApiKeys(apiKeys)}
                        placeholder="Paste your API key here..."
                        className="w-full px-4 py-4 pr-12 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-sakura-500 focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                      />
                      {apiKeys.civitai && (
                        <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="apple-card rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                          <Star className="w-4 h-4 text-white" />
                        </div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">Enhanced Access</h4>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Higher rate limits and priority access to new models</p>
                    </div>
                    
                    <div className="apple-card rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                          <Eye className="w-4 h-4 text-white" />
                        </div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">Full Content</h4>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Access to all content including NSFW models</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Get your API key from{' '}
                      <a 
                        href="https://civitai.com/user/account" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-sakura-600 dark:text-sakura-400 hover:underline font-medium"
                      >
                        CivitAI Account Settings
                      </a>
                    </p>
                    <button
                      onClick={() => setShowApiKeys(false)}
                      className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium rounded-lg transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-gradient-to-br from-gray-50/50 to-sakura-50/30 dark:from-gray-900/20 dark:to-sakura-900/10">
          {activeTab === 'discover' ? (
            <div className="h-full flex flex-col">
              {/* Ultra-Compact Search Interface */}
              <div className="p-4 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border-b border-gray-200/30 dark:border-gray-700/20">
                <div className="max-w-6xl mx-auto space-y-3">
                  {/* Compact Search & Filters - Apple Style */}
                  <div className="flex flex-col lg:flex-row gap-4">
                    {/* Main Search Bar with Smart Suggestions */}
                    <div className="flex-1 relative group">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-sakura-500 transition-colors z-10" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Try: 'realistic portrait', 'anime style', 'civitai username', or specific tags..."
                        className="w-full pl-12 pr-12 py-4 bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-sakura-500 focus:border-transparent shadow-lg hover:shadow-xl transition-all duration-300 backdrop-blur-sm text-lg"
                      />
                      {searchQuery && (
                        <button
                          onClick={clearSearch}
                          className="absolute right-4 top-1/2 transform -translate-y-1/2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors z-10"
                          title="Clear search"
                        >
                          <X className="w-4 h-4 text-gray-400" />
                        </button>
                      )}
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleSearch}
                        disabled={isSearching}
                        className="action-button px-6 py-4 bg-gradient-to-r from-sakura-500 to-sakura-600 hover:from-sakura-600 hover:to-sakura-700 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center gap-2"
                      >
                        {isSearching ? (
                          <>
                            <RefreshCw className="w-5 h-5 animate-spin" />
                            <span>Searching...</span>
                          </>
                        ) : (
                          <>
                            <Search className="w-5 h-5" />
                            <span>Search</span>
                          </>
                        )}
                      </button>
                      
                      <button
                        onClick={() => setShowApiKeys(!showApiKeys)}
                        className="action-button px-4 py-4 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300"
                      >
                        <Settings className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Ultra-Compact Filter Bar */}
                  <div className="flex items-center justify-between gap-4">
                    {/* Model Type Pills - Ultra Compact */}
                    <div className="flex items-center gap-2 flex-1">
                      <Filter className="w-4 h-4 text-sakura-500" />
                      <div className="flex flex-wrap gap-1.5">
                        {modelTypes.map((type) => (
                          <label key={type.value} className={`px-2 py-1 rounded-md cursor-pointer text-xs font-medium transition-all duration-200 ${
                            selectedTypes.includes(type.value)
                              ? 'bg-sakura-500 text-white'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                          }`}>
                            <input
                              type="checkbox"
                              checked={selectedTypes.includes(type.value)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTypes([...selectedTypes, type.value]);
                                } else {
                                  setSelectedTypes(selectedTypes.filter(t => t !== type.value));
                                }
                              }}
                              className="hidden"
                            />
                            {type.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Compact Controls */}
                    <div className="flex items-center gap-3">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="px-2 py-1 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded-md text-xs text-gray-900 dark:text-white focus:ring-1 focus:ring-sakura-500"
                      >
                        <option value="Highest Rated">Top Rated</option>
                        <option value="Most Downloaded">Most Downloaded</option>
                        <option value="Newest">Newest</option>
                      </select>

                      <label className="flex items-center gap-1 px-2 py-1 bg-white/60 dark:bg-gray-800/60 rounded-md cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={showNSFW}
                          onChange={(e) => setShowNSFW(e.target.checked)}
                          className="w-3 h-3 text-sakura-600 rounded"
                        />
                        <span className="text-gray-700 dark:text-gray-300">NSFW</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Search Results */}
              <div className="flex-1 overflow-hidden flex">
                {/* Model List */}
                <div className="w-1/2 border-r border-gray-200/50 dark:border-gray-700/30 overflow-y-auto">
                  {/* Results Header */}
                  {searchResults.length > 0 && (
                    <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/30 bg-white/50 dark:bg-gray-800/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {!hasSearched ? '🔥 Trending Models' : `Found ${searchResults.length} models`}
                          </h3>
                          {!hasSearched ? (
                            <span className="px-2 py-1 bg-gradient-to-r from-sakura-100 to-pink-100 text-sakura-800 dark:bg-gradient-to-r dark:from-sakura-900/30 dark:to-pink-900/30 dark:text-sakura-300 rounded-full text-xs font-medium">
                              Popular
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 dark:bg-gradient-to-r dark:from-green-900/30 dark:to-emerald-900/30 dark:text-green-300 rounded-full text-xs font-medium">
                              Enhanced Search
                            </span>
                          )}
                          {hasSearched && apiKeys.civitai && (
                            <span className="px-2 py-1 bg-gradient-to-r from-blue-100 to-sky-100 text-blue-800 dark:bg-gradient-to-r dark:from-blue-900/30 dark:to-sky-900/30 dark:text-blue-300 rounded-full text-xs font-medium flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              API Enhanced
                            </span>
                          )}
                        </div>
                        {hasSearched && (
                          <button
                            onClick={clearSearch}
                            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
                          >
                            <X className="w-3 h-3" />
                            Clear
                          </button>
                        )}
                      </div>
                      {hasSearched && (
                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                          💡 Results from multiple search strategies: exact matches, tags, and creator searches
                        </div>
                      )}
                    </div>
                  )}
                  
                  {isSearching ? (
                    <div className="flex flex-col items-center justify-center p-12">
                      <div className="w-16 h-16 bg-sakura-500 rounded-full flex items-center justify-center mb-4 shadow-lg">
                        <RefreshCw className="w-8 h-8 animate-spin text-white" />
                      </div>
                      <span className="text-lg font-medium text-gray-700 dark:text-gray-300">Searching CivitAI...</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400 mt-1">Finding the best models for you</span>
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="p-6 space-y-4">
                      {searchResults.map((model) => (
                        <div
                          key={model.id}
                          onClick={() => setSelectedModel(model)}
                          className={`apple-card group cursor-pointer transition-all duration-300 overflow-hidden ${
                            selectedModel?.id === model.id
                              ? 'ring-2 ring-sakura-500 shadow-2xl scale-[1.02] bg-gradient-to-br from-sakura-50/90 to-sakura-100/60 dark:from-sakura-900/40 dark:to-sakura-800/30'
                              : 'hover:shadow-2xl hover:scale-[1.01]'
                          }`}
                        >
                          <div className="flex gap-4 p-4">
                            {/* Model Image */}
                            <div className="relative flex-shrink-0">
                              <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-lg group-hover:shadow-xl transition-all duration-300">
                                {model.images[0] ? (
                                  <img
                                    src={model.images[0]}
                                    alt={model.name}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                                    <Eye className="w-8 h-8 text-gray-400" />
                                  </div>
                                )}
                              </div>
                              {model.nsfw && (
                                <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white dark:border-gray-800">
                                  <Eye className="w-3 h-3 text-white" />
                                </div>
                              )}
                            </div>
                            
                            {/* Model Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-2">
                                <div className="min-w-0 flex-1">
                                  <h3 className="font-bold text-lg text-gray-900 dark:text-white truncate group-hover:text-sakura-600 dark:group-hover:text-sakura-400 transition-colors">
                                    {model.name}
                                  </h3>
                                  <p className="text-sm text-sakura-600 dark:text-sakura-400 font-semibold">
                                    by {model.creator}
                                  </p>
                                </div>
                                <div className={`category-pill px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                                  model.type === 'checkpoint' ? 'bg-blue-500 text-white' :
                                  model.type === 'lora' ? 'bg-green-500 text-white' :
                                  model.type === 'vae' ? 'bg-purple-500 text-white' :
                                  'bg-gray-500 text-white'
                                }`}>
                                  {model.type}
                                </div>
                              </div>
                              
                              {/* Stats */}
                              <div className="flex items-center gap-4">
                                <div className="stats-badge flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl">
                                  <Download className="w-4 h-4" />
                                  <span className="font-bold text-sm">
                                    {model.stats.downloads > 1000 
                                      ? `${(model.stats.downloads / 1000).toFixed(1)}k` 
                                      : model.stats.downloads.toLocaleString()
                                    }
                                  </span>
                                </div>
                                <div className="stats-badge flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl">
                                  <Heart className="w-4 h-4" />
                                  <span className="font-bold text-sm">
                                    {model.stats.likes > 1000 
                                      ? `${(model.stats.likes / 1000).toFixed(1)}k` 
                                      : model.stats.likes.toLocaleString()
                                    }
                                  </span>
                                </div>
                                <div className="stats-badge flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-xl">
                                  <Star className="w-4 h-4" />
                                  <span className="font-bold text-sm">{model.stats.rating.toFixed(1)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center">
                      <div className="w-16 h-16 bg-sakura-500 rounded-full flex items-center justify-center mb-4 shadow-lg">
                        {isLoadingTrending ? (
                          <RefreshCw className="w-8 h-8 text-white animate-spin" />
                        ) : (
                          <Search className="w-8 h-8 text-white" />
                        )}
                      </div>
                      <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {searchQuery ? 'No models found' : 
                         isLoadingTrending ? 'Loading trending models...' : 
                         !hasSearched && searchResults.length > 0 ? 'Trending Models' : 'Ready to search'}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        {searchQuery ? 'Try a different search term or adjust your filters.' : 
                         isLoadingTrending ? 'Discovering the most popular models for you...' :
                         !hasSearched && searchResults.length > 0 ? 'Most downloaded models this week - perfect starting points!' : 
                         'Enter a search term to discover amazing AI models.'}
                      </p>
                      
                      {/* Quick Actions */}
                      {!searchQuery && !isLoadingTrending && (
                        <div className="space-y-4">
                          <div className="flex flex-wrap gap-3 justify-center">
                            <button
                              onClick={showTrendingModels}
                              className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-all duration-200 font-medium shadow-lg hover:shadow-xl flex items-center gap-2"
                            >
                              <Star className="w-4 h-4" />
                              Show Trending
                            </button>
                            {apiKeys.civitai ? (
                              <div className="px-4 py-2 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-lg flex items-center gap-2 shadow-sm">
                                <CheckCircle className="w-4 h-4" />
                                <span className="font-medium">API Connected</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowApiKeys(true)}
                                className="px-4 py-2 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all duration-200 font-medium flex items-center gap-2 shadow-sm"
                              >
                                <Key className="w-4 h-4" />
                                Connect API for Better Results
                              </button>
                            )}
                          </div>
                          
                          {/* Quick Search Suggestions */}
                          <div className="max-w-md mx-auto">
                            <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 text-center">🚀 Quick Searches:</div>
                            <div className="flex flex-wrap gap-2 justify-center">
                              {[
                                'realistic portrait',
                                'anime style',
                                'fantasy art',
                                'photorealistic',
                                'SDXL models',
                                'LoRA collection',
                                'character design'
                              ].map((suggestion) => (
                                <button
                                  key={suggestion}
                                  onClick={() => {
                                    setSearchQuery(suggestion);
                                    // Auto-trigger search after a short delay to let the state update
                                    setTimeout(() => {
                                      handleSearch();
                                    }, 100);
                                  }}
                                  className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-xs hover:bg-sakura-100 hover:text-sakura-700 dark:hover:bg-sakura-900/30 dark:hover:text-sakura-300 transition-all duration-200 font-medium"
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Model Details - Apple Style */}
                <div className="w-1/2 overflow-y-auto bg-gradient-to-br from-gray-50/50 to-white/80 dark:from-gray-900/50 dark:to-gray-800/80 backdrop-blur-sm">
                  {selectedModel ? (
                    <div className="p-6 space-y-6">
                      {/* Model Header - Apple Card */}
                      <div className="apple-card rounded-3xl p-8 overflow-hidden">
                        <div className="flex gap-6 mb-6">
                          {/* Hero Image */}
                          <div className="relative flex-shrink-0">
                            <div className="w-32 h-32 rounded-3xl overflow-hidden shadow-2xl">
                              {selectedModel.images[0] ? (
                                <img
                                  src={selectedModel.images[0]}
                                  alt={selectedModel.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                                  <Eye className="w-12 h-12 text-gray-400" />
                                </div>
                              )}
                            </div>
                            {selectedModel.nsfw && (
                              <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white dark:border-gray-800">
                                <Eye className="w-4 h-4 text-white" />
                              </div>
                            )}
                          </div>
                          
                          {/* Model Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 leading-tight">
                                  {selectedModel.name}
                                </h1>
                                <p className="text-lg text-sakura-600 dark:text-sakura-400 font-semibold">
                                  by {selectedModel.creator}
                                </p>
                              </div>
                              <div className={`category-pill px-4 py-2 text-sm font-bold uppercase tracking-wider ${
                                selectedModel.type === 'checkpoint' ? 'bg-blue-500 text-white' :
                                selectedModel.type === 'lora' ? 'bg-green-500 text-white' :
                                selectedModel.type === 'vae' ? 'bg-purple-500 text-white' :
                                'bg-gray-500 text-white'
                              }`}>
                                {selectedModel.type}
                              </div>
                            </div>
                            
                            {/* Enhanced Stats Grid */}
                            <div className="grid grid-cols-3 gap-4 mt-6">
                              <div className="stats-badge bg-blue-50 dark:bg-blue-900/30 p-4 rounded-2xl text-center">
                                <Download className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                                  {selectedModel.stats.downloads > 1000000 
                                    ? `${(selectedModel.stats.downloads / 1000000).toFixed(1)}M`
                                    : selectedModel.stats.downloads > 1000 
                                    ? `${(selectedModel.stats.downloads / 1000).toFixed(1)}k` 
                                    : selectedModel.stats.downloads.toLocaleString()
                                  }
                                </div>
                                <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">Downloads</div>
                              </div>
                              
                              <div className="stats-badge bg-red-50 dark:bg-red-900/30 p-4 rounded-2xl text-center">
                                <Heart className="w-6 h-6 text-red-500 mx-auto mb-2" />
                                <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                                  {selectedModel.stats.likes > 1000 
                                    ? `${(selectedModel.stats.likes / 1000).toFixed(1)}k` 
                                    : selectedModel.stats.likes.toLocaleString()
                                  }
                                </div>
                                <div className="text-sm text-red-600 dark:text-red-400 font-medium">Likes</div>
                              </div>
                              
                              <div className="stats-badge bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-2xl text-center">
                                <Star className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                                <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                                  {selectedModel.stats.rating.toFixed(1)}
                                </div>
                                <div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">Rating</div>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Description */}
                        <div className="border-t border-gray-200/30 dark:border-gray-700/30 pt-6">
                          <div 
                            className="text-gray-700 dark:text-gray-300 prose prose-gray dark:prose-invert max-w-none leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: sanitizeHTML(selectedModel.description) }}
                          />
                        </div>
                      </div>

                      {/* Versions Section - Compact Apple Style */}
                      <div className="apple-card rounded-2xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                            <Download className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Downloads</h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400">{selectedModel.versions.length} versions</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {selectedModel.versions.map((version) => (
                            <div key={version.id} className="bg-white/60 dark:bg-gray-700/40 backdrop-blur-sm p-4 rounded-xl border border-gray-200/50 dark:border-gray-600/30">
                              <div className="mb-3">
                                <h4 className="font-semibold text-gray-900 dark:text-white text-base">{version.name}</h4>
                                <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Base: {version.baseModel}</p>
                              </div>
                              
                              {/* Files - Compact Layout */}
                              <div className="space-y-2">
                                {version.files.map((file, fileIndex) => {
                                  const downloadProgress = downloads.find(d => (d.filename || d.fileName) === file.name);
                                  const isDownloading = downloadProgress && !downloadProgress.completed;
                                  const isCompleted = downloadProgress && downloadProgress.completed;
                                  
                                  return (
                                    <div key={fileIndex} className="bg-white/80 dark:bg-gray-800/60 rounded-lg p-3 border border-gray-200/50 dark:border-gray-600/30">
                                      <div className="flex items-center justify-between gap-3">
                                        {/* File Info */}
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.name}</span>
                                            <div className="flex items-center gap-1">
                                              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs font-medium">
                                                {formatBytes(file.sizeKB * 1024)}
                                              </span>
                                              {file.metadata.fp && (
                                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 rounded text-xs font-medium">
                                                  {file.metadata.fp}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          
                                          {/* Progress Bar */}
                                          {isDownloading && (
                                            <div className="mt-2">
                                              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-1">
                                                <span className="font-medium">{Math.round(downloadProgress.progress)}%</span>
                                                {downloadProgress.speed && <span>{downloadProgress.speed}</span>}
                                              </div>
                                              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                                <div 
                                                  className="bg-sakura-500 h-1.5 rounded-full transition-all duration-300"
                                                  style={{ width: `${downloadProgress.progress}%` }}
                                                />
                                              </div>
                                            </div>
                                          )}
                                          
                                          {/* Enhanced Error Display */}
                                          {downloadProgress?.error && (
                                            <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg">
                                              <div className="flex items-start gap-2">
                                                <div className="flex-shrink-0 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center mt-0.5">
                                                  <X className="w-3 h-3 text-white" />
                                                </div>
                                                <div className="flex-1 text-xs text-red-600 dark:text-red-400">
                                                  <div className="font-medium mb-1">Download Failed</div>
                                                  {downloadProgress.error.includes('HTTP 401') || downloadProgress.error.includes('Unauthorized') ? (
                                                    <div className="space-y-1">
                                                      <div>This model requires an API key for download.</div>
                                                      <div className="text-red-700 dark:text-red-300 font-medium">
                                                        → Click "Settings" button above to add your CivitAI API key
                                                      </div>
                                                    </div>
                                                  ) : downloadProgress.error.includes('HTTP 403') || downloadProgress.error.includes('Forbidden') ? (
                                                    <div>Access forbidden. Please check your API key or account permissions.</div>
                                                  ) : downloadProgress.error.includes('HTTP 404') || downloadProgress.error.includes('Not Found') ? (
                                                    <div>Model file not found. The download link may be expired.</div>
                                                  ) : (
                                                    <div>{downloadProgress.error}</div>
                                                  )}
                                                </div>
                                              </div>
                                              {(downloadProgress.error.includes('HTTP 401') || downloadProgress.error.includes('Unauthorized')) && (
                                                <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-800/30">
                                                  <a 
                                                    href="https://civitai.com/user/account" 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 font-medium text-xs underline"
                                                  >
                                                    Get CivitAI API Key →
                                                  </a>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        
                                        {/* Enhanced Download Button with Error States */}
                                        <div className="flex-shrink-0 flex gap-2">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDownload(selectedModel, version, file);
                                            }}
                                            disabled={isDownloading}
                                            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all duration-200 ${
                                              isCompleted
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                                                : downloadProgress?.error
                                                ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60'
                                                : isDownloading
                                                ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed'
                                                : 'bg-sakura-500 text-white hover:bg-sakura-600 shadow-md hover:shadow-lg'
                                            }`}
                                          >
                                            {isCompleted ? (
                                              <>
                                                <CheckCircle className="w-4 h-4" />
                                                <span>Done</span>
                                              </>
                                            ) : downloadProgress?.error ? (
                                              <>
                                                <RefreshCw className="w-4 h-4" />
                                                <span>Retry</span>
                                              </>
                                            ) : isDownloading ? (
                                              <>
                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                                <span>...</span>
                                              </>
                                            ) : (
                                              <>
                                                <Download className="w-4 h-4" />
                                                <span>Get</span>
                                              </>
                                            )}
                                          </button>
                                          
                                          {/* Clear Error Button */}
                                          {downloadProgress?.error && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                clearDownloadError(file.name);
                                              }}
                                              className="px-2 py-2 rounded-lg text-xs font-medium flex items-center gap-1 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200"
                                              title="Clear error"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-12">
                      <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center mb-6 shadow-lg">
                        <Settings className="w-10 h-10 text-white" />
                      </div>
                      <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">Select a Model</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                        Choose a model from the list to view detailed information, sample images, and download options.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Library Tab */
            <div className="h-full p-6">
              <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-600/30 p-6 rounded-xl mb-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center shadow-md">
                      <HardDrive className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold bg-gradient-to-r from-sakura-600 to-sakura-500 bg-clip-text text-transparent">Local Models</h3>
                  </div>
                  <button
                    onClick={loadLocalModels}
                    className="px-4 py-2 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="font-medium">Refresh</span>
                  </button>
                </div>
              </div>
              
              <div className="space-y-6">
                {Object.entries(localModels).map(([modelType, models]) => (
                  models.length > 0 && (
                    <div key={modelType} className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-600/30 p-6 rounded-xl shadow-sm">
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-8 h-8 bg-black rounded-lg flex items-center justify-center shadow-md`}>
                          <HardDrive className="w-4 h-4 text-white" />
                        </div>
                        <h4 className="text-xl font-bold text-gray-900 dark:text-white">
                          {getModelTypeDisplayName(modelType)}
                        </h4>
                        <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded-full text-sm font-medium shadow-sm">
                          {models.length} models
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        {models.map((model, index) => (
                          <div key={`${modelType}-${model.name}-${index}`} className="flex items-center justify-between p-4 bg-white/90 dark:bg-gray-700/50 rounded-lg border border-gray-200/50 dark:border-gray-600/30 hover:bg-white dark:hover:bg-gray-700/70 transition-all duration-200 shadow-sm">
                            <div className="flex-1">
                              <h5 className="font-semibold text-gray-900 dark:text-white text-lg">{model.name}</h5>
                              <div className="flex items-center gap-4 mt-2">
                                <div className="flex items-center gap-2">
                                  <HardDrive className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{formatBytes(model.size)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                    {new Date(model.modified).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteModel(modelType, model.name);
                              }}
                              className="px-4 py-2 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-all duration-200 font-medium flex items-center gap-2 shadow-sm"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ))}
                
                {Object.values(localModels).every(models => models.length === 0) && (
                  <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200/50 dark:border-gray-600/30 p-12 rounded-xl text-center shadow-sm">
                    <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                      <HardDrive className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No Local Models</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      Download models from the Discover tab to see them here
                    </p>
                    <button
                      onClick={() => setActiveTab('discover')}
                      className="px-6 py-3 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
                    >
                      Browse Models
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageModelManager; 