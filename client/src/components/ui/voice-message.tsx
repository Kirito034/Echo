import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';

interface VoiceMessageProps {
  audioUrl: string;
}

const VoiceMessage: React.FC<VoiceMessageProps> = ({ audioUrl }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Create audio element
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    
    // Set up event listeners
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
    });
    
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });
    
    // Clean up
    return () => {
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current);
      }
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    if (isPlaying) {
      audio.pause();
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    } else {
      audio.play()
        .then(() => {
          // Start progress tracking
          progressIntervalRef.current = window.setInterval(() => {
            setCurrentTime(audio.currentTime);
          }, 100);
        })
        .catch(error => {
          console.error('Error playing audio:', error);
        });
    }
    
    setIsPlaying(!isPlaying);
  };

  const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleProgressChange = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const newTime = value[0];
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  return (
    <div className="flex items-center">
      <Button 
        variant="outline" 
        size="icon" 
        className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 mr-3 flex items-center justify-center"
        onClick={togglePlayPause}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        ) : (
          <Play className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        )}
      </Button>
      
      <div className="flex-1">
        <Slider 
          value={[currentTime]} 
          max={duration || 100}
          step={0.01}
          onValueChange={handleProgressChange}
          className="h-1"
        />
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(currentTime)}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default VoiceMessage;
