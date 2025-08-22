/**
 * angela Text-to-Speech Service
 * 
 * This service handles text-to-speech functionality with health checking
 * for the backend service. It automatically hides TTS features when the
 * backend is not available.
 */

export interface TTSRequest {
  text: string;
  language?: string;
  engine?: 'gtts' | 'pyttsx3' | 'kokoro' | 'kokoro-onnx' | 'auto';
  slow?: boolean;
  voice?: string;
  speed?: number;
}

export interface TTSResponse {
  success: boolean;
  audioUrl?: string;
  error?: string;
}

export interface BackendHealth {
  status: string;
  port: number;
  uptime: string;
}

export interface AudioProgress {
  currentTime: number;
  duration: number;
  progress: number; // 0-100
}

export interface AudioControlState {
  isPlaying: boolean;
  isPaused: boolean;
  volume: number; // 0-1
  speed: number; // 0.5-2.0
  currentTime: number;
  duration: number;
  progress: number; // 0-100
  messageId?: string; // Track which message is playing
}

export class angelaTTSService {
  private baseUrl: string;
  private isHealthy: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthCheckCallbacks: ((isHealthy: boolean) => void)[] = [];
  private audioCache: Map<string, string> = new Map();
  private abortController: AbortController | null = null;
  
  // Audio control properties
  private currentAudio: HTMLAudioElement | null = null;
  private currentMessageId: string | null = null;
  private progressUpdateInterval: NodeJS.Timeout | null = null;
  private progressCallbacks: ((progress: AudioProgress) => void)[] = [];
  private stateChangeCallbacks: ((state: AudioControlState) => void)[] = [];

  constructor(baseUrl: string = 'http://localhost:5001') {
    this.baseUrl = baseUrl;
    this.startHealthChecking();
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    // Initial health check
    this.checkHealth();
    
    // Set up periodic health checks every 10 seconds
    this.healthCheckInterval = setInterval(() => {
      this.checkHealth();
    }, 10000);
  }

  /**
   * Stop health checking
   */
  public stopHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Check backend health
   */
  private async checkHealth(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (response.ok) {
        const health: BackendHealth = await response.json();
        const wasHealthy = this.isHealthy;
        this.isHealthy = health.status === 'healthy';
        
        // Notify callbacks if health status changed
        if (wasHealthy !== this.isHealthy) {
          console.log(`🏥 TTS Backend health changed: ${this.isHealthy ? 'healthy' : 'unhealthy'}`);
          this.notifyHealthCallbacks();
        }
      } else {
        this.setUnhealthy();
      }
    } catch (error) {
      this.setUnhealthy();
    }
  }

  /**
   * Set backend as unhealthy
   */
  private setUnhealthy(): void {
    const wasHealthy = this.isHealthy;
    this.isHealthy = false;
    
    if (wasHealthy) {
      console.log('🏥 TTS Backend is unhealthy');
      this.notifyHealthCallbacks();
    }
  }

  /**
   * Notify all health callbacks
   */
  private notifyHealthCallbacks(): void {
    this.healthCheckCallbacks.forEach(callback => {
      try {
        callback(this.isHealthy);
      } catch (error) {
        console.error('Error in health callback:', error);
      }
    });
  }

  /**
   * Subscribe to health status changes
   */
  public onHealthChange(callback: (isHealthy: boolean) => void): () => void {
    this.healthCheckCallbacks.push(callback);
    
    // Immediately call with current status
    callback(this.isHealthy);
    
    // Return unsubscribe function
    return () => {
      const index = this.healthCheckCallbacks.indexOf(callback);
      if (index > -1) {
        this.healthCheckCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get current health status
   */
  public isBackendHealthy(): boolean {
    return this.isHealthy;
  }

  /**
   * Force a health check
   */
  public async forceHealthCheck(): Promise<boolean> {
    await this.checkHealth();
    return this.isHealthy;
  }

  /**
   * Generate cache key for TTS request
   */
  private getCacheKey(request: TTSRequest): string {
    return `${request.text}-${request.engine || 'auto'}-${request.voice || 'af_sarah'}-${request.speed || 1.0}-${request.language || 'en'}`;
  }

  /**
   * Synthesize text to speech
   */
  public async synthesizeText(request: TTSRequest): Promise<TTSResponse> {
    if (!this.isHealthy) {
      return {
        success: false,
        error: 'TTS backend is not available'
      };
    }

    try {
      // Check cache first
      const cacheKey = this.getCacheKey(request);
      if (this.audioCache.has(cacheKey)) {
        return {
          success: true,
          audioUrl: this.audioCache.get(cacheKey)!
        };
      }

      // Cancel any previous request
      if (this.abortController) {
        this.abortController.abort();
      }
      this.abortController = new AbortController();

      const response = await fetch(`${this.baseUrl}/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: request.text,
          language: request.language || 'en',
          engine: request.engine || 'kokoro',
          slow: request.slow || false,
          voice: request.voice || 'af_sarah',
          speed: request.speed || 1.0
        }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.statusText}`);
      }

      // Get audio data as blob
      const audioBlob = await response.blob();
      
      // Create object URL for the audio
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Cache the result (with size limit)
      if (this.audioCache.size > 50) {
        // Remove oldest entries
        const firstKey = this.audioCache.keys().next().value;
        if (firstKey) {
          const oldUrl = this.audioCache.get(firstKey);
          if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
          }
          this.audioCache.delete(firstKey);
        }
      }
      this.audioCache.set(cacheKey, audioUrl);

      return {
        success: true,
        audioUrl
      };

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'TTS request was cancelled'
        };
      }

      console.error('TTS synthesis error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'TTS synthesis failed'
      };
    }
  }

  /**
   * Enhanced audio playback with controls and message tracking
   */
  public async playAudioWithControls(audioUrl: string, initialVolume: number = 1.0, initialSpeed: number = 1.0, messageId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Stop any existing audio
      this.stopPlayback();

      this.currentAudio = new Audio(audioUrl);
      this.currentAudio.volume = initialVolume;
      this.currentAudio.playbackRate = initialSpeed;
      this.currentMessageId = messageId || null;
      
      // Set up event listeners
      this.currentAudio.onloadedmetadata = () => {
        this.notifyStateChange();
        this.startProgressTracking();
      };

      this.currentAudio.onplay = () => {
        this.notifyStateChange();
      };

      this.currentAudio.onpause = () => {
        this.notifyStateChange();
      };

      this.currentAudio.onended = () => {
        this.stopProgressTracking();
        this.notifyStateChange();
        resolve();
      };

      this.currentAudio.onerror = () => {
        this.stopProgressTracking();
        reject(new Error('Audio playback failed'));
      };

      this.currentAudio.ontimeupdate = () => {
        this.notifyProgress();
      };
      
      this.currentAudio.play().catch(reject);
    });
  }

  /**
   * Start progress tracking
   */
  private startProgressTracking(): void {
    this.stopProgressTracking();
    this.progressUpdateInterval = setInterval(() => {
      this.notifyProgress();
    }, 250); // Update every 250ms
  }

  /**
   * Stop progress tracking
   */
  private stopProgressTracking(): void {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval);
      this.progressUpdateInterval = null;
    }
  }

  /**
   * Notify progress callbacks
   */
  private notifyProgress(): void {
    if (!this.currentAudio) return;

    const progress: AudioProgress = {
      currentTime: this.currentAudio.currentTime,
      duration: this.currentAudio.duration || 0,
      progress: this.currentAudio.duration ? (this.currentAudio.currentTime / this.currentAudio.duration) * 100 : 0
    };

    this.progressCallbacks.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.error('Error in progress callback:', error);
      }
    });
  }

  /**
   * Notify state change callbacks
   */
  private notifyStateChange(): void {
    const state: AudioControlState = this.currentAudio ? {
      isPlaying: !this.currentAudio.paused,
      isPaused: this.currentAudio.paused && this.currentAudio.currentTime > 0,
      volume: this.currentAudio.volume,
      speed: this.currentAudio.playbackRate,
      currentTime: this.currentAudio.currentTime,
      duration: this.currentAudio.duration || 0,
      progress: this.currentAudio.duration ? (this.currentAudio.currentTime / this.currentAudio.duration) * 100 : 0,
      messageId: this.currentMessageId || undefined
    } : {
      isPlaying: false,
      isPaused: false,
      volume: 1,
      speed: 1,
      currentTime: 0,
      duration: 0,
      progress: 0,
      messageId: undefined
    };

    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        console.error('Error in state change callback:', error);
      }
    });
  }

  /**
   * Subscribe to progress updates
   */
  public onProgressUpdate(callback: (progress: AudioProgress) => void): () => void {
    this.progressCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.progressCallbacks.indexOf(callback);
      if (index > -1) {
        this.progressCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to state changes
   */
  public onStateChange(callback: (state: AudioControlState) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    
    // Immediately call with current state if audio exists
    if (this.currentAudio) {
      callback({
        isPlaying: !this.currentAudio.paused,
        isPaused: this.currentAudio.paused && this.currentAudio.currentTime > 0,
        volume: this.currentAudio.volume,
        speed: this.currentAudio.playbackRate,
        currentTime: this.currentAudio.currentTime,
        duration: this.currentAudio.duration || 0,
        progress: this.currentAudio.duration ? (this.currentAudio.currentTime / this.currentAudio.duration) * 100 : 0,
        messageId: this.currentMessageId || undefined
      });
    }
    
    // Return unsubscribe function
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Pause current audio
   */
  public pauseAudio(): void {
    if (this.currentAudio && !this.currentAudio.paused) {
      this.currentAudio.pause();
    }
  }

  /**
   * Resume current audio
   */
  public resumeAudio(): void {
    if (this.currentAudio && this.currentAudio.paused) {
      this.currentAudio.play().catch(console.error);
    }
  }

  /**
   * Set audio volume (0-1)
   */
  public setVolume(volume: number): void {
    if (this.currentAudio) {
      this.currentAudio.volume = Math.max(0, Math.min(1, volume));
      this.notifyStateChange();
    }
  }

  /**
   * Set playback speed (0.5-2.0)
   */
  public setSpeed(speed: number): void {
    if (this.currentAudio) {
      this.currentAudio.playbackRate = Math.max(0.5, Math.min(2.0, speed));
      this.notifyStateChange();
    }
  }

  /**
   * Seek to specific time (in seconds)
   */
  public seekTo(time: number): void {
    if (this.currentAudio && this.currentAudio.duration) {
      this.currentAudio.currentTime = Math.max(0, Math.min(this.currentAudio.duration, time));
      this.notifyProgress();
    }
  }

  /**
   * Seek to specific progress percentage (0-100)
   */
  public seekToProgress(progress: number): void {
    if (this.currentAudio && this.currentAudio.duration) {
      const time = (progress / 100) * this.currentAudio.duration;
      this.seekTo(time);
    }
  }

  /**
   * Get current audio state
   */
  public getCurrentState(): AudioControlState | null {
    if (!this.currentAudio) return null;

    return {
      isPlaying: !this.currentAudio.paused,
      isPaused: this.currentAudio.paused && this.currentAudio.currentTime > 0,
      volume: this.currentAudio.volume,
      speed: this.currentAudio.playbackRate,
      currentTime: this.currentAudio.currentTime,
      duration: this.currentAudio.duration || 0,
      progress: this.currentAudio.duration ? (this.currentAudio.currentTime / this.currentAudio.duration) * 100 : 0,
      messageId: this.currentMessageId || undefined
    };
  }

  /**
   * Check if audio is currently playing
   */
  public isCurrentlyPlaying(): boolean {
    return this.currentAudio ? !this.currentAudio.paused : false;
  }

  /**
   * Check if a specific message is currently playing
   */
  public isMessagePlaying(messageId: string): boolean {
    return this.currentMessageId === messageId && this.isCurrentlyPlaying();
  }

  /**
   * Play audio from URL (legacy method for compatibility)
   */
  public async playAudio(audioUrl: string): Promise<void> {
    return this.playAudioWithControls(audioUrl);
  }

  /**
   * Synthesize and play text with controls
   */
  public async synthesizeAndPlayWithControls(request: TTSRequest, initialVolume: number = 1.0, initialSpeed: number = 1.0, messageId?: string): Promise<void> {
    const result = await this.synthesizeText(request);
    
    if (result.success && result.audioUrl) {
      await this.playAudioWithControls(result.audioUrl, initialVolume, initialSpeed, messageId);
    } else {
      throw new Error(result.error || 'TTS synthesis failed');
    }
  }

  /**
   * Synthesize and play text (legacy method for compatibility)
   */
  public async synthesizeAndPlay(request: TTSRequest): Promise<void> {
    return this.synthesizeAndPlayWithControls(request);
  }

  /**
   * Stop current TTS playback
   */
  public stopPlayback(): void {
    // Stop any ongoing synthesis
    if (this.abortController) {
      this.abortController.abort();
    }

    // Stop current audio and clean up
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }

    // Clear current message ID
    this.currentMessageId = null;

    // Stop progress tracking
    this.stopProgressTracking();

    // Stop all other audio elements (fallback)
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });

    // Notify state change
    this.notifyStateChange();
  }

  /**
   * Clear audio cache and revoke URLs
   */
  public clearCache(): void {
    this.audioCache.forEach(url => {
      URL.revokeObjectURL(url);
    });
    this.audioCache.clear();
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopHealthChecking();
    this.stopPlayback();
    this.clearCache();
    this.healthCheckCallbacks = [];
  }
}

// Create singleton instance
export const angelaTTSService = new angelaTTSService();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    angelaTTSService.destroy();
  });
} 
