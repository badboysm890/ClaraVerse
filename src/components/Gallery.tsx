import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { db } from '../db';
import { indexedDBService } from '../services/indexedDB';
import { GalleryImage } from '../types';
import { 
  Search, 
  Grid3X3, 
  LayoutGrid, 
  Download,
  Heart,
  Share2,
  Trash2,
  Eye,
  Calendar,
  Palette,
  X,
  ZoomIn,
  ZoomOut,
  Copy,
  Edit3,
  Check
} from 'lucide-react';

// Extend db with fallback methods if not available
if (!(db as any).getStorageItems) {
  (db as any).getStorageItems = async () => {
    try {
      return await indexedDBService.getAll('storage');
    } catch (error) {
      console.error('IndexedDB retrieval failed, falling back to localStorage', error);
      const data = localStorage.getItem('angela_db_storage');
      return data ? JSON.parse(data) : [];
    }
  };
}
if (!(db as any).deleteStorageItem) {
  (db as any).deleteStorageItem = async (id: string) => {
    try {
      await indexedDBService.delete('storage', id);
    } catch (error) {
      console.error('IndexedDB deletion failed, falling back to localStorage', error);
      const data = localStorage.getItem('angela_db_storage');
      if (data) {
        const items = JSON.parse(data);
        const updated = items.filter((item: any) => item.id !== id);
        localStorage.setItem('angela_db_storage', JSON.stringify(updated));
      }
    }
  };
}

interface GalleryProps {
  onPageChange?: (page: string) => void;
  userName?: string;
  isDarkMode?: boolean;
}

const Gallery: React.FC<GalleryProps> = ({ 
  onPageChange, 
  userName = "User", 
  isDarkMode = false
}) => {
  // States
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [comfyUIImages, setComfyUIImages] = useState<GalleryImage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [imageSource, setImageSource] = useState<'all' | 'angela' | 'comfyui'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingComfyUI, setIsLoadingComfyUI] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'masonry'>('grid');
  const [darkMode, setDarkMode] = useState(isDarkMode);

  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');

  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null);

  // Sync dark mode with parent component
  useEffect(() => {
    setDarkMode(isDarkMode);
  }, [isDarkMode]);

  // Load angela images on mount
  useEffect(() => {
    const loadImages = async () => {
      setIsLoading(true);
      try {
        const storedItems = await (db as any).getStorageItems();
        const imageItems = storedItems.filter((item: any) => item.type === 'image');
        const galleryImages: GalleryImage[] = imageItems.map((item: any, idx: number) => {
          let finalPrompt = item.description ?? '';
          if (finalPrompt.startsWith('Prompt:')) {
            finalPrompt = finalPrompt.replace(/^Prompt:\s*/, '');
          }
          return {
            id: item.id ?? `img-${idx}`,
            url: item.data,
            prompt: finalPrompt,
            createdAt: item.timestamp || new Date().toISOString(),
            likes: item.likes ?? 0,
            views: item.views ?? 0,
            model: item.model || 'SD-Model',
            resolution: item.resolution || '1024x1024',
            source: 'angela'
          };
        });
        setImages(galleryImages);
      } catch (error) {
        console.error('Error loading angela images from DB:', error);
        showToast('Failed to load angela images', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    loadImages();
  }, []);

  // Load ComfyUI images
  const loadComfyUIImages = async () => {
    setIsLoadingComfyUI(true);
    try {
      const comfyuiImageList = await window.electronAPI?.invoke('comfyui:list-output-images') || [];
      
      const processedImages: GalleryImage[] = await Promise.all(
        comfyuiImageList.map(async (img: any) => {
          try {
            // Get the image data as base64
            const dataUrl = await window.electronAPI?.invoke('comfyui:get-image-data', img.path);
            
            return {
              id: img.id,
              url: dataUrl || img.url,
              prompt: img.prompt,
              createdAt: img.modified,
              likes: 0,
              views: 0,
              model: 'ComfyUI',
              resolution: 'Unknown',
              source: 'comfyui',
              originalPath: img.path,
              fileSize: img.size
            };
          } catch (error) {
            console.error('Error processing ComfyUI image:', img.name, error);
            return null;
          }
        })
      );

      const validImages = processedImages.filter(img => img !== null) as GalleryImage[];
      setComfyUIImages(validImages);
      
      if (validImages.length > 0) {
        showToast(`Loaded ${validImages.length} ComfyUI images`);
      }
    } catch (error) {
      console.error('Error loading ComfyUI images:', error);
      showToast('Failed to load ComfyUI images', 'error');
    } finally {
      setIsLoadingComfyUI(false);
    }
  };

  // Load ComfyUI images on mount and start watching
  useEffect(() => {
    loadComfyUIImages();
    
    // Start ComfyUI output watcher
    const startWatcher = async () => {
      try {
        await window.electronAPI?.invoke('comfyui:start-output-watcher');
        
        // Listen for new ComfyUI images
        const handleNewImage = async (imageInfo: any) => {
          try {
            const dataUrl = await window.electronAPI?.invoke('comfyui:get-image-data', imageInfo.path);
            const newImage: GalleryImage = {
              id: imageInfo.id,
              url: dataUrl,
              prompt: imageInfo.prompt,
              createdAt: imageInfo.modified,
              likes: 0,
              views: 0,
              model: 'ComfyUI',
              resolution: 'Unknown',
              source: 'comfyui',
              originalPath: imageInfo.path,
              fileSize: imageInfo.size
            };
            
            setComfyUIImages(prev => [newImage, ...prev]);
            showToast(`New ComfyUI image: ${imageInfo.name}`);
          } catch (error) {
            console.error('Error processing new ComfyUI image:', error);
          }
        };

        window.electronAPI?.on('comfyui:new-output-image', handleNewImage);
        
        // Cleanup on unmount
        return () => {
          window.electronAPI?.off('comfyui:new-output-image', handleNewImage);
          window.electronAPI?.invoke('comfyui:stop-output-watcher');
        };
      } catch (error) {
        console.error('Error starting ComfyUI watcher:', error);
      }
    };

    startWatcher();
  }, []);

  // Combine images based on source filter
  const getAllImages = () => {
    switch (imageSource) {
      case 'angela':
        return images;
      case 'comfyui':
        return comfyUIImages;
      case 'all':
      default:
        return [...images, ...comfyUIImages];
    }
  };

  // Determine which tabs to show and auto-switch if needed
  const shouldShowTabs = () => {
    const hasangelaImages = images.length > 0;
    const hasComfyUIImages = comfyUIImages.length > 0;
    return hasangelaImages && hasComfyUIImages;
  };

  // Auto-switch image source if current selection becomes empty
  useEffect(() => {
    const hasangelaImages = images.length > 0;
    const hasComfyUIImages = comfyUIImages.length > 0;

    if (imageSource === 'angela' && !hasangelaImages && hasComfyUIImages) {
      setImageSource('comfyui');
    } else if (imageSource === 'comfyui' && !hasComfyUIImages && hasangelaImages) {
      setImageSource('angela');
    } else if (imageSource !== 'all' && hasangelaImages && hasComfyUIImages) {
      // Keep current selection if both sources have images
    } else if (!hasangelaImages && !hasComfyUIImages) {
      setImageSource('all');
    }
  }, [images.length, comfyUIImages.length, imageSource]);

  const showToast = (message: string, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 3000);
  };

  // Apply search, filter, and sort
  const applyFilterAndSort = (items: GalleryImage[]) => {
    let filtered = [...items];
    if (filter === 'favorites' || filter === 'liked') {
      filtered = filtered.filter(img => img.likes > 0);
    } else if (filter === 'recent') {
      const now = Date.now();
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      filtered = filtered.filter(img => now - new Date(img.createdAt).getTime() < oneWeek);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        img =>
          img.prompt.toLowerCase().includes(q) ||
          img.model.toLowerCase().includes(q) ||
          img.resolution.toLowerCase().includes(q)
      );
    }
    if (sortBy === 'newest') {
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === 'oldest') {
      filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortBy === 'popular') {
      filtered.sort((a, b) => b.likes - a.likes);
    }
    return filtered;
  };

  const displayedImages = applyFilterAndSort(getAllImages());

  // Handlers
  const handleImageClick = (image: GalleryImage) => {
    setSelectedImage(image);
    setZoom(1);
    setIsEditingPrompt(false);
  };

  const handleDownload = (image: GalleryImage) => {
    const a = document.createElement('a');
    a.href = image.url;
    a.download = `angela-generated-${image.id}.png`;
    a.click();
    showToast('Image downloaded successfully');
  };

  const handleLike = (imageId: string) => {
    setImages(prev =>
      prev.map(img => (img.id === imageId ? { ...img, likes: img.likes === 0 ? 1 : 0 } : img))
    );
    if (selectedImage && selectedImage.id === imageId) {
      setSelectedImage(prev => (prev ? { ...prev, likes: prev.likes === 0 ? 1 : 0 } : prev));
    }
    showToast(
      images.find(img => img.id === imageId)?.likes === 0
        ? 'Added to favorites'
        : 'Removed from favorites'
    );
  };

  const handleDelete = async (imageId: string) => {
    if (!window.confirm('Are you sure you want to delete this image?')) return;
    
    try {
      // Find the image to determine its source
      const image = getAllImages().find(img => img.id === imageId);
      if (!image) {
        throw new Error('Image not found');
      }

      if (image.source === 'comfyui' && image.originalPath) {
        // Delete ComfyUI image
        const result = await window.electronAPI?.invoke('comfyui:delete-output-image', image.originalPath);
        if (result?.success) {
          setComfyUIImages(prev => prev.filter(img => img.id !== imageId));
          showToast('ComfyUI image deleted successfully');
        } else {
          throw new Error('Failed to delete ComfyUI image');
        }
      } else {
        // Delete angela image
        await (db as any).deleteStorageItem(imageId);
        setImages(prev => prev.filter(img => img.id !== imageId));
        showToast('Image deleted successfully');
      }

      if (selectedImage && selectedImage.id === imageId) {
        setSelectedImage(null);
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      showToast('Failed to delete image', 'error');
    }
  };

  const handleCopyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt)
      .then(() => showToast('Prompt copied to clipboard!'))
      .catch(() => showToast('Failed to copy prompt', 'error'));
  };

  const handleShare = (image: GalleryImage) => {
    if (navigator.share) {
      navigator.share({ title: 'Check out this image', text: image.prompt, url: image.url })
        .then(() => showToast('Shared successfully'))
        .catch(error => {
          console.error('Error sharing:', error);
          showToast('Failed to share image', 'error');
        });
    } else {
      showToast('Web Share API not supported on this device', 'error');
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5));

  const startEditingPrompt = () => {
    setEditedPrompt(selectedImage?.prompt || '');
    setIsEditingPrompt(true);
  };

  const saveEditedPrompt = () => {
    if (selectedImage) {
      setImages(prev =>
        prev.map(img => (img.id === selectedImage.id ? { ...img, prompt: editedPrompt } : img))
      );
      setSelectedImage({ ...selectedImage, prompt: editedPrompt });
      setIsEditingPrompt(false);
      showToast('Prompt updated successfully');
    }
  };

  return (
    <div className={`${darkMode ? 'dark' : ''} h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900`}>
      <div className="flex-1 flex overflow-hidden">
        <div className="z-10">
          <Sidebar activePage="gallery" onPageChange={onPageChange || (() => {})} />
        </div>
        <div className="flex-1 flex flex-col z-0">
          <Topbar 
            userName={userName}
            onPageChange={onPageChange} 
          />
          
          {/* Modern Header Section */}
          <div className="px-8 pt-6 pb-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-sakura-500 via-sakura-400 to-sakura-600 bg-clip-text text-transparent">
                  AI Gallery
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  {displayedImages.length} {displayedImages.length === 1 ? 'creation' : 'creations'}
                </p>
              </div>
              
              {/* View Toggle */}
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-white/50 dark:bg-gray-800/50 rounded-xl p-1 border border-gray-200/50 dark:border-gray-700/50">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-lg transition-all duration-200 ${
                      viewMode === 'grid'
                        ? 'bg-gradient-to-r from-sakura-500 to-sakura-600 text-white shadow-lg'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <Grid3X3 size={18} />
                  </button>
                  <button
                    onClick={() => setViewMode('masonry')}
                    className={`p-2 rounded-lg transition-all duration-200 ${
                      viewMode === 'masonry'
                        ? 'bg-gradient-to-r from-sakura-500 to-sakura-600 text-white shadow-lg'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <LayoutGrid size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* Source Filter Tabs - Only show if both sources have images */}
              {shouldShowTabs() && (
                <div className="flex items-center bg-white/50 dark:bg-gray-800/50 rounded-xl p-1 border border-gray-200/50 dark:border-gray-700/50">
                  <button
                    onClick={() => setImageSource('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      imageSource === 'all'
                        ? 'bg-gradient-to-r from-sakura-500 to-sakura-600 text-white shadow-lg'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    All ({images.length + comfyUIImages.length})
                  </button>
                  <button
                    onClick={() => setImageSource('angela')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      imageSource === 'angela'
                        ? 'bg-gradient-to-r from-sakura-500 to-sakura-600 text-white shadow-lg'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    angela ({images.length})
                  </button>
                  <button
                    onClick={() => setImageSource('comfyui')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      imageSource === 'comfyui'
                        ? 'bg-gradient-to-r from-sakura-500 to-sakura-600 text-white shadow-lg'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    ComfyUI ({comfyUIImages.length})
                  </button>
                </div>
              )}

              {/* Search */}
              <div className="relative flex-1 min-w-64">
                <Search size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search your creations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white/70 dark:bg-gray-800/70 border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sakura-500/50 focus:border-sakura-500/50 backdrop-blur-sm transition-all duration-200"
                />
              </div>
              
              {/* Filters */}
              <div className="flex items-center gap-2">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="px-4 py-3 bg-white/70 dark:bg-gray-800/70 border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sakura-500/50 backdrop-blur-sm transition-all duration-200"
                >
                  <option value="all">All Images</option>
                  <option value="favorites">Favorites</option>
                  <option value="recent">Recent</option>
                </select>
                
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-4 py-3 bg-white/70 dark:bg-gray-800/70 border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sakura-500/50 backdrop-blur-sm transition-all duration-200"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="popular">Most Liked</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Gallery Content */}
          <div className="flex-1 overflow-y-auto p-8">
            {(isLoading || isLoadingComfyUI) ? (
              <div className="flex flex-col items-center justify-center h-64">
                <div className="w-16 h-16 border-4 border-sakura-200 dark:border-sakura-800 border-t-sakura-500 dark:border-t-sakura-400 rounded-full animate-spin mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">
                  {isLoading ? 'Loading angela images...' : 'Loading ComfyUI images...'}
                </p>
              </div>
            ) : displayedImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-sakura-100 to-sakura-200 dark:from-sakura-900/30 dark:to-sakura-800/30 rounded-2xl flex items-center justify-center mb-4">
                  <Palette size={32} className="text-sakura-500 dark:text-sakura-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No images found</h3>
                <p className="text-gray-600 dark:text-gray-400 max-w-md">
                  {searchQuery ? 'Try adjusting your search or filters' : 'Start creating amazing AI art to see it here!'}
                </p>
              </div>
            ) : (
              <div 
                className={`grid gap-4 ${
                  viewMode === 'grid'
                    ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
                }`}
              >
                {displayedImages.map((image) => (
                  <div
                    key={image.id}
                    className={`group relative bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 border border-gray-200/50 dark:border-gray-700/50 ${
                      viewMode === 'grid' ? 'aspect-square' : ''
                    }`}
                    onMouseEnter={() => setHoveredImageId(image.id)}
                    onMouseLeave={() => setHoveredImageId(null)}
                  >
                    {/* Image */}
                    <div className={`relative overflow-hidden cursor-pointer ${
                      viewMode === 'grid' ? 'aspect-square' : 'aspect-[4/3]'
                    }`} onClick={() => handleImageClick(image)}>
                      <img
                        src={image.url}
                        alt={image.prompt}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                      
                      {/* Hover Overlay */}
                      <div className={`absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity duration-300 ${
                        hoveredImageId === image.id ? 'opacity-100' : 'opacity-0'
                      }`}>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLike(image.id);
                              }}
                              className="p-2 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors duration-200"
                            >
                              <Heart 
                                size={20} 
                                className={`${image.likes > 0 ? 'fill-red-500 text-red-500' : 'text-white'} transition-colors duration-200`} 
                              />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(image);
                              }}
                              className="p-2 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors duration-200"
                            >
                              <Download size={20} className="text-white" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShare(image);
                              }}
                              className="p-2 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors duration-200"
                            >
                              <Share2 size={20} className="text-white" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Card Content - Hide in grid mode for compactness */}
                    {viewMode === 'masonry' && (
                      <div className="p-4">
                        <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2 mb-3 leading-relaxed">
                          {image.prompt || 'No prompt available'}
                        </p>
                        
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                          <div className="flex items-center gap-1">
                            <Calendar size={12} />
                            <span>{formatDate(image.createdAt)}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <Eye size={12} />
                              <span>{image.views}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Heart size={12} className={image.likes > 0 ? 'text-red-500' : ''} />
                              <span>{image.likes}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Grid mode - show source badge */}
                    {viewMode === 'grid' && (
                      <div className="absolute top-2 right-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          image.source === 'comfyui' 
                            ? 'bg-orange-500/90 text-white' 
                            : 'bg-sakura-500/90 text-white'
                        }`}>
                          {image.source === 'comfyui' ? 'ComfyUI' : 'angela'}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Image Preview Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative max-w-7xl max-h-[90vh] mx-4 bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Image Details</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleZoomOut}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <ZoomOut size={20} />
                </button>
                <button
                  onClick={handleZoomIn}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <ZoomIn size={20} />
                </button>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <div className="flex flex-col lg:flex-row max-h-[80vh]">
              {/* Image Display */}
              <div className="flex-1 flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-800 overflow-auto">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.prompt}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg transition-transform duration-200"
                  style={{ transform: `scale(${zoom})` }}
                />
              </div>
              
              {/* Image Details */}
              <div className="w-full lg:w-96 p-6 overflow-y-auto">
                <div className="space-y-6">
                  {/* Prompt Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-900 dark:text-white">Prompt</h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopyPrompt(selectedImage.prompt)}
                          className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          onClick={startEditingPrompt}
                          className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                          <Edit3 size={16} />
                        </button>
                      </div>
                    </div>
                    {isEditingPrompt ? (
                      <div className="space-y-2">
                        <textarea
                          value={editedPrompt}
                          onChange={(e) => setEditedPrompt(e.target.value)}
                          className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                          rows={4}
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={saveEditedPrompt}
                            className="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setIsEditingPrompt(false)}
                            className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                        {selectedImage.prompt}
                      </p>
                    )}
                  </div>
                  
                  {/* Metadata */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-gray-900 dark:text-white">Details</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Created</span>
                        <span className="text-gray-900 dark:text-white">{formatDate(selectedImage.createdAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Model</span>
                        <span className="text-gray-900 dark:text-white">{selectedImage.model}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Resolution</span>
                        <span className="text-gray-900 dark:text-white">{selectedImage.resolution}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Likes</span>
                        <span className="text-gray-900 dark:text-white">{selectedImage.likes}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleLike(selectedImage.id)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg transition-colors ${
                        selectedImage.likes > 0
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      <Heart size={16} className={selectedImage.likes > 0 ? 'fill-current' : ''} />
                      <span className="text-sm">Like</span>
                    </button>
                    <button
                      onClick={() => handleDownload(selectedImage)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-sakura-500 text-white rounded-lg hover:bg-sakura-600 transition-colors"
                    >
                      <Download size={16} />
                      <span className="text-sm">Download</span>
                    </button>
                    <button
                      onClick={() => handleDelete(selectedImage.id)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    >
                      <Trash2 size={16} />
                      <span className="text-sm">Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className={`px-6 py-3 rounded-xl shadow-lg backdrop-blur-sm border transition-all duration-300 ${
            toast.type === 'error'
              ? 'bg-red-500/90 text-white border-red-400/50'
              : 'bg-green-500/90 text-white border-green-400/50'
          }`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default Gallery;
