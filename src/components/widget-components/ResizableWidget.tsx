import React, { useState } from 'react';
import { Maximize2, X } from 'lucide-react';

interface ResizableWidgetProps {
  children: React.ReactNode;
  className?: string;
  isRearrangeMode?: boolean;
  onSizePresetSelect?: (preset: { w: number; h: number }) => void;
  currentSize?: { w: number; h: number };
  widgetType?: string; // Add widget type to determine allowed sizes
}

// Define size constraints for each widget type
export const WIDGET_SIZE_CONSTRAINTS = {
  welcome: {
    minW: 3,
    minH: 2,
    maxW: 12,
    maxH: 12,
    allowedSizes: [
      { label: '3x2', w: 3, h: 2 },
      { label: '3x3', w: 3, h: 3 },
      { label: '4x3', w: 4, h: 3 },
      { label: '4x4', w: 4, h: 4 },
      { label: '6x4', w: 6, h: 4 },
      { label: '6x6', w: 6, h: 6 },
      { label: '8x6', w: 8, h: 6 },
      { label: '8x8', w: 8, h: 8 },
      { label: '10x8', w: 10, h: 8 },
      { label: '10x10', w: 10, h: 10 },
      { label: '12x3', w: 12, h: 3 },
      { label: '12x10', w: 12, h: 10 },
      { label: '12x12', w: 12, h: 12 }
    ]
  },
  'whats-new': {
    minW: 2,
    minH: 3,
    maxW: 12,
    maxH: 12,
    allowedSizes: [
      { label: '2x3', w: 2, h: 3 },
      { label: '3x3', w: 3, h: 3 },
      { label: '4x3', w: 4, h: 3 },
      { label: '4x4', w: 4, h: 4 },
      { label: '6x4', w: 6, h: 4 },
      { label: '6x6', w: 6, h: 6 },
      { label: '8x6', w: 8, h: 6 },
      { label: '8x8', w: 8, h: 8 },
      { label: '10x8', w: 10, h: 8 },
      { label: '10x10', w: 10, h: 10 },
      { label: '12x3', w: 12, h: 3 },
      { label: '12x10', w: 12, h: 10 },
      { label: '12x12', w: 12, h: 12 }
    ]
  },
  capabilities: {
    minW: 2,
    minH: 2,
    maxW: 12,
    maxH: 12,
    allowedSizes: [
      { label: '2x2', w: 2, h: 2 },
      { label: '3x2', w: 3, h: 2 },
      { label: '4x2', w: 4, h: 2 },
      { label: '4x3', w: 4, h: 3 },
      { label: '6x4', w: 6, h: 4 },
      { label: '6x6', w: 6, h: 6 },
      { label: '8x6', w: 8, h: 6 },
      { label: '8x8', w: 8, h: 8 },
      { label: '10x8', w: 10, h: 8 },
      { label: '10x10', w: 10, h: 10 },
      { label: '12x10', w: 12, h: 10 },
      { label: '12x12', w: 12, h: 12 }
    ]
  },
  privacy: {
    minW: 2,
    minH: 2,
    maxW: 12,
    maxH: 12,
    allowedSizes: [
      { label: '2x2', w: 2, h: 2 },
      { label: '3x2', w: 3, h: 2 },
      { label: '3x3', w: 3, h: 3 },
      { label: '4x4', w: 4, h: 4 },
      { label: '6x4', w: 6, h: 4 },
      { label: '6x6', w: 6, h: 6 },
      { label: '8x6', w: 8, h: 6 },
      { label: '8x8', w: 8, h: 8 },
      { label: '10x8', w: 10, h: 8 },
      { label: '10x10', w: 10, h: 10 },
      { label: '12x2', w: 12, h: 2 },
      { label: '12x10', w: 12, h: 10 },
      { label: '12x12', w: 12, h: 12 }
    ]
  },
  webhook: {
    minW: 2,
    minH: 2,
    maxW: 12,
    maxH: 12,
    allowedSizes: [
      { label: '2x2', w: 2, h: 2 },
      { label: '3x3', w: 3, h: 3 },
      { label: '4x3', w: 4, h: 3 },
      { label: '4x4', w: 4, h: 4 },
      { label: '6x4', w: 6, h: 4 },
      { label: '6x6', w: 6, h: 6 },
      { label: '8x6', w: 8, h: 6 },
      { label: '8x8', w: 8, h: 8 },
      { label: '10x8', w: 10, h: 8 },
      { label: '10x10', w: 10, h: 10 },
      { label: '12x10', w: 12, h: 10 },
      { label: '12x12', w: 12, h: 12 }
    ]
  },
  'quick-chat': {
    minW: 3,
    minH: 3,
    maxW: 12,
    maxH: 12,
    allowedSizes: [
      { label: '3x3', w: 3, h: 3 },
      { label: '4x3', w: 4, h: 3 },
      { label: '4x4', w: 4, h: 4 },
      { label: '6x4', w: 6, h: 4 },
      { label: '6x6', w: 6, h: 6 },
      { label: '8x6', w: 8, h: 6 },
      { label: '8x8', w: 8, h: 8 },
      { label: '10x8', w: 10, h: 8 },
      { label: '10x10', w: 10, h: 10 },
      { label: '12x10', w: 12, h: 10 },
      { label: '12x12', w: 12, h: 12 }
    ]
  },
  email: {
    minW: 3,
    minH: 3,
    maxW: 12,
    maxH: 12,
    allowedSizes: [
      { label: '3x3', w: 3, h: 3 },
      { label: '4x3', w: 4, h: 3 },
      { label: '4x4', w: 4, h: 4 },
      { label: '6x4', w: 6, h: 4 },
      { label: '6x6', w: 6, h: 6 },
      { label: '8x6', w: 8, h: 6 },
      { label: '8x8', w: 8, h: 8 },
      { label: '10x8', w: 10, h: 8 },
      { label: '10x10', w: 10, h: 10 },
      { label: '12x10', w: 12, h: 10 },
      { label: '12x12', w: 12, h: 12 }
    ]
  },
  'gpu-monitor': {
    minW: 3,
    minH: 3,
    maxW: 12,
    maxH: 12,
    allowedSizes: [
      { label: '3x3', w: 3, h: 3 },
      { label: '4x4', w: 4, h: 4 },
      { label: '4x6', w: 4, h: 6 },
      { label: '6x4', w: 6, h: 4 },
      { label: '6x6', w: 6, h: 6 },
      { label: '6x8', w: 6, h: 8 },
      { label: '8x6', w: 8, h: 6 },
      { label: '8x8', w: 8, h: 8 },
      { label: '8x10', w: 8, h: 10 },
      { label: '10x8', w: 10, h: 8 },
      { label: '10x10', w: 10, h: 10 },
      { label: '12x8', w: 12, h: 8 },
      { label: '12x10', w: 12, h: 10 },
      { label: '12x12', w: 12, h: 12 }
    ]
  },
  'system-resources': {
    minW: 3,
    minH: 3,
    maxW: 12,
    maxH: 8,
    allowedSizes: [
      { label: '3x3', w: 3, h: 3 },
      { label: '4x4', w: 4, h: 4 },
      { label: '6x4', w: 6, h: 4 },
      { label: '8x6', w: 8, h: 6 },
      { label: '10x7', w: 10, h: 7 },
      { label: '12x8', w: 12, h: 8 }
    ]
  },
  app: {
    minW: 2,
    minH: 2,
    maxW: 12,
    maxH: 12,
    allowedSizes: [
      { label: '2x2', w: 2, h: 2 },
      { label: '3x2', w: 3, h: 2 },
      { label: '3x3', w: 3, h: 3 },
      { label: '4x3', w: 4, h: 3 },
      { label: '4x4', w: 4, h: 4 },
      { label: '6x4', w: 6, h: 4 },
      { label: '6x6', w: 6, h: 6 },
      { label: '8x6', w: 8, h: 6 },
      { label: '8x8', w: 8, h: 8 },
      { label: '10x8', w: 10, h: 8 },
      { label: '10x10', w: 10, h: 10 },
      { label: '12x10', w: 12, h: 10 },
      { label: '12x12', w: 12, h: 12 }
    ]
  }
} as const;

// Default constraints for any widget type not specifically defined
export const DEFAULT_SIZE_CONSTRAINTS = {
  minW: 2,
  minH: 2,
  maxW: 12,
  maxH: 12,
  allowedSizes: [
    { label: '2x2', w: 2, h: 2 },
    { label: '3x2', w: 3, h: 2 },
    { label: '3x3', w: 3, h: 3 },
    { label: '4x3', w: 4, h: 3 },
    { label: '4x4', w: 4, h: 4 },
    { label: '6x4', w: 6, h: 4 },
    { label: '6x6', w: 6, h: 6 },
    { label: '8x6', w: 8, h: 6 },
    { label: '8x8', w: 8, h: 8 },
    { label: '10x8', w: 10, h: 8 },
    { label: '10x10', w: 10, h: 10 },
    { label: '12x10', w: 12, h: 10 },
    { label: '12x12', w: 12, h: 12 }
  ]
} as const;

const ResizableWidget: React.FC<ResizableWidgetProps> = ({
  children,
  className = '',
  isRearrangeMode = false,
  onSizePresetSelect,
  currentSize,
  widgetType = 'default'
}) => {
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [customWidth, setCustomWidth] = useState(currentSize?.w.toString() || '');
  const [customHeight, setCustomHeight] = useState(currentSize?.h.toString() || '');
  
  // Get the appropriate size constraints for this widget type
  const sizeConstraints = WIDGET_SIZE_CONSTRAINTS[widgetType as keyof typeof WIDGET_SIZE_CONSTRAINTS] || DEFAULT_SIZE_CONSTRAINTS;

  const handleSizeSelect = (preset: { w: number; h: number }) => {
    onSizePresetSelect?.(preset);
    setShowSizeMenu(false);
  };

  const handleCustomSizeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = Math.min(Math.max(Number(customWidth), 3), 12);  // Clamp between 3 and 12
    const h = Math.min(Math.max(Number(customHeight), 2), 10); // Clamp between 2 and 10
    
    if (!isNaN(w) && !isNaN(h)) {
      handleSizeSelect({ w, h });
    }
  };

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Resize Menu Button - Separate from draggable area */}
      {isRearrangeMode && (
        <div 
          className="absolute top-2 left-2 z-50"
          onMouseDown={(e) => e.stopPropagation()} // Prevent drag when clicking the button
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSizeMenu(!showSizeMenu);
              setCustomWidth(currentSize?.w.toString() || '');
              setCustomHeight(currentSize?.h.toString() || '');
            }}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm
                     text-gray-700 dark:text-gray-200 transition-all duration-200 hover:scale-105
                     flex items-center gap-1.5"
          >
            <Maximize2 className="w-4 h-4" />
            <span className="text-xs font-medium">
              {currentSize ? `${currentSize.w}x${currentSize.h}` : 'Resize'}
            </span>
          </button>

          {/* Size Presets Menu */}
          {showSizeMenu && (
            <div 
              className="absolute top-full left-0 mt-1 w-48 py-2 rounded-lg shadow-lg z-50 
                        bg-white dark:bg-gray-800"
              onMouseDown={(e) => e.stopPropagation()} // Prevent drag when clicking menu
            >
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">Widget Size</span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSizeMenu(false);
                  }}
                  className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <X className="w-3 h-3 text-gray-400" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1 p-2">
                {sizeConstraints.allowedSizes.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSizeSelect(preset);
                    }}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors
                              ${currentSize?.w === preset.w && currentSize?.h === preset.h
                                ? 'bg-sakura-100 text-sakura-600 dark:bg-sakura-900/30 dark:text-sakura-400'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                              }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              
              {/* Custom Size Input */}
              <div className="px-3 pt-2">
                <form onSubmit={handleCustomSizeSubmit} className="space-y-2">
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Custom Size (W: 3-12, H: 2-10)
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <input
                          type="number"
                          value={customWidth}
                          onChange={(e) => setCustomWidth(e.target.value)}
                          min="3"
                          max="12"
                          placeholder="W"
                          className="w-full px-2 py-1 text-sm rounded
                                   bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <span className="text-gray-400">×</span>
                      <div className="flex-1">
                        <input
                          type="number"
                          value={customHeight}
                          onChange={(e) => setCustomHeight(e.target.value)}
                          min="2"
                          max="10"
                          placeholder="H"
                          className="w-full px-2 py-1 text-sm rounded
                                   bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full px-3 py-1.5 text-sm bg-sakura-500 hover:bg-sakura-600 text-white rounded-md transition-colors"
                  >
                    Apply Custom Size
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Widget Content */}
      <div className="w-full h-full">
        {children}
      </div>
    </div>
  );
};

export default ResizableWidget; 
