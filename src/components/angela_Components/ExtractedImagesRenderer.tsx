/**
 * Extracted Images Renderer
 * 
 * This component renders images that were extracted from tool results
 * and stored separately from the chat history. This allows images to be
 * displayed without being included in the conversation context sent to models.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { angelaExtractedImage } from '../../types/angela_assistant_types';
import { angelaImageExtractionService } from '../../services/angelaImageExtractionService';
import { Download, Eye, Info, X, Maximize2, ZoomIn, ZoomOut, RotateCw, Move, RotateCcw } from 'lucide-react';

interface ExtractedImagesRendererProps {
  /** Extracted images to display */
  images: angelaExtractedImage[];
  
  /** Whether to show images in a compact grid layout */
  compact?: boolean;
  
  /** Maximum number of images to show initially */
  maxVisible?: number;
  
  /** Additional CSS classes */
  className?: string;
}

interface ImageViewerState {
  scale: number;
  translateX: number;
  translateY: number;
  rotation: number;
  isDragging: boolean;
  dragStart: { x: number; y: number };
  lastPanPoint: { x: number; y: number };
}

const ExtractedImagesRenderer: React.FC<ExtractedImagesRendererProps> = ({
  images,
  compact = false,
  maxVisible = 3,
  className = ''
}) => {
  const [showAll, setShowAll] = useState(false);
  const [selectedImage, setSelectedImage] = useState<angelaExtractedImage | null>(null);
  const [imageLoadErrors, setImageLoadErrors] = useState<Set<string>>(new Set());
  
  // Enhanced image viewer state
  const [viewerState, setViewerState] = useState<ImageViewerState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
    rotation: 0,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    lastPanPoint: { x: 0, y: 0 }
  });
  
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter out images that failed to load
  const validImages = images.filter(img => !imageLoadErrors.has(img.id));
  
  // Determine which images to show
  const imagesToShow = showAll ? validImages : validImages.slice(0, maxVisible);
  const hasMore = validImages.length > maxVisible;

  const handleImageError = useCallback((imageId: string) => {
    setImageLoadErrors(prev => new Set(prev).add(imageId));
    console.warn(`Failed to load extracted image: ${imageId}`);
  }, []);

  const handleDownload = useCallback((image: angelaExtractedImage) => {
    try {
      // Create download link
      const link = document.createElement('a');
      link.href = image.data;
      link.download = `${image.toolName}_${image.id}.${image.mimeType.split('/')[1] || 'png'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  }, []);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown size';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Reset viewer state when image changes
  const resetViewerState = useCallback(() => {
    setViewerState({
      scale: 1,
      translateX: 0,
      translateY: 0,
      rotation: 0,
      isDragging: false,
      dragStart: { x: 0, y: 0 },
      lastPanPoint: { x: 0, y: 0 }
    });
  }, []);

  // Enhanced image viewer functions
  const zoomIn = useCallback(() => {
    setViewerState(prev => ({
      ...prev,
      scale: Math.min(prev.scale * 1.3, 5)
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewerState(prev => ({
      ...prev,
      scale: Math.max(prev.scale / 1.3, 0.1)
    }));
  }, []);

  const rotateRight = useCallback(() => {
    setViewerState(prev => ({
      ...prev,
      rotation: (prev.rotation + 90) % 360
    }));
  }, []);

  const rotateLeft = useCallback(() => {
    setViewerState(prev => ({
      ...prev,
      rotation: (prev.rotation - 90 + 360) % 360
    }));
  }, []);

  const resetTransform = useCallback(() => {
    resetViewerState();
  }, [resetViewerState]);

  const fitToScreen = useCallback(() => {
    if (!imageRef.current || !containerRef.current) return;
    
    const container = containerRef.current;
    const img = imageRef.current;
    
    const containerWidth = container.clientWidth - 40; // Account for padding
    const containerHeight = container.clientHeight - 40;
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;
    
    const scaleX = containerWidth / imgWidth;
    const scaleY = containerHeight / imgHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond original size
    
    setViewerState(prev => ({
      ...prev,
      scale,
      translateX: 0,
      translateY: 0
    }));
  }, []);

  // Mouse/touch event handlers for pan and zoom
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setViewerState(prev => ({
      ...prev,
      isDragging: true,
      dragStart: { x, y },
      lastPanPoint: { x: prev.translateX, y: prev.translateY }
    }));
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!viewerState.isDragging) return;
    
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const deltaX = x - viewerState.dragStart.x;
    const deltaY = y - viewerState.dragStart.y;
    
    setViewerState(prev => ({
      ...prev,
      translateX: prev.lastPanPoint.x + deltaX,
      translateY: prev.lastPanPoint.y + deltaY
    }));
  }, [viewerState.isDragging, viewerState.dragStart, viewerState.lastPanPoint]);

  const handleMouseUp = useCallback(() => {
    setViewerState(prev => ({
      ...prev,
      isDragging: false
    }));
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(viewerState.scale * delta, 0.1), 5);
    
    // Zoom towards mouse position
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    
    const scaleDiff = newScale - viewerState.scale;
    const newTranslateX = viewerState.translateX - (x * scaleDiff) / viewerState.scale;
    const newTranslateY = viewerState.translateY - (y * scaleDiff) / viewerState.scale;
    
    setViewerState(prev => ({
      ...prev,
      scale: newScale,
      translateX: newTranslateX,
      translateY: newTranslateY
    }));
  }, [viewerState.scale, viewerState.translateX, viewerState.translateY]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!selectedImage) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          setSelectedImage(null);
          break;
        case '+':
        case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case '0':
          e.preventDefault();
          resetTransform();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          fitToScreen();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          if (e.shiftKey) {
            rotateLeft();
          } else {
            rotateRight();
          }
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, zoomIn, zoomOut, resetTransform, fitToScreen, rotateRight, rotateLeft]);

  // Reset state when modal opens
  useEffect(() => {
    if (selectedImage) {
      resetViewerState();
    }
  }, [selectedImage, resetViewerState]);

  // Auto-fit to screen when image loads
  useEffect(() => {
    if (selectedImage && imageRef.current) {
      const img = imageRef.current;
      const handleLoad = () => {
        setTimeout(fitToScreen, 100); // Small delay to ensure dimensions are available
      };
      
      if (img.complete) {
        handleLoad();
      } else {
        img.addEventListener('load', handleLoad);
        return () => img.removeEventListener('load', handleLoad);
      }
    }
  }, [selectedImage, fitToScreen]);

  if (validImages.length === 0) {
    return null;
  }

  return (
    <div className={`extracted-images-renderer ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Eye className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {validImages.length === 1 ? '1 Image Generated' : `${validImages.length} Images Generated`}
        </span>
        {hasMore && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Show all {validImages.length}
          </button>
        )}
      </div>

      {/* Images Grid */}
      <div className={`grid gap-3 ${
        compact 
          ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' 
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      }`}>
        {imagesToShow.map((image) => (
          <div
            key={image.id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
          >
            {/* Image */}
            <div className="relative group">
              <img
                src={image.data}
                alt={image.description || `Image from ${image.toolName}`}
                className={`w-full object-cover cursor-pointer transition-transform duration-200 group-hover:scale-[1.02] ${
                  compact ? 'h-24' : 'h-32 sm:h-40'
                }`}
                onClick={() => setSelectedImage(image)}
                onError={() => handleImageError(image.id)}
                loading="lazy"
              />
              
              {/* Overlay Controls */}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedImage(image);
                    }}
                    className="p-2 bg-black bg-opacity-50 rounded-full text-white hover:bg-opacity-70"
                    title="View full size"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(image);
                    }}
                    className="p-2 bg-black bg-opacity-50 rounded-full text-white hover:bg-opacity-70"
                    title="Download image"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Image Info */}
            {!compact && (
              <div className="p-3">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {image.description || `Image from ${image.toolName}`}
                </h4>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span className="truncate">{image.toolName}</span>
                  <span>{formatFileSize(image.fileSize)}</span>
                </div>
                {image.dimensions && (
                  <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {image.dimensions.width} × {image.dimensions.height}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Show Less Button */}
      {showAll && hasMore && (
        <div className="mt-3 text-center">
          <button
            onClick={() => setShowAll(false)}
            className="text-xs text-gray-600 dark:text-gray-400 hover:underline"
          >
            Show less
          </button>
        </div>
      )}

      {/* Enhanced Full Screen Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-[9999] bg-black bg-opacity-95 backdrop-blur-sm">
          {/* Modal Header - Fixed at top */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 text-white">
                <Info className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="font-medium">
                    {selectedImage.description || `Image from ${selectedImage.toolName}`}
                  </h3>
                  <p className="text-sm text-gray-300">
                    {selectedImage.toolName} • {formatFileSize(selectedImage.fileSize)}
                    {selectedImage.dimensions && (
                      <span> • {selectedImage.dimensions.width} × {selectedImage.dimensions.height}</span>
                    )}
                  </p>
                </div>
              </div>
              
              {/* Header Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(selectedImage)}
                  className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                  title="Download image (D)"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Toolbar - Fixed at bottom */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-2 p-4">
              <div className="flex items-center gap-1 bg-black bg-opacity-40 rounded-lg p-1">
                <button
                  onClick={zoomOut}
                  className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded transition-colors"
                  title="Zoom out (-)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                
                <span className="px-3 py-2 text-white text-sm font-mono min-w-[60px] text-center">
                  {Math.round(viewerState.scale * 100)}%
                </span>
                
                <button
                  onClick={zoomIn}
                  className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded transition-colors"
                  title="Zoom in (+)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1 bg-black bg-opacity-40 rounded-lg p-1">
                <button
                  onClick={rotateLeft}
                  className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded transition-colors"
                  title="Rotate left (Shift+R)"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                
                <button
                  onClick={rotateRight}
                  className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded transition-colors"
                  title="Rotate right (R)"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1 bg-black bg-opacity-40 rounded-lg p-1">
                <button
                  onClick={fitToScreen}
                  className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded transition-colors"
                  title="Fit to screen (F)"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                
                <button
                  onClick={resetTransform}
                  className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded transition-colors"
                  title="Reset view (0)"
                >
                  <Move className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Image Container - Full screen scrollable */}
          <div
            ref={containerRef}
            className="absolute inset-0 pt-20 pb-20 overflow-hidden cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            style={{
              cursor: viewerState.isDragging ? 'grabbing' : 'grab'
            }}
          >
            <div className="w-full h-full flex items-center justify-center">
              <img
                ref={imageRef}
                src={selectedImage.data}
                alt={selectedImage.description || `Image from ${selectedImage.toolName}`}
                className="max-w-none transition-transform duration-200 ease-out select-none"
                style={{
                  transform: `translate(${viewerState.translateX}px, ${viewerState.translateY}px) scale(${viewerState.scale}) rotate(${viewerState.rotation}deg)`,
                  transformOrigin: 'center center'
                }}
                draggable={false}
                onLoad={() => {
                  // Auto-fit on load if scale is still 1 (default)
                  if (viewerState.scale === 1) {
                    setTimeout(fitToScreen, 100);
                  }
                }}
              />
            </div>
          </div>

          {/* Help overlay - appears on first open */}
          <div className="absolute bottom-24 left-4 text-white text-xs bg-black bg-opacity-60 rounded-lg p-3 max-w-xs">
            <div className="space-y-1">
              <div><strong>Mouse:</strong> Scroll to zoom, drag to pan</div>
              <div><strong>Keys:</strong> +/- zoom, 0 reset, F fit, R rotate, Esc close</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtractedImagesRenderer; 
