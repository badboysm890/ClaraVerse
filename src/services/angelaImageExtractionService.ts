/**
 * angela Image Extraction Service
 * 
 * This service handles extraction and storage of images from tool results.
 * Images are stored separately from chat history to prevent issues with 
 * models that don't support vision.
 */

import { angelaExtractedImage, angelaMCPToolResult } from '../types/angela_assistant_types';

export class angelaImageExtractionService {
  private static instance: angelaImageExtractionService;
  private imageStorage: Map<string, angelaExtractedImage> = new Map();

  public static getInstance(): angelaImageExtractionService {
    if (!angelaImageExtractionService.instance) {
      angelaImageExtractionService.instance = new angelaImageExtractionService();
    }
    return angelaImageExtractionService.instance;
  }

  /**
   * Extract images from tool results and store them separately
   */
  public extractImagesFromToolResults(
    toolResults: any[],
    messageId: string
  ): angelaExtractedImage[] {
    const extractedImages: angelaExtractedImage[] = [];

    toolResults.forEach((toolResult, toolIndex) => {
      if (toolResult.result && typeof toolResult.result === 'object') {
        // Check for MCP tool results with image content
        if (toolResult.result.content && Array.isArray(toolResult.result.content)) {
          toolResult.result.content.forEach((contentItem: any, contentIndex: number) => {
            if (contentItem.type === 'image' && contentItem.data && contentItem.mimeType) {
              const extractedImage = this.processImageContent(
                contentItem,
                toolResult.toolName || `tool_${toolIndex}`,
                contentIndex,
                messageId
              );
              if (extractedImage) {
                extractedImages.push(extractedImage);
                this.storeImage(extractedImage);
              }
            }
          });
        }

        // Check for direct image data in tool results
        if (toolResult.result.images && Array.isArray(toolResult.result.images)) {
          toolResult.result.images.forEach((imageData: any, imageIndex: number) => {
            const extractedImage = this.processImageContent(
              imageData,
              toolResult.toolName || `tool_${toolIndex}`,
              imageIndex,
              messageId
            );
            if (extractedImage) {
              extractedImages.push(extractedImage);
              this.storeImage(extractedImage);
            }
          });
        }

        // Check for base64 image data in any field
        this.extractBase64Images(toolResult.result, toolResult.toolName || `tool_${toolIndex}`, messageId)
          .forEach(image => {
            extractedImages.push(image);
            this.storeImage(image);
          });
      }
    });

    return extractedImages;
  }

  /**
   * Process individual image content item
   */
  private processImageContent(
    contentItem: any,
    toolName: string,
    contentIndex: number,
    messageId: string
  ): angelaExtractedImage | null {
    try {
      if (!contentItem.data || !contentItem.mimeType) {
        return null;
      }

      const imageId = `${messageId}-${toolName}-${contentIndex}-${Date.now()}`;
      const storagePath = `angela-images/${imageId}`;

      // Ensure data is in proper format
      let imageData = contentItem.data;
      if (!imageData.startsWith('data:')) {
        imageData = `data:${contentItem.mimeType};base64,${imageData}`;
      }

      // Calculate file size (approximate)
      const base64Data = imageData.split(',')[1] || imageData;
      const fileSize = Math.floor((base64Data.length * 3) / 4);

      const extractedImage: angelaExtractedImage = {
        id: imageId,
        toolName,
        contentIndex,
        data: imageData,
        mimeType: contentItem.mimeType,
        description: contentItem.description || `Image from ${toolName}`,
        storagePath,
        fileSize,
        extractedAt: new Date(),
        metadata: {
          messageId,
          originalContentItem: contentItem,
          extractedFrom: 'tool_result'
        }
      };

      // Try to get image dimensions if possible
      this.getImageDimensions(imageData).then(dimensions => {
        if (dimensions) {
          extractedImage.dimensions = dimensions;
          this.updateStoredImage(imageId, extractedImage);
        }
      }).catch(err => {
        console.debug('Could not get image dimensions:', err);
      });

      return extractedImage;
    } catch (error) {
      console.error('Error processing image content:', error);
      return null;
    }
  }

  /**
   * Extract base64 images from any object recursively
   */
  private extractBase64Images(
    obj: any,
    toolName: string,
    messageId: string,
    path: string = ''
  ): angelaExtractedImage[] {
    const images: angelaExtractedImage[] = [];

    if (typeof obj === 'string') {
      // Check for base64 image data
      const base64ImageRegex = /^data:image\/([a-zA-Z]*);base64,([^"]*)/;
      const pureBase64Regex = /^[A-Za-z0-9+/]+=*$/;
      
      if (base64ImageRegex.test(obj)) {
        const match = obj.match(base64ImageRegex);
        if (match) {
          const mimeType = `image/${match[1]}`;
          const extractedImage = this.createExtractedImageFromBase64(
            obj,
            toolName,
            mimeType,
            messageId,
            path
          );
          if (extractedImage) {
            images.push(extractedImage);
          }
        }
      } else if (obj.length > 100 && pureBase64Regex.test(obj)) {
        // Assume it's a base64 image (common formats)
        const extractedImage = this.createExtractedImageFromBase64(
          `data:image/png;base64,${obj}`,
          toolName,
          'image/png',
          messageId,
          path
        );
        if (extractedImage) {
          images.push(extractedImage);
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      // Recursively search for base64 images
      Object.keys(obj).forEach(key => {
        const newPath = path ? `${path}.${key}` : key;
        images.push(...this.extractBase64Images(obj[key], toolName, messageId, newPath));
      });
    }

    return images;
  }

  /**
   * Create extracted image from base64 data
   */
  private createExtractedImageFromBase64(
    dataUrl: string,
    toolName: string,
    mimeType: string,
    messageId: string,
    path: string
  ): angelaExtractedImage | null {
    try {
      const imageId = `${messageId}-${toolName}-base64-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const storagePath = `angela-images/${imageId}`;

      // Calculate file size
      const base64Data = dataUrl.split(',')[1] || dataUrl;
      const fileSize = Math.floor((base64Data.length * 3) / 4);

      return {
        id: imageId,
        toolName,
        contentIndex: -1, // Not from content array
        data: dataUrl,
        mimeType,
        description: `Base64 image from ${toolName} (${path})`,
        storagePath,
        fileSize,
        extractedAt: new Date(),
        metadata: {
          messageId,
          extractedFrom: 'base64_search',
          path
        }
      };
    } catch (error) {
      console.error('Error creating extracted image from base64:', error);
      return null;
    }
  }

  /**
   * Get image dimensions from data URL
   */
  private getImageDimensions(dataUrl: string): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          resolve({
            width: img.naturalWidth,
            height: img.naturalHeight
          });
        };
        img.onerror = () => {
          resolve(null);
        };
        img.src = dataUrl;
      } catch (error) {
        resolve(null);
      }
    });
  }

  /**
   * Store image in memory (could be extended to use IndexedDB or other storage)
   */
  private storeImage(image: angelaExtractedImage): void {
    this.imageStorage.set(image.id, image);
    
    // Optional: Store in localStorage for persistence (with size limits)
    try {
      const storageKey = `angela-image-${image.id}`;
      const imageData = {
        ...image,
        data: image.fileSize && image.fileSize < 50000 ? image.data : undefined // Only store small images in localStorage
      };
      localStorage.setItem(storageKey, JSON.stringify(imageData));
    } catch (error) {
      console.debug('Could not store image in localStorage:', error);
    }
  }

  /**
   * Update stored image
   */
  private updateStoredImage(imageId: string, updatedImage: angelaExtractedImage): void {
    this.imageStorage.set(imageId, updatedImage);
    
    try {
      const storageKey = `angela-image-${imageId}`;
      const imageData = {
        ...updatedImage,
        data: updatedImage.fileSize && updatedImage.fileSize < 50000 ? updatedImage.data : undefined
      };
      localStorage.setItem(storageKey, JSON.stringify(imageData));
    } catch (error) {
      console.debug('Could not update image in localStorage:', error);
    }
  }

  /**
   * Retrieve stored image by ID
   */
  public getImage(imageId: string): angelaExtractedImage | null {
    // Try memory first
    const memoryImage = this.imageStorage.get(imageId);
    if (memoryImage) {
      return memoryImage;
    }

    // Try localStorage
    try {
      const storageKey = `angela-image-${imageId}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const imageData = JSON.parse(stored);
        // Restore to memory
        this.imageStorage.set(imageId, imageData);
        return imageData;
      }
    } catch (error) {
      console.debug('Could not retrieve image from localStorage:', error);
    }

    return null;
  }

  /**
   * Get all images for a message
   */
  public getImagesForMessage(messageId: string): angelaExtractedImage[] {
    const images: angelaExtractedImage[] = [];
    
    // Search memory
    this.imageStorage.forEach(image => {
      if (image.metadata?.messageId === messageId) {
        images.push(image);
      }
    });

    // Search localStorage for any missed images
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('angela-image-')) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const imageData = JSON.parse(stored);
            if (imageData.metadata?.messageId === messageId && 
                !images.find(img => img.id === imageData.id)) {
              images.push(imageData);
            }
          }
        }
      }
    } catch (error) {
      console.debug('Error searching localStorage for images:', error);
    }

    return images.sort((a, b) => a.extractedAt.getTime() - b.extractedAt.getTime());
  }

  /**
   * Clean up old images to prevent storage bloat
   */
  public cleanupOldImages(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - maxAgeMs);
    
    // Clean memory
    this.imageStorage.forEach((image, id) => {
      if (image.extractedAt < cutoff) {
        this.imageStorage.delete(id);
      }
    });

    // Clean localStorage
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('angela-image-')) {
          const stored = localStorage.getItem(key);
          if (stored) {
            const imageData = JSON.parse(stored);
            if (new Date(imageData.extractedAt) < cutoff) {
              keysToRemove.push(key);
            }
          }
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      if (keysToRemove.length > 0) {
        console.log(`Cleaned up ${keysToRemove.length} old extracted images`);
      }
    } catch (error) {
      console.debug('Error cleaning localStorage images:', error);
    }
  }

  /**
   * Get storage statistics
   */
  public getStorageStats(): {
    memoryImages: number;
    localStorageImages: number;
    totalSizeEstimate: number;
  } {
    let memoryImages = this.imageStorage.size;
    let localStorageImages = 0;
    let totalSizeEstimate = 0;

    // Count localStorage images
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('angela-image-')) {
          localStorageImages++;
          const stored = localStorage.getItem(key);
          if (stored) {
            totalSizeEstimate += stored.length;
          }
        }
      }
    } catch (error) {
      console.debug('Error calculating storage stats:', error);
    }

    return {
      memoryImages,
      localStorageImages,
      totalSizeEstimate
    };
  }
}

// Export singleton instance
export const angelaImageExtractionService = angelaImageExtractionService.getInstance(); 
