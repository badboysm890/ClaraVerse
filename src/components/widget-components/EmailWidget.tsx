import React, { useState, useEffect, useCallback, useRef } from 'react';
import { XCircle, Mail, RefreshCw, Clock, MoreHorizontal, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import axios from 'axios';

interface EmailWidgetProps {
  id: string;
  name: string;
  url: string;
  onRemove: (id: string) => void;
}

interface Email {
  title: string;
  importance: 'low' | 'medium' | 'high';
  content: string;
  suggestedReply?: string;
}

const EmailWidget: React.FC<EmailWidgetProps> = ({ id, name, url, onRemove }) => {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5); // minutes
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const initialFetchTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Configuration and cache for this widget stored in localStorage
  const storageKey = `email_widget_${id}`;
  const cacheKey = `email_widget_cache_${id}`;
  
  // Load configuration and cached emails from localStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem(storageKey);
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        if (config.autoRefresh !== undefined) setAutoRefresh(config.autoRefresh);
        if (config.refreshInterval) setRefreshInterval(config.refreshInterval);
        if (config.lastFetchTime) setLastFetchTime(config.lastFetchTime);
      } catch (err) {
        console.error('Error loading email widget config:', err);
      }
    }
    // Load cached emails
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setEmails(parsed);
        }
      } catch (err) {
        console.error('Error loading cached emails:', err);
      }
    }
  }, [storageKey, cacheKey]);
  
  // Save configuration to localStorage when it changes
  useEffect(() => {
    const config = {
      autoRefresh,
      refreshInterval,
      lastFetchTime
    };
    localStorage.setItem(storageKey, JSON.stringify(config));
  }, [autoRefresh, refreshInterval, lastFetchTime, storageKey]);
  
  // Setup auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        const now = Date.now();
        // Only auto-refresh if last fetch was more than 15 minutes ago
        if (!lastFetchTime || (now - lastFetchTime) >= 15 * 60 * 1000) {
          fetchEmails();
        }
      }, refreshInterval * 60 * 1000);
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoRefresh, refreshInterval, lastFetchTime]);
  
  // Fetch emails with 2s delay on mount
  useEffect(() => {
    const shouldFetch = () => {
      if (!lastFetchTime) return true;
      const timeSinceLastFetch = Date.now() - lastFetchTime;
      return timeSinceLastFetch >= 15 * 60 * 1000; // 15 minutes
    };

    if (shouldFetch()) {
      initialFetchTimeout.current = setTimeout(() => {
        fetchEmails();
      }, 2000);
    }

    return () => {
      if (initialFetchTimeout.current) {
        clearTimeout(initialFetchTimeout.current);
      }
    };
    // Include lastFetchTime in dependencies
  }, [url, lastFetchTime]);
  
  const fetchEmails = async () => {
    if (loading) return;
    
    // Check if we have cached data and it's recent (within 15 minutes)
    const now = Date.now();
    if (lastFetchTime && (now - lastFetchTime) < 15 * 60 * 1000) {
      console.log('Using cached data, last fetch was less than 15 minutes ago');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(url);
      let result = response.data;
      // Support both {output: [...]} and [...] as response
      if (result && typeof result === 'object' && Array.isArray(result.output)) {
        result = result.output;
      }
      if (Array.isArray(result)) {
        setEmails(result);
        localStorage.setItem(cacheKey, JSON.stringify(result));
        setLastFetchTime(now);
      } else {
        setError('Invalid email data format');
      }
    } catch (err) {
      console.error('Error fetching emails:', err);
      setError('Error connecting to email service');
    } finally {
      setLoading(false);
    }
  };
  
  const handleRefresh = () => {
    // For manual refresh, force a new fetch by temporarily clearing lastFetchTime
    setLastFetchTime(null);
    fetchEmails();
  };
  
  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };
  
  const handleIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRefreshInterval(Number(e.target.value));
  };
  
  const toggleExpanded = () => {
    setExpanded(!expanded);
  };
  
  // Sort emails by importance (high -> medium -> low)
  const sortedEmails = Array.isArray(emails) ? [...emails].sort((a, b) => {
    const importanceOrder = { high: 0, medium: 1, low: 2 };
    return importanceOrder[a.importance] - importanceOrder[b.importance];
  }) : [];
  
  const displayEmails = expanded ? sortedEmails : sortedEmails.slice(0, 5);
  const hasMoreEmails = sortedEmails.length > 5;
  
  // Copy suggested reply using Electron API
  const handleCopy = (text: string) => {
    if (
      window.electron &&
      typeof (window.electron as any).copyToClipboard === 'function'
    ) {
      (window.electron as any).copyToClipboard(text);
    } else {
      alert('Copy not supported in this environment.');
    }
  };
  
  // Get time since last fetch in minutes
  const getTimeSinceLastFetch = () => {
    if (!lastFetchTime) return null;
    const minutes = Math.floor((Date.now() - lastFetchTime) / (60 * 1000));
    return minutes;
  };
  
  // Get status text
  const getStatusText = () => {
    if (autoRefresh) {
      const timeSinceLastFetch = getTimeSinceLastFetch();
      if (timeSinceLastFetch !== null && timeSinceLastFetch < 15) {
        return `Updated ${timeSinceLastFetch}m ago (waiting 15m before next auto-refresh)`;
      }
      return `Auto-refreshing every ${refreshInterval} ${refreshInterval === 1 ? 'minute' : 'minutes'}`;
    }
    const timeSinceLastFetch = getTimeSinceLastFetch();
    return timeSinceLastFetch ? `Updated ${timeSinceLastFetch}m ago` : 'Manual refresh';
  };
  
  return (
    <div className="glassmorphic rounded-2xl p-3 sm:p-4 lg:p-6 animate-fadeIn relative group shadow-lg h-full">
      <button
        className="absolute top-2 right-2 sm:top-4 sm:right-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors opacity-0 group-hover:opacity-100"
        onClick={() => onRemove(id)}
        aria-label="Remove widget"
      >
        <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
      
      {/* Header */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="p-1.5 sm:p-2 bg-gray-500/5 dark:bg-gray-300/5 rounded-full flex-shrink-0">
            <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-sakura-500" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">{name}</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {getStatusText()}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2">
          <button 
            className={`p-1 sm:p-1.5 rounded-full transition-colors ${
              autoRefresh 
                ? 'bg-sakura-500/10 text-sakura-500' 
                : 'bg-gray-500/5 dark:bg-gray-300/5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
            onClick={toggleAutoRefresh}
            title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
          >
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          
          <button 
            className="p-1 sm:p-1.5 bg-gray-500/5 dark:bg-gray-300/5 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            onClick={handleRefresh}
            disabled={loading}
            title="Refresh now"
          >
            <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          {autoRefresh && (
            <select
              value={refreshInterval}
              onChange={handleIntervalChange}
              className="text-xs sm:text-sm bg-gray-500/5 dark:bg-gray-300/5 rounded-lg py-1 px-1.5 sm:px-2 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
            >
              <option value="1">1m</option>
              <option value="5">5m</option>
              <option value="15">15m</option>
              <option value="30">30m</option>
              <option value="60">1h</option>
            </select>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-1.5 sm:gap-2 p-2 sm:p-3 mb-3 sm:mb-4 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-xs sm:text-sm">
          <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Email list */}
      <div className="space-y-2 sm:space-y-3">
        {displayEmails.map((email, index) => (
          <div 
            key={index}
            className="bg-white/50 dark:bg-gray-800/50 rounded-lg sm:rounded-xl p-2 sm:p-3"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5 sm:mb-2">
              <h4 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base line-clamp-1">
                {email.title}
              </h4>
              <span className={`
                px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0
                ${email.importance === 'high' ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400' :
                  email.importance === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400' :
                  'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400'}
              `}>
                {email.importance}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1.5 sm:mb-2 line-clamp-2">
              {email.content}
            </p>
            {email.suggestedReply && (
              <div className="flex items-center justify-between gap-2 pt-1.5 sm:pt-2">
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 italic line-clamp-1">
                  {email.suggestedReply}
                </p>
                <button
                  onClick={() => handleCopy(email.suggestedReply!)}
                  className="text-xs sm:text-sm text-sakura-500 hover:text-sakura-600 dark:hover:text-sakura-400 font-medium flex-shrink-0"
                >
                  Copy
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Show more/less button */}
      {hasMoreEmails && (
        <button
          onClick={toggleExpanded}
          className="flex items-center gap-1 sm:gap-1.5 mt-2 sm:mt-3 text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mx-auto"
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </>
          ) : (
            <>
              Show more <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default EmailWidget; 
