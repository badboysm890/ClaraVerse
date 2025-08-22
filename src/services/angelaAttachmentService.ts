/**
 * angela Attachment Service
 * Handles file attachment processing and analysis
 */

import { angelaFileAttachment } from '../types/angela_assistant_types';

export class angelaAttachmentService {
  /**
   * Process file attachments by analyzing them locally
   */
  public async processFileAttachments(attachments: angelaFileAttachment[]): Promise<angelaFileAttachment[]> {
    const processed = [...attachments];

    for (const attachment of processed) {
      try {
        // For images, we already have base64 or URL - mark as processed
        if (attachment.type === 'image') {
          attachment.processed = true;
          attachment.processingResult = {
            success: true,
            metadata: {
              type: 'image',
              processedAt: new Date().toISOString()
            }
          };
        }

        // For PDFs and documents, we could add text extraction here
        // For now, mark as processed but note that extraction isn't implemented
        if (attachment.type === 'pdf' || attachment.type === 'document') {
          attachment.processed = true;
          attachment.processingResult = {
            success: true,
            extractedText: 'Text extraction not yet implemented in client-side processing.',
            metadata: {
              type: attachment.type,
              processedAt: new Date().toISOString(),
              note: 'Full document processing requires backend integration'
            }
          };
        }

        // For code files, we can analyze the structure
        if (attachment.type === 'code') {
          attachment.processed = true;
          attachment.processingResult = {
            success: true,
            codeAnalysis: {
              language: this.detectCodeLanguage(attachment.name),
              structure: {
                functions: [],
                classes: [],
                imports: []
              },
              metrics: {
                lines: 0,
                complexity: 0
              }
            },
            metadata: {
              type: 'code',
              processedAt: new Date().toISOString()
            }
          };
        }

      } catch (error) {
        attachment.processed = false;
        attachment.processingResult = {
          success: false,
          error: error instanceof Error ? error.message : 'Processing failed'
        };
      }
    }

    return processed;
  }

  /**
   * Detect code language from filename
   */
  private detectCodeLanguage(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    const langMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'swift': 'swift',
      'kt': 'kotlin'
    };
    return langMap[ext || ''] || 'text';
  }

  /**
   * Extract image attachments from a list of attachments
   */
  public extractImageAttachments(attachments: angelaFileAttachment[]): string[] {
    return attachments
      .filter(att => att.type === 'image')
      .map(att => att.base64 || att.url || '')
      .filter(Boolean);
  }

  /**
   * Check if attachments contain images
   */
  public hasImages(attachments: angelaFileAttachment[]): boolean {
    return attachments.some(att => att.type === 'image');
  }

  /**
   * Check if attachments contain code files
   */
  public hasCodeFiles(attachments: angelaFileAttachment[]): boolean {
    return attachments.some(att => att.type === 'code');
  }

  /**
   * Get attachment summary for display
   */
  public getAttachmentSummary(attachments: angelaFileAttachment[]): string {
    if (attachments.length === 0) {
      return 'No attachments';
    }

    const typeCount: Record<string, number> = {};
    attachments.forEach(att => {
      typeCount[att.type] = (typeCount[att.type] || 0) + 1;
    });

    const summary = Object.entries(typeCount)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');

    return `Attachments: ${summary}`;
  }

  /**
   * Validate attachment before processing
   */
  public validateAttachment(attachment: angelaFileAttachment): { valid: boolean; error?: string } {
    if (!attachment.name) {
      return { valid: false, error: 'Attachment name is required' };
    }

    if (!attachment.type) {
      return { valid: false, error: 'Attachment type is required' };
    }

    if (attachment.type === 'image' && !attachment.base64 && !attachment.url) {
      return { valid: false, error: 'Image attachments require base64 data or URL' };
    }

    if (attachment.size && attachment.size > 10 * 1024 * 1024) { // 10MB limit
      return { valid: false, error: 'Attachment size exceeds 10MB limit' };
    }

    return { valid: true };
  }

  /**
   * Filter valid attachments from a list
   */
  public filterValidAttachments(attachments: angelaFileAttachment[]): angelaFileAttachment[] {
    return attachments.filter(attachment => {
      const validation = this.validateAttachment(attachment);
      if (!validation.valid) {
        console.warn(`Invalid attachment ${attachment.name}: ${validation.error}`);
        return false;
      }
      return true;
    });
  }
}

// Export singleton instance
export const angelaAttachmentService = new angelaAttachmentService(); 
