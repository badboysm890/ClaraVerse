import React, { useState } from 'react';
import { Search } from 'lucide-react';
import ModelCard from './ModelCard';
import { HuggingFaceModel, DownloadProgress } from './types';

interface SearchSectionProps {
  onDownload: (modelId: string, fileName: string) => void;
  onDownloadWithDependencies?: (modelId: string, fileName: string, allFiles: Array<{ rfilename: string; size?: number }>) => void;
  downloading: Set<string>;
  downloadProgress: { [fileName: string]: DownloadProgress };
  onTagClick?: (tag: string) => void;
}

const SearchSection: React.FC<SearchSectionProps> = ({
  onDownload,
  onDownloadWithDependencies,
  downloading,
  downloadProgress,
  onTagClick
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HuggingFaceModel[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const searchModels = async () => {
    if (!searchQuery.trim() || !window.modelManager?.searchHuggingFaceModels) return;
    
    setIsSearching(true);
    try {
      // Use lastModified to show newest models first in search results
      const result = await window.modelManager.searchHuggingFaceModels(searchQuery, 20, 'lastModified');
      if (result.success) {
        setSearchResults(result.models);
      } else {
        console.error('Search failed:', result.error);
      }
    } catch (error) {
      console.error('Error searching models:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleTagFilter = async (tag: string) => {
    if (!window.modelManager?.searchHuggingFaceModels) return;
    
    setIsSearching(true);
    setSearchQuery(tag);
    
    try {
      // Use lastModified for tag searches too
      const result = await window.modelManager.searchHuggingFaceModels(tag, 20, 'lastModified');
      if (result.success) {
        setSearchResults(result.models);
      }
    } catch (error) {
      console.error('Error filtering by tag:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <div className="glassmorphic rounded-xl p-6 m-2">
      <div className="flex items-center gap-3 mb-4">
        <Search className="w-5 h-5 text-sakura-500" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Search Models
        </h3>
      </div>
      
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && searchModels()}
          placeholder="Search for models (e.g., 'llama', 'qwen', 'phi')"
          className="flex-1 px-4 py-3 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-sakura-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100"
        />
        <button
          onClick={searchModels}
          disabled={isSearching || !searchQuery.trim()}
          className="px-6 py-3 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          <Search className="w-4 h-4" />
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900 dark:text-white">Search Results</h4>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">{searchResults.length} models found</span>
              <button
                onClick={clearSearch}
                className="px-3 py-1 text-sm text-sakura-600 dark:text-sakura-400 hover:text-sakura-700 dark:hover:text-sakura-300 transition-colors"
              >
                Back to Trending
              </button>
            </div>
          </div>
          <div className="grid gap-4 max-h-[600px] overflow-y-auto">
            {searchResults.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                onDownload={onDownload}
                onDownloadWithDependencies={onDownloadWithDependencies}
                downloading={downloading}
                downloadProgress={downloadProgress}
                onTagClick={onTagClick || handleTagFilter}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchSection; 
