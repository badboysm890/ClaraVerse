import { useState, useCallback, useEffect, useRef } from 'react';

interface UseResizableOptions {
  initialPercentage: number;
  minPercentage?: number;
  maxPercentage?: number;
  direction: 'horizontal' | 'vertical';
  reverse?: boolean; // For right-aligned or bottom-aligned panels
}

export const useResizable = ({ 
  initialPercentage, 
  minPercentage = 15, 
  maxPercentage = 70, 
  direction,
  reverse = false
}: UseResizableOptions) => {
  const [percentage, setPercentage] = useState(initialPercentage);
  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef<number>(0);
  const startPercentageRef = useRef<number>(0);
  const containerRef = useRef<HTMLElement | null>(null);

  const startResize = useCallback((e: React.MouseEvent, container?: HTMLElement) => {
    e.preventDefault();
    console.log('🔧 RESIZE DEBUG - Starting resize...', { direction, initialPercentage: percentage });
    setIsResizing(true);
    startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startPercentageRef.current = percentage;
    
    // Find the container element if not provided
    if (container) {
      containerRef.current = container;
    } else {
      // Find the main layout container with our specific attribute
      let element: HTMLElement | null = document.querySelector('[data-resize-container="true"]');
      
      // Fallback to searching upward from the current element
      if (!element) {
        element = e.currentTarget.parentElement as HTMLElement;
        while (element && !element.className.includes('flex') && !element.getAttribute('data-resize-container')) {
          element = element.parentElement as HTMLElement;
        }
      }
      
      // Final fallback
      if (!element) {
        element = document.body;
      }
      
      containerRef.current = element;
      console.log('🔧 RESIZE DEBUG - Container found:', element, {
        width: element?.clientWidth,
        height: element?.clientHeight,
        className: element?.className
      });
    }
  }, [percentage, direction]);

  const resize = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) {
      console.log('🔧 RESIZE DEBUG - Resize aborted:', { isResizing, hasContainer: !!containerRef.current });
      return;
    }
    
    const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
    const delta = currentPos - startPosRef.current;
    
    const containerSize = direction === 'horizontal' 
      ? containerRef.current.clientWidth 
      : containerRef.current.clientHeight;
    
    const deltaPercentage = (delta / containerSize) * 100;
    // For reverse panels (like right panel), invert the delta
    const adjustedDelta = reverse ? -deltaPercentage : deltaPercentage;
    let newPercentage = startPercentageRef.current + adjustedDelta;
    
    // Apply constraints
    newPercentage = Math.max(minPercentage, Math.min(maxPercentage, newPercentage));
    
    console.log('🔧 RESIZE DEBUG - Calculating new percentage:', {
      currentPos,
      startPos: startPosRef.current,
      delta,
      containerSize,
      deltaPercentage,
      adjustedDelta,
      startPercentage: startPercentageRef.current,
      newPercentage,
      direction,
      reverse
    });
    
    setPercentage(newPercentage);
  }, [isResizing, direction, minPercentage, maxPercentage]);

  const stopResize = useCallback(() => {
    setIsResizing(false);
    containerRef.current = null;
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', resize);
      document.addEventListener('mouseup', stopResize);
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, resize, stopResize, direction]);

  return {
    percentage,
    isResizing,
    startResize,
    setPercentage
  };
}; 
