import { angelaMessage, angelaAIConfig } from '../types/angela_assistant_types';

// Simple interface for voice transcription only
export interface VoiceTranscriptionResult {
  transcription: string;
  success: boolean;
  error?: string;
}

export interface VoiceConversationState {
  isListening: boolean;
  isProcessing: boolean;
  error: string | null;
}

/**
 * angela Voice Service - Simplified for transcription only
 * This service only handles speech-to-text transcription as an accessibility feature
 */
export class angelaVoiceService {
  private baseUrl: string;
  private abortController: AbortController | null = null;

  constructor(baseUrl: string = 'http://localhost:5001') {
    this.baseUrl = baseUrl;
  }

  /**
   * Transcribe audio to text only - no AI processing
   */
  async transcribeAudio(audioBlob: Blob): Promise<VoiceTranscriptionResult> {
    try {
      this.abortController = new AbortController();
      
      const transcription = await this.speechToText(audioBlob);
      
      return {
        transcription,
        success: true
      };
    } catch (error) {
      console.error('Voice transcription error:', error);
      return {
        transcription: '',
        success: false,
        error: error instanceof Error ? error.message : 'Transcription failed'
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Convert speech to text using the backend service
   */
  private async speechToText(audioBlob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');

    const response = await fetch(`${this.baseUrl}/transcribe`, {
      method: 'POST',
      body: formData,
      signal: this.abortController?.signal
    });

    if (!response.ok) {
      throw new Error(`Speech-to-text failed: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Check for the correct response format from the backend
    if (result.status !== 'success') {
      throw new Error(result.error || 'Speech-to-text processing failed');
    }

    // Extract the transcription text from the nested structure
    return result.transcription?.text || '';
  }

  /**
   * Stop any ongoing transcription
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Test speech-to-text functionality
   */
  async testSTT(audioBlob: Blob): Promise<string> {
    const result = await this.transcribeAudio(audioBlob);
    if (result.success) {
      return result.transcription;
    } else {
      throw new Error(result.error || 'STT test failed');
    }
  }
}

// Export singleton instance
export const angelaVoiceService = new angelaVoiceService();
