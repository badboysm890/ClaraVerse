import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, ArrowLeft, Waves, Radio, Zap, Sparkles, Heart, MessageSquare } from 'lucide-react';

// Import TTS service for health monitoring
import { angelaTTSService } from '../../services/angelaTTSService';

// VAD (Voice Activity Detection) using @ricky0123/vad-web
interface VADOptions {
  onSpeechStart: () => void;
  onSpeechEnd: (audio: Float32Array) => void;
  onVADMisfire: () => void;
  positiveSpeechThreshold: number;
  negativeSpeechThreshold: number;
  redemptionFrames: number;
  frameSamples: number;
  preSpeechPadFrames: number;
  minSpeechFrames: number;
}

interface angelaVoiceChatProps {
  isEnabled: boolean;
  onToggle: () => void;
  onSendAudio: (audioBlob: Blob) => Promise<void>;
  onReceiveAudio?: (audioUrl: string) => void;
  isProcessing: boolean;
  isAIResponding?: boolean;
  isStreaming?: boolean;
  streamingText?: string;
  autoTTSText?: string;
  autoTTSTrigger?: {text: string, timestamp: number} | null;
  onBackToChat?: () => void; // New prop to go back to chat mode
}

// Compact Audio Visualizer for the input bar
const CompactAudioVisualizer: React.FC<{ 
  isListening: boolean; 
  isSpeaking: boolean; 
  audioLevel: number;
  isProcessing: boolean;
  isAIResponding?: boolean;
  isTTSHealthy?: boolean;
  isAutoTTSPlaying?: boolean;
}> = ({ 
  isListening, 
  isSpeaking, 
  audioLevel, 
  isProcessing, 
  isAIResponding = false,
  isTTSHealthy = false,
  isAutoTTSPlaying = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = (timestamp: number) => {
      const width = canvas.width;
      const height = canvas.height;
      
      // Clear canvas
      ctx.clearRect(0, 0, width, height);
      
      const centerX = width / 2;
      const centerY = height / 2;
      const time = timestamp * 0.001;
      
      if (isProcessing) {
        // Processing: Simple pulsing circle
        const radius = 8 + Math.sin(time * 4) * 3;
        ctx.fillStyle = '#3b82f6';
        ctx.globalAlpha = 0.6 + Math.sin(time * 3) * 0.3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
        
      } else if (isAIResponding) {
        // AI Responding: Purple pulsing
        const radius = 8 + Math.sin(time * 2) * 4;
        ctx.fillStyle = '#a855f7';
        ctx.globalAlpha = 0.7 + Math.sin(time * 2) * 0.2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
        
      } else if (isListening) {
        // Listening: Green bars based on audio level
        const bars = 5;
        const barWidth = 3;
        const spacing = 2;
        const totalWidth = bars * barWidth + (bars - 1) * spacing;
        const startX = centerX - totalWidth / 2;
        
        ctx.fillStyle = '#22c55e';
        for (let i = 0; i < bars; i++) {
          const barHeight = 4 + audioLevel * 12 + Math.sin(time * 8 + i) * 3;
          const x = startX + i * (barWidth + spacing);
          const y = centerY - barHeight / 2;
          
          ctx.globalAlpha = 0.7 + Math.sin(time * 6 + i) * 0.2;
          ctx.fillRect(x, y, barWidth, barHeight);
        }
        ctx.globalAlpha = 1;
        
      } else if (isSpeaking || isAutoTTSPlaying) {
        // Speaking: Pink wave
        const amplitude = 6;
        const frequency = 0.1;
        
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
          ctx.beginPath();
        
        for (let x = 0; x < width; x += 2) {
          const y = centerY + Math.sin(x * frequency + time * 4) * amplitude;
          if (x === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        ctx.globalAlpha = 1;
        
      } else {
        // Idle: Simple dot
        const radius = isTTSHealthy ? 4 : 4;
        ctx.fillStyle = isTTSHealthy ? '#6b7280' : '#ef4444';
        ctx.globalAlpha = 0.5 + Math.sin(time * 2) * 0.2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      
      animationRef.current = requestAnimationFrame(draw);
    };
    
    animationRef.current = requestAnimationFrame(draw);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isListening, isSpeaking, audioLevel, isProcessing, isAIResponding, isTTSHealthy, isAutoTTSPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={80}
      height={24}
      className="w-20 h-6"
    />
  );
};

// Main compact voice chat component
const angelaVoiceChat: React.FC<angelaVoiceChatProps> = ({
  isEnabled,
  onToggle,
  onSendAudio,
  onReceiveAudio,
  isProcessing,
  isAIResponding = false,
  isStreaming = false,
  streamingText = '',
  autoTTSText = '',
  autoTTSTrigger = null,
  onBackToChat
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [vadReady, setVadReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  
  // TTS health monitoring state
  const [isTTSHealthy, setIsTTSHealthy] = useState(false);
  
  // Auto TTS state
  const [autoTTSEnabled, setAutoTTSEnabled] = useState(false);
  const [isAutoTTSPlaying, setIsAutoTTSPlaying] = useState(false);
  
  // Audio refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  
  // Add initialization tracking to prevent multiple instances
  const isInitializingRef = useRef<boolean>(false);
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Add ref to track processed auto TTS triggers to prevent repetition
  const processedTriggerRef = useRef<{text: string, timestamp: number} | null>(null);
  
  // Refs to track current state for VAD callbacks (to prevent stale closure issues)
  const isProcessingAudioRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const isAIRespondingRef = useRef<boolean>(false);
  const isEnabledRef = useRef<boolean>(false);
  const isListeningRef = useRef<boolean>(false);
  const isManualRecordingRef = useRef<boolean>(false);
  const isAutoTTSPlayingRef = useRef<boolean>(false);
  const autoTTSEnabledRef = useRef<boolean>(false);
  
  // Add ref to prevent VAD destruction during restart operations
  const isRestartingVADRef = useRef<boolean>(false);
  
  // Manual recording state (fallback when VAD fails)
  const [isManualRecording, setIsManualRecording] = useState(false);
  const [manualRecorder, setManualRecorder] = useState<MediaRecorder | null>(null);
  const [manualAudioChunks, setManualAudioChunks] = useState<Blob[]>([]);
  
  // Permission state
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied' | 'requesting'>('unknown');
  
  // Detect if we're running in Electron
  const isElectron = typeof window !== 'undefined' && window.process && window.process.type;
  
  // Audio level monitoring
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current || !isListening) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Calculate RMS (Root Mean Square) for audio level
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const normalizedLevel = Math.min(rms / 128, 1);
    
    setAudioLevel(normalizedLevel);
    
    // Continue monitoring only if still listening and enabled
    if (isListening && isEnabledRef.current) {
      requestAnimationFrame(monitorAudioLevel);
    }
  }, [isListening]);

  // Setup audio context and analyser for level monitoring
  const setupAudioAnalyser = useCallback(async () => {
    try {
      // Reuse existing audio context if available and not closed
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }
      
      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      // Reuse existing analyser if available
      if (!analyserRef.current) {
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
      }
      
      // Only get new stream if we don't have one or it's inactive
      if (!streamRef.current || !streamRef.current.active) {
        // Get microphone stream for analysis
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
      }
      
      console.log('🎤 Audio analyser setup complete');
    } catch (error) {
      console.error('Failed to setup audio analyser:', error);
    }
  }, []);

  // Cleanup audio resources
  const cleanupAudioResources = useCallback(() => {
    // Stop stream tracks immediately
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Close audio context asynchronously to avoid blocking
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      // Don't wait for close to complete - do it asynchronously
      audioContextRef.current.close().catch(error => {
        console.warn('Audio context close error (non-blocking):', error);
      });
      audioContextRef.current = null;
    }
    
    // Clear analyser reference immediately
    analyserRef.current = null;
    setAudioLevel(0);
    console.log('🎤 Audio resources cleaned up');
  }, []);

  // Request microphone permission
  const requestMicrophonePermission = async (): Promise<boolean> => {
    try {
      setPermissionStatus('requesting');
      console.log('🎤 Requesting microphone permission...');
      
      // Handle Electron environment
      if (isElectron) {
        console.log('🖥️ Detected Electron environment');
        
        // In Electron, we need to request permission through the main process
        // First, try to access the microphone directly
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          console.log('✅ Microphone permission granted in Electron');
          setPermissionStatus('granted');
          
          // Stop the stream immediately as we just needed permission
          stream.getTracks().forEach(track => track.stop());
          return true;
        } catch (electronError) {
          console.error('❌ Electron microphone access failed:', electronError);
          
          // If direct access fails, check if we have access to Electron's API
          if (window.electronAPI && (window.electronAPI as any).requestMicrophonePermission) {
            console.log('🔧 Requesting permission through Electron API...');
            const granted = await (window.electronAPI as any).requestMicrophonePermission();
            if (granted) {
              setPermissionStatus('granted');
              return true;
            }
          }
          
          // Fallback: Show instructions for manual permission grant
          setPermissionStatus('denied');
          setError('Microphone access denied. Please enable microphone permissions in your system settings for this app.');
          return false;
        }
      } else {
        // Regular browser environment
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // If we get here, permission was granted
        console.log('✅ Microphone permission granted');
        setPermissionStatus('granted');
        
        // Stop the stream immediately as we just needed permission
        stream.getTracks().forEach(track => track.stop());
        
        return true;
      }
    } catch (error) {
      console.error('❌ Microphone permission denied:', error);
      setPermissionStatus('denied');
      
      if (isElectron) {
        setError('Microphone access denied. Please check your system settings and ensure this app has microphone permissions.');
      } else {
        setError('Microphone access denied. Please allow microphone access in your browser settings.');
      }
      return false;
    }
  };

  // Check existing permission status
  const checkPermissionStatus = async () => {
    try {
      if (!navigator.permissions) {
        console.log('⚠️ Permissions API not supported, will request on demand');
        setPermissionStatus('unknown');
        return;
      }

      const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      console.log('🎤 Current microphone permission:', permission.state);
      
      if (permission.state === 'granted') {
        setPermissionStatus('granted');
      } else if (permission.state === 'denied') {
        setPermissionStatus('denied');
        setError('Microphone access denied. Please allow microphone access in your browser settings.');
      } else {
        setPermissionStatus('unknown');
      }

      // Listen for permission changes
      permission.onchange = () => {
        console.log('🎤 Permission status changed:', permission.state);
        if (permission.state === 'granted') {
          setPermissionStatus('granted');
          setError(null);
        } else if (permission.state === 'denied') {
          setPermissionStatus('denied');
          setError('Microphone access denied. Please allow microphone access in your browser settings.');
        }
      };
    } catch (error) {
      console.warn('Could not check permission status:', error);
      setPermissionStatus('unknown');
    }
  };

  // Convert Float32Array to Blob
  const convertFloat32ArrayToBlob = async (float32Array: Float32Array): Promise<Blob | null> => {
    try {
      // Create audio context for conversion
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const audioBuffer = audioContext.createBuffer(1, float32Array.length, 16000);
      audioBuffer.copyToChannel(float32Array, 0);
      
      // Convert to WAV format
      const wavBlob = await audioBufferToWav(audioBuffer);
      return wavBlob;
    } catch (error) {
      console.error('Error converting audio:', error);
      return null;
    }
  };

  // Convert AudioBuffer to WAV Blob
  const audioBufferToWav = (audioBuffer: AudioBuffer): Promise<Blob> => {
    return new Promise((resolve) => {
      const numberOfChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const format = 1; // PCM
      const bitDepth = 16;
      
      const bytesPerSample = bitDepth / 8;
      const blockAlign = numberOfChannels * bytesPerSample;
      
      const buffer = audioBuffer.getChannelData(0);
      const arrayBuffer = new ArrayBuffer(44 + buffer.length * bytesPerSample);
      const view = new DataView(arrayBuffer);
      
      // WAV header
      const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };
      
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + buffer.length * bytesPerSample, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, format, true);
      view.setUint16(22, numberOfChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * blockAlign, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitDepth, true);
      writeString(36, 'data');
      view.setUint32(40, buffer.length * bytesPerSample, true);
      
      // Convert float samples to 16-bit PCM
      let offset = 44;
      for (let i = 0; i < buffer.length; i++) {
        const sample = Math.max(-1, Math.min(1, buffer[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
      
      resolve(new Blob([arrayBuffer], { type: 'audio/wav' }));
    });
  };

  // TTS health monitoring
  useEffect(() => {
    console.log('🔊 Setting up TTS health monitoring for voice chat...');
    
    const unsubscribe = angelaTTSService.onHealthChange((isHealthy) => {
      setIsTTSHealthy(isHealthy);
      console.log(`🔊 TTS health changed in voice chat: ${isHealthy ? 'healthy' : 'unhealthy'}`);
      
      if (!isHealthy) {
        console.log('🔊 TTS backend unhealthy - voice features may be limited');
      }
    });
    
    // Cleanup subscription on unmount
    return () => {
      console.log('🔊 Cleaning up TTS health monitoring for voice chat');
      unsubscribe();
    };
  }, []);

  // Check permissions on mount
  useEffect(() => {
    checkPermissionStatus();
  }, []);

  // Initialize VAD only after permission is granted
  useEffect(() => {
    const initializeVAD = async () => {
      // Prevent multiple simultaneous initializations
      if (isInitializingRef.current) {
        console.log('🎤 VAD initialization already in progress, skipping...');
        return;
      }
      
      // Only initialize if we have permission
      if (permissionStatus !== 'granted') {
        console.log('🎤 Waiting for microphone permission before initializing VAD');
        return;
      }

      // Don't reinitialize if VAD is already ready and working
      if (vadReady && vadRef.current) {
        console.log('🎤 VAD already initialized and ready, skipping...');
        return;
      }

      // Cleanup any existing VAD instance first
      if (vadRef.current) {
        console.log('🎤 Cleaning up existing VAD instance before reinitializing...');
        vadRef.current.pause();
        vadRef.current.destroy();
        vadRef.current = null;
        setVadReady(false);
      }

      isInitializingRef.current = true;

      try {
        console.log('🎤 Initializing VAD with granted permissions...');
        setError(null); // Clear any previous errors
        
        // Add timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
          console.error('❌ VAD initialization timeout after 30 seconds');
          setError('VAD initialization timed out. Please refresh the page and try again.');
          setVadReady(false);
          isInitializingRef.current = false;
        }, 30000);
        
        // Dynamic import of VAD library
        console.log('🎤 Importing VAD library...');
        const { MicVAD } = await import('@ricky0123/vad-web');
        console.log('🎤 VAD library imported successfully');
        
        console.log('🎤 Creating MicVAD instance...');
        const vad = await MicVAD.new({
          onSpeechStart: () => {
            console.log('🎤 Speech started');
            setIsListening(true);
            audioChunksRef.current = [];
          },
          onSpeechEnd: async (audio: Float32Array) => {
            console.log('🎤 Speech ended');
            
            // CRITICAL: Check if we should ignore this speech due to concurrent processing
            if (isProcessingAudioRef.current || isProcessingRef.current || isAIRespondingRef.current) {
              console.log('🎤 Ignoring speech end - already processing or AI responding');
              setIsListening(false);
              setAudioLevel(0);
              return;
            }
            
            setIsListening(false);
            setAudioLevel(0);
            setIsProcessingAudio(true);
            
            // Pause VAD to prevent continuous listening during processing
            if (vadRef.current) {
              vadRef.current.pause();
              console.log('🎤 VAD paused for processing');
            }
            
            // Convert Float32Array to Blob and send
            const audioBlob = await convertFloat32ArrayToBlob(audio);
            if (audioBlob) {
              try {
                await onSendAudio(audioBlob);
                console.log('🎤 Audio sent successfully');
              } catch (error: unknown) {
                console.error('🎤 Error sending audio:', error);
              }
            }
            
            // Mark processing as complete
            setIsProcessingAudio(false);
            
            // Improved auto-restart logic with better state checking
            const restartVAD = async () => {
              // Wait a bit longer to ensure all state updates are complete
              await new Promise(resolve => setTimeout(resolve, 300));
              
              // Check if Auto TTS is enabled - if not, don't auto-restart (manual mode)
              if (!autoTTSEnabledRef.current) {
                console.log('🎤 Auto TTS disabled - switching to manual mode (no auto-restart)');
                // Don't restart VAD automatically when Auto TTS is off
                // User needs to manually restart voice mode
                return;
              }
              
              // Mark that we're restarting to prevent cleanup
              isRestartingVADRef.current = true;
              
              // Double-check all conditions before restarting (only when Auto TTS is enabled)
              const canRestart = (
                isEnabledRef.current && 
                vadRef.current && 
                vadReady &&
                !isListeningRef.current && 
                !isProcessingAudioRef.current && 
                !isProcessingRef.current && 
                !isAIRespondingRef.current && 
                !isAutoTTSPlayingRef.current
              );
              
              if (canRestart) {
                try {
                  console.log('🎤 Auto-restarting VAD after speech processing (Auto TTS enabled)...');
                  
                  // Light cleanup - only stop existing streams, don't destroy audio context
                  if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                    streamRef.current = null;
                  }
                  setAudioLevel(0);
                  
                  // Small delay to ensure cleanup is complete
                  await new Promise(resolve => setTimeout(resolve, 100));
                  
                  // Setup fresh audio analyser and restart VAD
                  await setupAudioAnalyser();
                  await vadRef.current.start();
                  
                  console.log('🎤 VAD auto-restarted successfully');
                  
                  // Start monitoring audio level
                  monitorAudioLevel();
                  
                } catch (restartError) {
                  console.error('🎤 Failed to auto-restart VAD:', restartError);
                  
                  // If VAD restart fails, try manual recording as fallback
                  if (permissionStatus === 'granted') {
                    console.log('🎤 Falling back to manual recording mode');
                    try {
                      await startManualRecording();
                    } catch (manualError) {
                      console.error('🎤 Manual recording fallback also failed:', manualError);
                    }
                  }
                }
              } else {
                console.log('🎤 Cannot restart VAD - conditions not met:', {
                  enabled: isEnabledRef.current,
                  vadExists: !!vadRef.current,
                  vadReady,
                  listening: isListeningRef.current,
                  processingAudio: isProcessingAudioRef.current,
                  processing: isProcessingRef.current,
                  aiResponding: isAIRespondingRef.current,
                  autoTTSPlaying: isAutoTTSPlayingRef.current
                });
              }
              
              // Clear restart flag
              isRestartingVADRef.current = false;
            };
            
            // Execute restart logic
            restartVAD();
          },
          onVADMisfire: () => {
            console.log('🎤 VAD misfire - false positive detected');
            setIsListening(false);
            setAudioLevel(0);
          },
          // Improved VAD parameters for better speech detection
          positiveSpeechThreshold: 0.6,
          negativeSpeechThreshold: 0.15,
          redemptionFrames: 8,
          frameSamples: 1536,
          preSpeechPadFrames: 1,
          minSpeechFrames: 4
        });
        
        clearTimeout(timeoutId);
        vadRef.current = vad;
        setVadReady(true);
        console.log('✅ VAD initialized successfully');
        
      } catch (error) {
        console.error('❌ Failed to initialize VAD:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setError(`Failed to initialize voice detection: ${errorMessage}`);
        setVadReady(false);
      } finally {
        isInitializingRef.current = false;
      }
    };

    // Only initialize VAD when we have permission and it's not already ready
    if (permissionStatus === 'granted' && !vadReady && !isInitializingRef.current) {
      initializeVAD();
    }

    return () => {
      // Only cleanup on unmount or when permission is actually lost
      // Don't cleanup if we're in the middle of a restart operation
      if (!isRestartingVADRef.current && vadRef.current && permissionStatus !== 'granted') {
        console.log('🎤 Cleaning up VAD due to permission loss');
        vadRef.current.pause();
        vadRef.current.destroy();
        vadRef.current = null;
        setVadReady(false);
      } else if (isRestartingVADRef.current) {
        console.log('🎤 Skipping VAD cleanup - restart in progress');
      } else if (permissionStatus === 'granted' && vadRef.current) {
        console.log('🎤 Preserving VAD instance - permission still granted');
      }
      
      // Only cleanup audio resources if permission is lost
      if (permissionStatus !== 'granted') {
        cleanupAudioResources();
      }
      
      // Reset initialization flag only if permission is lost
      if (permissionStatus !== 'granted') {
        isInitializingRef.current = false;
      }
    };
  }, [permissionStatus]); // Keep only permissionStatus as dependency

  // Separate cleanup effect for component unmount
  useEffect(() => {
    return () => {
      // Cleanup when component unmounts
      console.log('🎤 Voice chat component unmounting - cleaning up VAD...');
      
      if (vadRef.current) {
        vadRef.current.pause();
        vadRef.current.destroy();
        vadRef.current = null;
      }
      
      cleanupAudioResources();
      isInitializingRef.current = false;
      setVadReady(false);
    };
  }, []); // Empty dependency array - only runs on unmount

  // Auto-request permission and initialize VAD when voice mode is enabled
  useEffect(() => {
    const initializeVoiceMode = async () => {
      // Only proceed if voice mode is enabled
      if (!isEnabledRef.current) {
        // Voice mode disabled - stop everything
        if (vadRef.current && isListeningRef.current) {
          vadRef.current.pause();
          console.log('🎤 VAD stopped (voice mode disabled)');
          setIsListening(false);
          setAudioLevel(0);
          cleanupAudioResources();
        }
        if (isManualRecordingRef.current) {
          stopManualRecording();
        }
        setIsProcessingAudio(false);
        return;
      }
      
      // Voice mode enabled - check if AI is responding or auto TTS is playing
      if (isAIRespondingRef.current || isAutoTTSPlayingRef.current) {
        // AI is responding or auto TTS is playing - pause voice detection
        if (vadRef.current && isListeningRef.current) {
          vadRef.current.pause();
          console.log('🎤 VAD paused (AI is responding or auto TTS is playing)');
          setIsListening(false);
          setAudioLevel(0);
          cleanupAudioResources();
        }
        if (isManualRecordingRef.current) {
        stopManualRecording();
      }
      return;
    }

      // If we don't have permission yet, request it automatically
      if (permissionStatus !== 'granted') {
        console.log('🎤 Voice mode enabled but no microphone permission - requesting automatically...');
        const granted = await requestMicrophonePermission();
        if (!granted) {
          console.log('🎤 Microphone permission denied, voice mode cannot start');
      return;
    }
        return;
      }
      
      // If we have permission but VAD isn't ready, wait for it
      if (permissionStatus === 'granted' && !vadReady && !isInitializingRef.current) {
        console.log('🎤 Permission granted, waiting for VAD to initialize...');
        return;
      }
      
      // If everything is ready, start listening
      if (vadReady && vadRef.current && !isListeningRef.current && !isProcessingAudioRef.current && !isProcessingRef.current) {
        try {
          console.log('🎤 Auto-starting VAD (voice mode enabled)');
          
          // Light cleanup - only stop existing streams, don't destroy audio context
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          setAudioLevel(0);
          
          // Small delay to ensure cleanup is complete
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Setup fresh audio analyser and start VAD
          await setupAudioAnalyser();
          await vadRef.current.start();
          
          console.log('🎤 VAD auto-started successfully');
          monitorAudioLevel();
          
    } catch (error) {
          console.error('🎤 Failed to auto-start VAD:', error);
          // Fallback to manual recording
          if (permissionStatus === 'granted') {
            console.log('🎤 Falling back to manual recording mode');
            try {
              await startManualRecording();
            } catch (manualError) {
              console.error('🎤 Manual recording fallback also failed:', manualError);
            }
          }
        }
      }
    };

    initializeVoiceMode();
  }, [isEnabled, permissionStatus, vadReady, isAIResponding, isAutoTTSPlaying, isProcessing]);

  // Manual recording functions
  const startManualRecording = async () => {
    try {
      // Check permission before starting
      if (permissionStatus !== 'granted') {
        const granted = await requestMicrophonePermission();
        if (!granted) {
      return;
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        await onSendAudio(audioBlob);
        setManualAudioChunks([]);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setManualRecorder(recorder);
      setManualAudioChunks(chunks);
      setIsManualRecording(true);
      setIsListening(true);
    } catch (error) {
      console.error('Failed to start manual recording:', error);
      setError('Failed to access microphone');
    }
  };

  const stopManualRecording = () => {
    if (manualRecorder && manualRecorder.state === 'recording') {
      manualRecorder.stop();
      setManualRecorder(null);
      setIsManualRecording(false);
        setIsListening(false);
    }
  };

  // Update refs when state changes to prevent stale closure issues
  useEffect(() => {
    isProcessingAudioRef.current = isProcessingAudio;
  }, [isProcessingAudio]);
  
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);
  
  useEffect(() => {
    isAIRespondingRef.current = isAIResponding;
  }, [isAIResponding]);
  
  useEffect(() => {
    isEnabledRef.current = isEnabled;
  }, [isEnabled]);
  
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);
  
  useEffect(() => {
    isManualRecordingRef.current = isManualRecording;
  }, [isManualRecording]);

  useEffect(() => {
    isAutoTTSPlayingRef.current = isAutoTTSPlaying;
  }, [isAutoTTSPlaying]);

  useEffect(() => {
    autoTTSEnabledRef.current = autoTTSEnabled;
  }, [autoTTSEnabled]);

  // Auto TTS effect - process autoTTSTrigger when enabled
  useEffect(() => {
    const processAutoTTS = async () => {
      // Only process if auto TTS is enabled and we have a trigger
      if (!autoTTSEnabled || !autoTTSTrigger || !isTTSHealthy) {
        return;
      }

      // Check if this trigger was already processed to prevent repetition
      if (processedTriggerRef.current && 
          processedTriggerRef.current.text === autoTTSTrigger.text && 
          processedTriggerRef.current.timestamp === autoTTSTrigger.timestamp) {
        return;
      }

      // Mark this trigger as processed before starting TTS
      processedTriggerRef.current = {
        text: autoTTSTrigger.text,
        timestamp: autoTTSTrigger.timestamp
      };

      try {
        // Pause voice detection during TTS
        if (vadRef.current && isListeningRef.current) {
          vadRef.current.pause();
          setIsListening(false);
          setAudioLevel(0);
          cleanupAudioResources();
        }

        // Stop manual recording if active
        if (isManualRecordingRef.current) {
          stopManualRecording();
        }

        setIsAutoTTSPlaying(true);
        setIsSpeaking(true);

        // Clean the content for TTS
        const cleanContent = autoTTSTrigger.text
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/<[^>]*>/g, '')
          .replace(/```[\s\S]*?```/g, '[code block]')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .replace(/#{1,6}\s+/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/\s+/g, ' ')
          .trim();

        if (!cleanContent) {
          return;
        }

        await angelaTTSService.synthesizeAndPlay({
          text: cleanContent,
          engine: 'kokoro',
          voice: 'af_sarah',
          speed: 1.0,
          language: 'en'
        });

      } catch (error) {
        console.error('🔊 Auto TTS error:', error);
      } finally {
        setIsAutoTTSPlaying(false);
        setIsSpeaking(false);

        // Resume voice detection after TTS with improved restart logic
        const restartAfterTTS = async () => {
          // Wait a bit longer to ensure all state updates are complete
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Mark that we're restarting to prevent cleanup
          isRestartingVADRef.current = true;
          
          // Double-check all conditions before restarting
          const canRestart = (
            isEnabledRef.current && 
            vadReady && 
            vadRef.current && 
            !isListeningRef.current && 
            !isProcessingAudioRef.current && 
            !isAIRespondingRef.current && 
            !isAutoTTSPlayingRef.current
          );
          
          if (canRestart) {
            try {
              console.log('🎤 Restarting VAD after auto TTS...');
              
              // Light cleanup - only stop existing streams, don't destroy audio context
              if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
              }
              setAudioLevel(0);
              
              // Small delay to ensure cleanup is complete
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // Setup fresh audio analyser and restart VAD
              await setupAudioAnalyser();
              await vadRef.current.start();
              
              console.log('🎤 VAD restarted successfully after auto TTS');
              monitorAudioLevel();
              
            } catch (error) {
              console.error('🎤 Failed to resume VAD after auto TTS:', error);
              
              // If VAD restart fails, try manual recording as fallback
              if (permissionStatus === 'granted') {
                console.log('🎤 Falling back to manual recording mode after TTS');
                try {
                  await startManualRecording();
                } catch (manualError) {
                  console.error('🎤 Manual recording fallback also failed after TTS:', manualError);
                }
              }
            }
          } else {
            console.log('🎤 Cannot restart VAD after TTS - conditions not met:', {
              enabled: isEnabledRef.current,
              vadReady,
              vadExists: !!vadRef.current,
              listening: isListeningRef.current,
              processingAudio: isProcessingAudioRef.current,
              aiResponding: isAIRespondingRef.current,
              autoTTSPlaying: isAutoTTSPlayingRef.current
            });
          }
          
          // Clear restart flag
          isRestartingVADRef.current = false;
        };
        
        // Execute restart logic
        restartAfterTTS();
      }
    };

    processAutoTTS();
  }, [autoTTSTrigger, autoTTSEnabled, isTTSHealthy, vadReady, setupAudioAnalyser, monitorAudioLevel]);

  // Cleanup effect when component unmounts
  useEffect(() => {
    // Add debug function to window for troubleshooting
    (window as any).debugVoiceChat = () => {
      console.log('🎤 Voice Chat Debug Info:');
      console.log('- isEnabled:', isEnabled);
      console.log('- vadReady:', vadReady);
      console.log('- vadRef.current:', !!vadRef.current);
      console.log('- isListening:', isListening);
      console.log('- isProcessingAudio:', isProcessingAudio);
      console.log('- isProcessing:', isProcessing);
      console.log('- isAIResponding:', isAIResponding);
      console.log('- isAutoTTSPlaying:', isAutoTTSPlaying);
      console.log('- permissionStatus:', permissionStatus);
      console.log('- error:', error);
      console.log('- isTTSHealthy:', isTTSHealthy);
      console.log('- autoTTSEnabled:', autoTTSEnabled);
      console.log('- isInitializing:', isInitializingRef.current);
      console.log('- isRestartingVAD:', isRestartingVADRef.current);
      console.log('- Status text:', getStatusText());
      
      // Try to restart VAD if it's stuck
      if (isEnabled && vadReady && vadRef.current && !isListening && !isProcessingAudio && !isProcessing && !isAIResponding && !isAutoTTSPlaying) {
        console.log('🎤 Attempting to restart stuck VAD...');
        const forceRestart = async () => {
          try {
            // Light cleanup - only stop existing streams
            if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
              streamRef.current = null;
            }
            setAudioLevel(0);
            await new Promise(resolve => setTimeout(resolve, 200));
            await setupAudioAnalyser();
            await vadRef.current.start();
            monitorAudioLevel();
            console.log('✅ VAD force restart successful');
          } catch (error) {
            console.error('❌ VAD force restart failed:', error);
          }
        };
        forceRestart();
      }
    };
    
    // Add function to force reinitialize VAD
    (window as any).forceReinitializeVAD = async () => {
      console.log('🎤 Force reinitializing VAD...');
      
      // Reset all flags and state
      isInitializingRef.current = false;
      isRestartingVADRef.current = false;
      
      // Cleanup existing VAD
        if (vadRef.current) {
          vadRef.current.pause();
        vadRef.current.destroy();
        vadRef.current = null;
      }
      
      setVadReady(false);
          setIsListening(false);
          setAudioLevel(0);
      setError(null);
      
      // Force reinitialize
      if (permissionStatus === 'granted') {
        try {
          console.log('🎤 Starting forced VAD reinitialization...');
          
          // Add timeout to prevent infinite loading
          const timeoutId = setTimeout(() => {
            console.error('❌ Forced VAD initialization timeout');
            setError('VAD initialization timed out. Please refresh the page.');
            isInitializingRef.current = false;
          }, 30000);
          
          isInitializingRef.current = true;
          
          // Dynamic import of VAD library
          const { MicVAD } = await import('@ricky0123/vad-web');
          
          const vad = await MicVAD.new({
            onSpeechStart: () => {
              console.log('🎤 Speech started');
              setIsListening(true);
              audioChunksRef.current = [];
            },
            onSpeechEnd: async (audio: Float32Array) => {
              console.log('🎤 Speech ended');
              
              if (isProcessingAudioRef.current || isProcessingRef.current || isAIRespondingRef.current) {
                console.log('🎤 Ignoring speech end - already processing or AI responding');
                setIsListening(false);
                setAudioLevel(0);
                return;
              }
              
              setIsListening(false);
              setAudioLevel(0);
              setIsProcessingAudio(true);
              
              if (vadRef.current) {
                vadRef.current.pause();
                console.log('🎤 VAD paused for processing');
              }
              
              const audioBlob = await convertFloat32ArrayToBlob(audio);
              if (audioBlob) {
                try {
                  await onSendAudio(audioBlob);
                  console.log('🎤 Audio sent successfully');
                } catch (error: unknown) {
                  console.error('🎤 Error sending audio:', error);
                }
              }
              
              setIsProcessingAudio(false);
              
              // Auto-restart logic
              setTimeout(async () => {
                if (isEnabledRef.current && vadRef.current && vadReady && !isListeningRef.current && !isProcessingAudioRef.current && !isProcessingRef.current && !isAIRespondingRef.current && !isAutoTTSPlayingRef.current) {
                  try {
                    await setupAudioAnalyser();
                    await vadRef.current.start();
                    monitorAudioLevel();
                    console.log('🎤 VAD auto-restarted after forced init');
                  } catch (error) {
                    console.error('🎤 Failed to restart VAD after forced init:', error);
                  }
                }
              }, 500);
            },
            onVADMisfire: () => {
              console.log('🎤 VAD misfire - false positive detected');
              setIsListening(false);
              setAudioLevel(0);
            },
            positiveSpeechThreshold: 0.6,
            negativeSpeechThreshold: 0.15,
            redemptionFrames: 8,
            frameSamples: 1536,
            preSpeechPadFrames: 1,
            minSpeechFrames: 4
          });
          
          clearTimeout(timeoutId);
          vadRef.current = vad;
          setVadReady(true);
          isInitializingRef.current = false;
          
          console.log('✅ Forced VAD reinitialization successful');
          
          // Auto-start if enabled
          if (isEnabledRef.current) {
        try {
          await setupAudioAnalyser();
              await vad.start();
          monitorAudioLevel();
              console.log('🎤 VAD auto-started after forced init');
        } catch (error) {
              console.error('🎤 Failed to auto-start VAD after forced init:', error);
            }
          }
          
        } catch (error) {
          console.error('❌ Forced VAD reinitialization failed:', error);
          setError(`Forced VAD reinitialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          setVadReady(false);
          isInitializingRef.current = false;
        }
      } else {
        console.log('❌ Cannot force reinitialize VAD - no microphone permission');
      }
    };
    
    return () => {
      // Cleanup when component unmounts
      console.log('🎤 Voice chat component unmounting - cleaning up all resources...');
      
      // Remove debug functions
      delete (window as any).debugVoiceChat;
      delete (window as any).forceReinitializeVAD;
      
      // Clear health check interval
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
        healthCheckIntervalRef.current = null;
      }
      
      // Stop and destroy VAD
      if (vadRef.current) {
        vadRef.current.pause();
        vadRef.current.destroy();
        vadRef.current = null;
      }
      
      // Cleanup audio resources
      cleanupAudioResources();
      
      // Stop manual recording
      if (manualRecorder && manualRecorder.state === 'recording') {
        manualRecorder.stop();
      }
      
      // Reset all refs and state
      isInitializingRef.current = false;
      setVadReady(false);
      setIsListening(false);
      setIsProcessingAudio(false);
      setIsManualRecording(false);
      
      console.log('🎤 Voice chat component cleanup complete');
    };
  }, []);

  // Get status text for compact display
  const getStatusText = () => {
    if (!isTTSHealthy) return 'TTS offline';
    if (error) return 'Error';
    if (permissionStatus === 'requesting') return 'Requesting mic...';
    if (permissionStatus === 'denied') return 'Mic denied';
    if (permissionStatus !== 'granted') return 'Need mic access';
    if (isProcessingAudio) return 'Converting...';
    if (isProcessing) return 'Processing...';
    if (isListening) return `Listening... ${Math.round(audioLevel * 100)}%`;
    if (isSpeaking) return isAutoTTSPlaying ? 'Auto TTS' : 'Speaking';
    if (isEnabled && !vadReady && isInitializingRef.current) return 'Loading...';
    if (isEnabled && !vadReady && !isInitializingRef.current) return 'Initializing...';
    if (isEnabled && vadReady && isAIResponding) return 'Voice paused';
    if (isEnabled && vadReady && !isListening && !isAIResponding && !isProcessingAudio && !isProcessing) {
      // Check if we're in manual mode (Auto TTS disabled)
      if (!autoTTSEnabledRef.current) {
        return 'Manual mode - Click to restart';
      }
      // Auto mode (Auto TTS enabled)
      if (vadRef.current) {
        return 'Ready to listen';
      } else {
        return 'VAD not ready';
      }
    }
    if (isEnabled || isManualRecording) return vadReady ? 'Ready' : 'Manual mode';
    return 'Click to start';
  };

  // Get status color
  const getStatusColor = () => {
    if (!isTTSHealthy || error || permissionStatus === 'denied') return 'text-red-500';
    if (permissionStatus === 'requesting' || isProcessingAudio || isProcessing) return 'text-blue-500';
    if (isListening) return 'text-green-500';
    if (isSpeaking) return 'text-sakura-500';
    if (isEnabled && vadReady && !autoTTSEnabledRef.current && !isListening && !isAIResponding && !isProcessingAudio && !isProcessing) {
      return 'text-gray-500'; // Grey for manual mode
    }
    if (isEnabled) return 'text-purple-500';
    return 'text-gray-500';
  };

  // Toggle auto TTS
  const toggleAutoTTS = useCallback(() => {
    setAutoTTSEnabled(prev => {
      const newValue = !prev;
      console.log(`🔊 Auto TTS ${newValue ? 'enabled' : 'disabled'}`);
      
      // If disabling and currently playing, stop TTS
      if (!newValue && isAutoTTSPlaying) {
        angelaTTSService.stopPlayback();
        setIsAutoTTSPlaying(false);
        setIsSpeaking(false);
      }
      
      return newValue;
    });
  }, [isAutoTTSPlaying]);

  // Stop speaking
  const stopSpeaking = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
      setIsSpeaking(false);
    }
    if (isAutoTTSPlaying) {
      angelaTTSService.stopPlayback();
      setIsAutoTTSPlaying(false);
    }
  };

  return (
    <div className="glassmorphic rounded-xl p-4 bg-white/60 dark:bg-gray-900/40 backdrop-blur-md shadow-lg transition-all duration-300">
      {/* Voice Mode Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
            <button
            onClick={onBackToChat}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
            title="Back to chat mode"
          >
            <ArrowLeft className="w-5 h-5" />
            </button>
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-purple-500" />
            <span className="font-medium text-gray-700 dark:text-gray-300">Voice Mode</span>
          </div>
        </div>
        
        {/* Auto TTS Toggle */}
        {isTTSHealthy && (
            <button
            onClick={toggleAutoTTS}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              autoTTSEnabled 
                ? 'bg-sakura-100 dark:bg-sakura-900/30 text-sakura-700 dark:text-sakura-400' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}
            title={autoTTSEnabled ? 'Disable Auto TTS' : 'Enable Auto TTS'}
          >
            <Volume2 className="w-4 h-4" />
            <span>Auto TTS</span>
            {isAutoTTSPlaying && (
              <div className="w-2 h-2 bg-sakura-500 rounded-full animate-pulse"></div>
            )}
              </button>
            )}
          </div>

      {/* Main Voice Interface */}
      <div className="flex items-center gap-4">
        {/* Voice Visualizer */}
        <div className="flex-shrink-0">
          <CompactAudioVisualizer
          isListening={isListening}
          isSpeaking={isSpeaking}
          audioLevel={audioLevel}
          isProcessing={isProcessing}
          isAIResponding={isAIResponding}
            isTTSHealthy={isTTSHealthy}
            isAutoTTSPlaying={isAutoTTSPlaying}
          />
      </div>

      {/* Status Text */}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
      </div>
      {isStreaming && streamingText && (
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
              {streamingText.slice(0, 50)}...
        </div>
      )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Stop Speaking Button */}
        {isSpeaking && (
          <button
            onClick={stopSpeaking}
              className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              title="Stop speaking"
          >
              <VolumeX className="w-4 h-4" />
          </button>
        )}
        
          {/* Main Voice Toggle */}
          <button
            onClick={onToggle}
            className={`p-2 rounded-lg transition-colors ${
              isEnabled 
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}
            title={isEnabled ? 'Stop voice mode' : 'Start voice mode'}
          >
            {isEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        </div>
      )}

      {/* Permission Request */}
      {permissionStatus !== 'granted' && permissionStatus !== 'requesting' && (
        <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
            Microphone access required for voice mode
        </div>
            <button
            onClick={requestMicrophonePermission}
            className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-sm rounded-lg font-medium transition-colors"
          >
            Grant Permission
            </button>
          </div>
        )}
    </div>
  );
};

export default angelaVoiceChat; 
