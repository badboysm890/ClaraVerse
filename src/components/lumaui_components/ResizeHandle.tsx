import React from 'react';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onMouseDown: (e: React.MouseEvent) => void;
  isResizing?: boolean;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ direction, onMouseDown, isResizing }) => {
  const isHorizontal = direction === 'horizontal';
  
  return (
    <div
      className={`
        ${isHorizontal ? 'w-1 h-full cursor-col-resize' : 'h-1 w-full cursor-row-resize'}
        bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-500 
        transition-colors duration-150 flex-shrink-0 group relative
        ${isResizing ? 'bg-blue-400 dark:bg-blue-500' : ''}
      `}
      onMouseDown={onMouseDown}
    >
      {/* Visual indicator */}
      <div
        className={`
          absolute 
          ${isHorizontal 
            ? 'left-0 top-1/2 -translate-y-1/2 w-1 h-8' 
            : 'top-0 left-1/2 -translate-x-1/2 h-1 w-8'
          }
          bg-gray-400 dark:bg-gray-500 rounded-full opacity-0 group-hover:opacity-100 
          transition-opacity duration-150
          ${isResizing ? 'opacity-100 bg-blue-500' : ''}
        `}
      />
      
      {/* Hover area for easier grabbing */}
      <div
        className={`
          absolute 
          ${isHorizontal 
            ? '-left-1 -right-1 top-0 bottom-0' 
            : '-top-1 -bottom-1 left-0 right-0'
          }
        `}
      />
    </div>
  );
};

export default ResizeHandle; 
