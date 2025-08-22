import React, { useState, useEffect } from 'react';
import { TrendingUp, Star, Calendar, Download, Heart } from 'lucide-react';
import ModelCard from './ModelCard';
import { HuggingFaceModel, DownloadProgress, TrendingFilter } from './types';

interface PopularModelsSectionProps {
  onDownload: (modelId: string, fileName: string) => void;
  onDownloadWithDependencies?: (modelId: string, fileName: string, allFiles: Array<{ rfilename: string; size?: number }>) => void;
  downloading: Set<string>;
  downloadProgress: { [fileName: string]: DownloadProgress };
  onTagClick?: (tag: string) => void;
}

const PopularModelsSection: React.FC<PopularModelsSectionProps> = ({
  onDownload,
  onDownloadWithDependencies,
  downloading,
  downloadProgress,
  onTagClick
}) => {
  const [popularModels, setPopularModels] = useState<HuggingFaceModel[]>([]);
  const [isLoadingPopular, setIsLoadingPopular] = useState(true);
  const [trendingFilter, setTrendingFilter] = useState<TrendingFilter>('today');

  // Load popular models on mount and when filter changes
  useEffect(() => {
    const loadPopularModels = async () => {
      if (!window.modelManager?.searchHuggingFaceModels) return;
      
      setIsLoadingPopular(true);
      try {
        // Map trending filter to actual HuggingFace API sort parameters
        const sortMapping = {
          'today': 'lastModified',      // Most recently updated
          'week': 'createdAt',          // Most recently created
          'month': 'downloads',         // Use downloads for trending (HF API doesn't support trending)
          'all': 'downloads'            // All-time most downloaded
        };

        const sortParam = sortMapping[trendingFilter] || 'lastModified';
        
        // Use broad search terms to discover diverse models, not just known families
        const searchQueries = [
          '', // Empty search gets all GGUF models
          'instruct', 'chat', 'code', 'math', 'reasoning', 'multimodal',
          'llama', 'qwen', 'phi', 'mistral', 'gemma', 'deepseek', 'yi'
        ];
        
        const allModels: HuggingFaceModel[] = [];
        
        // For latest/recent filters, prioritize broader discovery
        if (trendingFilter === 'today' || trendingFilter === 'week') {
          // Get latest models across all categories
          const result = await window.modelManager.searchHuggingFaceModels('', 30, sortParam);
          if (result.success) {
            allModels.push(...result.models);
          }
          
          // Also search for specific capabilities to find diverse models
          const capabilityQueries = ['instruct', 'chat', 'code', 'math', 'vision', 'multimodal'];
          for (const query of capabilityQueries) {
            const result = await window.modelManager.searchHuggingFaceModels(query, 5, sortParam);
            if (result.success) {
              allModels.push(...result.models);
            }
          }
        } else {
          // For trending and all-time, use a mix of broad and specific searches
          for (const query of searchQueries) {
            const limit = query === '' ? 15 : 3; // More results for broad search
            const result = await window.modelManager.searchHuggingFaceModels(query, limit, sortParam);
            if (result.success) {
              allModels.push(...result.models);
            }
          }
        }
        
        // Remove duplicates based on model ID
        const uniqueModels = allModels.filter((model, index, self) => 
          index === self.findIndex(m => m.id === model.id)
        );
        
        // Apply secondary sorting based on the filter type
        let sortedModels: HuggingFaceModel[] = [];
        
        switch (trendingFilter) {
          case 'today':
            // Sort by most recently modified, then by downloads
            sortedModels = uniqueModels.sort((a, b) => {
              const dateA = new Date(a.lastModified || '1970-01-01').getTime();
              const dateB = new Date(b.lastModified || '1970-01-01').getTime();
              if (dateB !== dateA) return dateB - dateA;
              return b.downloads - a.downloads;
            }).slice(0, 8);
            break;
            
          case 'week':
            // Sort by most recently created, then by downloads
            sortedModels = uniqueModels.sort((a, b) => {
              const dateA = new Date(a.createdAt || '1970-01-01').getTime();
              const dateB = new Date(b.createdAt || '1970-01-01').getTime();
              if (dateB !== dateA) return dateB - dateA;
              return b.downloads - a.downloads;
            }).slice(0, 10);
            break;
            
          case 'month':
            // Use downloads for trending since HF API doesn't support trending
            // Apply additional filtering to show recently popular models
            sortedModels = uniqueModels.sort((a, b) => {
              // First sort by downloads for popularity
              const downloadDiff = b.downloads - a.downloads;
              if (downloadDiff !== 0) return downloadDiff;
              // Then by recent activity for "trending" feel
              const dateA = new Date(a.lastModified || a.createdAt || '1970-01-01').getTime();
              const dateB = new Date(b.lastModified || b.createdAt || '1970-01-01').getTime();
              return dateB - dateA;
            }).slice(0, 12);
            break;
            
          case 'all':
            // Sort by total downloads (all-time popularity)
            sortedModels = uniqueModels.sort((a, b) => b.downloads - a.downloads).slice(0, 15);
            break;
            
          default:
            sortedModels = uniqueModels.slice(0, 12);
        }
        
        setPopularModels(sortedModels);
      } catch (error) {
        console.error('Error loading popular models:', error);
      } finally {
        setIsLoadingPopular(false);
      }
    };

    loadPopularModels();
  }, [trendingFilter]);

  const getFilterIcon = (filter: TrendingFilter) => {
    switch (filter) {
      case 'today': return <Calendar className="w-3 h-3" />;
      case 'week': return <Calendar className="w-3 h-3" />;
      case 'month': return <TrendingUp className="w-3 h-3" />;
      case 'all': return <Download className="w-3 h-3" />;
      default: return <Star className="w-3 h-3" />;
    }
  };

  const getFilterDescription = (filter: TrendingFilter) => {
    switch (filter) {
      case 'today': return 'Most recently updated models';
      case 'week': return 'Newest models on HuggingFace';
      case 'month': return 'Popular models (most downloaded)';
      case 'all': return 'All-time most downloaded models';
      default: return 'Popular models';
    }
  };

  return (
    <div className="glassmorphic rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-sakura-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Discover Models
          </h3>
          <div className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-orange-100 to-yellow-100 dark:from-orange-900/30 dark:to-yellow-900/30 text-orange-700 dark:text-orange-300 text-xs rounded-full">
            <Star className="w-3 h-3" />
            Latest
          </div>
        </div>
        
        {/* Sort Filter */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 overflow-x-auto">
          {[
            { key: 'today', label: 'Latest' },
            { key: 'week', label: 'Newest' },
            { key: 'month', label: 'Trending' },
            { key: 'all', label: 'Popular' }
          ].map((filter) => (
            <button
              key={filter.key}
              onClick={() => setTrendingFilter(filter.key as TrendingFilter)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 whitespace-nowrap flex items-center gap-1 ${
                trendingFilter === filter.key
                  ? 'bg-sakura-500 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
              }`}
            >
              {getFilterIcon(filter.key as TrendingFilter)}
              {filter.label}
            </button>
          ))}
        </div>
      </div>
      
      {isLoadingPopular ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-sakura-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading models...</p>
        </div>
      ) : popularModels.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {getFilterDescription(trendingFilter)}
            </p>
            <span className="text-sm text-gray-500 dark:text-gray-400">{popularModels.length} models</span>
          </div>
          <div className="grid gap-4 max-h-[600px] overflow-y-auto">
            {popularModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                onDownload={onDownload}
                onDownloadWithDependencies={onDownloadWithDependencies}
                downloading={downloading}
                downloadProgress={downloadProgress}
                onTagClick={onTagClick}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-8 h-8 text-gray-400 dark:text-gray-600" />
          </div>
          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No models found</h4>
          <p className="text-gray-500 dark:text-gray-400">
            Try a different filter or search for specific models above
          </p>
        </div>
      )}
    </div>
  );
};

export default PopularModelsSection; 
