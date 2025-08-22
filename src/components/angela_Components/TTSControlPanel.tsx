import React, { useState, useEffect, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  Volume2, 
  VolumeX, 
  Volume1,
  Gauge
} from 'lucide-react';
import { angelaTTSService, AudioControlState, AudioProgress } from '../../services/angelaTTSService';

interface TTSControlPanelProps {
  isVisible: boolean;
  onClose?: () => void;
  className?: string;
}

const TTSControlPanel: React.FC<TTSControlPanelProps> = ({ 
  isVisible, 
  onClose,
  className = '' 
}) => {
  const [audioState, setAudioState] = useState<AudioControlState | null>(null);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [tempProgress, setTempProgress] = useState(0);
  const [tempVolume, setTempVolume] = useState(1);

  // Subscribe to audio state changes
  useEffect(() => {
    const unsubscribeState = angelaTTSService.onStateChange((state) => {
      setAudioState(state);
    });

    const unsubscribeProgress = angelaTTSService.onProgressUpdate((progress) => {
      if (!isDraggingProgress) {
        setTempProgress(progress.progress);
      }
    });

    // Global mouse up listener for reliable drag end detection
    const handleGlobalMouseUp = () => {
      if (isDraggingProgress) {
        setIsDraggingProgress(false);
        angelaTTSService.seekToProgress(tempProgress);
      }
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('touchend', handleGlobalMouseUp);

    return () => {
      unsubscribeState();
      unsubscribeProgress();
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, [isDraggingProgress, tempProgress]);

  // Format time display
  const formatTime = useCallback((seconds: number): string => {
    if (!isFinite(seconds)) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Handle play/pause toggle
  const handlePlayPause = useCallback(() => {
    if (audioState?.isPlaying) {
      angelaTTSService.pauseAudio();
    } else if (audioState?.isPaused) {
      angelaTTSService.resumeAudio();
    }
  }, [audioState]);

  // Handle stop
  const handleStop = useCallback(() => {
    angelaTTSService.stopPlayback();
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  // Handle volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseFloat(e.target.value);
    setTempVolume(volume);
    if (!isDraggingVolume) {
      angelaTTSService.setVolume(volume);
    }
  }, [isDraggingVolume]);

  // Handle volume drag start
  const handleVolumeDragStart = useCallback(() => {
    setIsDraggingVolume(true);
  }, []);

  // Handle volume drag end
  const handleVolumeDragEnd = useCallback(() => {
    setIsDraggingVolume(false);
    angelaTTSService.setVolume(tempVolume);
  }, [tempVolume]);

  // Handle progress change - simplified for reliable seeking
  const handleProgressChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const progress = parseFloat(e.target.value);
    console.log('Seeking to progress:', progress); // Debug log
    angelaTTSService.seekToProgress(progress);
    setTempProgress(progress); // Update temp progress immediately for visual feedback
  }, []);

  // Handle progress input for smooth visual feedback during drag
  const handleProgressInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const progress = parseFloat(e.target.value);
    setTempProgress(progress);
  }, []);

  // Handle progress mouse events
  const handleProgressMouseDown = useCallback(() => {
    setIsDraggingProgress(true);
  }, []);

  const handleProgressMouseUp = useCallback(() => {
    if (isDraggingProgress) {
      setIsDraggingProgress(false);
      // Ensure we seek to the final position when mouse is released
      angelaTTSService.seekToProgress(tempProgress);
    }
  }, [isDraggingProgress, tempProgress]);

  // Update temp progress when not dragging
  useEffect(() => {
    if (!isDraggingProgress && audioState) {
      setTempProgress(audioState.progress);
    }
  }, [audioState?.progress, isDraggingProgress]);

  // Handle speed change
  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const speed = parseFloat(e.target.value);
    angelaTTSService.setSpeed(speed);
  }, []);

  // Handle volume mute toggle
  const handleVolumeToggle = useCallback(() => {
    if (audioState?.volume === 0) {
      angelaTTSService.setVolume(0.7);
      setTempVolume(0.7);
    } else {
      angelaTTSService.setVolume(0);
      setTempVolume(0);
    }
  }, [audioState?.volume]);

  // Get volume icon
  const getVolumeIcon = useCallback(() => {
    const volume = isDraggingVolume ? tempVolume : audioState?.volume || 0;
    if (volume === 0) return VolumeX;
    if (volume < 0.5) return Volume1;
    return Volume2;
  }, [isDraggingVolume, tempVolume, audioState?.volume]);

  const VolumeIcon = getVolumeIcon();

  if (!isVisible || !audioState) return null;

  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg ${className}`}>
      {/* Main Controls Row */}
      <div className="flex items-center space-x-3 mb-3">
        {/* Play/Pause Button */}
        <button
          onClick={handlePlayPause}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title={audioState.isPlaying ? "Pause" : "Play"}
        >
          {audioState.isPlaying ? (
            <Pause className="w-5 h-5 text-blue-500 dark:text-blue-400" />
          ) : (
            <Play className="w-5 h-5 text-blue-500 dark:text-blue-400" />
          )}
        </button>

        {/* Stop Button */}
        <button
          onClick={handleStop}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title="Stop"
        >
          <Square className="w-5 h-5 text-red-500 dark:text-red-400" />
        </button>

        {/* Progress Bar Container */}
        <div className="flex-1 flex items-center space-x-2">
          {/* Current Time */}
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono min-w-[35px]">
            {formatTime(audioState.currentTime)}
          </span>

          {/* Progress Bar */}
          <div className="flex-1 relative">
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={Math.max(0, Math.min(100, isDraggingProgress ? tempProgress : audioState.progress))}
              onChange={handleProgressChange}
              onInput={handleProgressInput}
              onMouseDown={handleProgressMouseDown}
              onMouseUp={handleProgressMouseUp}
              onTouchStart={handleProgressMouseDown}
              onTouchEnd={handleProgressMouseUp}
              className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider-progress"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${Math.max(0, Math.min(100, isDraggingProgress ? tempProgress : audioState.progress))}%, #e5e7eb ${Math.max(0, Math.min(100, isDraggingProgress ? tempProgress : audioState.progress))}%, #e5e7eb 100%)`
              }}
            />
          </div>

          {/* Total Time */}
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono min-w-[35px]">
            {formatTime(audioState.duration)}
          </span>
        </div>
      </div>

      {/* Secondary Controls Row */}
      <div className="flex items-center justify-between">
        {/* Volume Control */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleVolumeToggle}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title={audioState.volume === 0 ? "Unmute" : "Mute"}
          >
            <VolumeIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>

          <div className="w-16 relative">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isDraggingVolume ? tempVolume : audioState.volume}
              onChange={handleVolumeChange}
              onMouseDown={handleVolumeDragStart}
              onMouseUp={handleVolumeDragEnd}
              onTouchStart={handleVolumeDragStart}
              onTouchEnd={handleVolumeDragEnd}
              className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider-volume"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(isDraggingVolume ? tempVolume : audioState.volume) * 100}%, #e5e7eb ${(isDraggingVolume ? tempVolume : audioState.volume) * 100}%, #e5e7eb 100%)`
              }}
            />
          </div>

          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono min-w-[25px]">
            {Math.round((isDraggingVolume ? tempVolume : audioState.volume) * 100)}%
          </span>
        </div>

        {/* Speed Control */}
        <div className="flex items-center space-x-2">
          <Gauge className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <select
            value={audioState.speed}
            onChange={handleSpeedChange}
            className="text-xs bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
        </div>
      </div>

      {/* Custom CSS for sliders */}
      <style>{`
        .slider-progress::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .slider-progress::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .slider-volume::-webkit-slider-thumb {
          appearance: none;
          height: 12px;
          width: 12px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 1px solid white;
          box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }

        .slider-volume::-moz-range-thumb {
          height: 12px;
          width: 12px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 1px solid white;
          box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
};

export default TTSControlPanel; 
