import { useCallback, useRef } from 'react';

interface UseSmoothScrollOptions {
  debounceMs?: number;
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
  adaptiveScrolling?: boolean;
}

/**
 * Hook for smooth scrolling with debouncing to prevent jarring behavior
 * Especially useful for streaming content where frequent updates can cause seizure-like scrolling
 */
export const useSmoothScroll = (options: UseSmoothScrollOptions = {}) => {
  const {
    debounceMs = 200,
    behavior = 'smooth',
    block = 'end',
    adaptiveScrolling = true
  } = options;

  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastScrollTimeRef = useRef<number>(0);
  const scrollFrequencyRef = useRef<number[]>([]);

  // Calculate adaptive debounce based on scroll frequency
  const getAdaptiveDebounce = useCallback((customDelay?: number) => {
    if (!adaptiveScrolling) return customDelay || debounceMs;
    
    const now = Date.now();
    const timeSinceLastScroll = now - lastScrollTimeRef.current;
    
    // Track scroll frequency (keep last 10 scroll attempts)
    scrollFrequencyRef.current.push(now);
    if (scrollFrequencyRef.current.length > 10) {
      scrollFrequencyRef.current.shift();
    }
    
    // If scrolling very frequently (< 100ms between calls), increase debounce
    if (timeSinceLastScroll < 100 && scrollFrequencyRef.current.length > 5) {
      return Math.max(customDelay || debounceMs, 400);
    }
    
    // If moderate frequency (100-500ms), use normal debounce
    if (timeSinceLastScroll < 500) {
      return customDelay || debounceMs;
    }
    
    // If infrequent scrolling, reduce debounce for responsiveness
    return Math.min(customDelay || debounceMs, 100);
  }, [adaptiveScrolling, debounceMs]);

  const scrollToElement = useCallback((element: HTMLElement, force = false) => {
    if (!element) return;

    if (force) {
      // Immediate scroll for forced actions
      element.scrollIntoView({ behavior, block });
      lastScrollTimeRef.current = Date.now();
    } else {
      // Debounced scroll for streaming content
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      const adaptiveDelay = getAdaptiveDebounce();
      timeoutRef.current = setTimeout(() => {
        element.scrollIntoView({ behavior, block });
        lastScrollTimeRef.current = Date.now();
      }, adaptiveDelay);
    }
  }, [behavior, block, getAdaptiveDebounce]);

  const scrollToElementImmediate = useCallback((element: HTMLElement) => {
    scrollToElement(element, true);
  }, [scrollToElement]);

  const scrollToElementDebounced = useCallback((element: HTMLElement, customDelay?: number) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    const adaptiveDelay = getAdaptiveDebounce(customDelay);
    timeoutRef.current = setTimeout(() => {
      element.scrollIntoView({ behavior, block });
      lastScrollTimeRef.current = Date.now();
    }, adaptiveDelay);
  }, [behavior, block, getAdaptiveDebounce]);

  const cancelScroll = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  return {
    scrollToElement,
    scrollToElementImmediate,
    scrollToElementDebounced,
    cancelScroll
  };
}; 
