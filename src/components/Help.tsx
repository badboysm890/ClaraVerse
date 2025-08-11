import { useState, useEffect, useMemo } from 'react';
import { 
  Search,
  BookOpen,
  ChevronRight,
  ChevronDown,
  Home,
  RefreshCw,
  ExternalLink,
  Clock,
  User,
  Sun,
  Moon,
  FileText,
  Zap,
  Bot,
  HelpCircle,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Star,
  ArrowRight,
  Github,
  MessageSquare,
  Youtube,
  Heart,
  Filter
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Components } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '../hooks/useTheme';

// Types
interface DocFile {
  id: string;
  title: string;
  description: string;
  category: string;
  order: number;
  filePath: string;
  lastUpdated?: string;
  contributors?: string[];
}

interface DocConfig {
  categories: string[];
  files: Record<string, DocFile>;
}

interface DocContent {
  metadata: {
    title: string;
    description: string;
    category: string;
    order: number;
    lastUpdated?: string;
    contributors?: string[];
  };
  content: string;
}

interface CachedDoc {
  content: DocContent;
  timestamp: number;
  etag?: string;
}

interface CacheData {
  config: DocConfig;
  docs: Record<string, CachedDoc>;
  lastFetch: number;
}

// Cache utilities
const CACHE_KEY = 'claraverse_docs_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/badboysm890/ClaraVerse/main/docs';

// GitHub API helpers
const fetchGitHubFile = async (path: string): Promise<string> => {
  const response = await fetch(`${GITHUB_RAW_BASE}/${path}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.statusText}`);
  }
  return response.text();
};

const parseMarkdownWithFrontmatter = (content: string): DocContent => {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return {
      metadata: {
        title: 'Untitled Document',
        description: '',
        category: 'general',
        order: 999
      },
      content: content
    };
  }

  const [, frontmatter, markdownContent] = match;
  const metadata: any = {};
  
  frontmatter.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length) {
      const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
      if (key === 'contributors' && value.startsWith('[')) {
        metadata[key] = JSON.parse(value);
      } else if (key === 'order') {
        metadata[key] = parseInt(value) || 999;
      } else {
        metadata[key] = value;
      }
    }
  });

  return {
    metadata: {
      title: metadata.title || 'Untitled Document',
      description: metadata.description || '',
      category: metadata.category || 'general',
      order: metadata.order || 999,
      lastUpdated: metadata.lastUpdated,
      contributors: metadata.contributors || []
    },
    content: markdownContent
  };
};

// Category icons and colors
const getCategoryConfig = (category: string) => {
  switch (category) {
    case 'getting-started': 
      return { 
        icon: Home, 
        color: 'text-emerald-500', 
        bgColor: 'bg-emerald-50 dark:bg-emerald-500/10',
        label: 'Getting Started'
      };
    case 'features': 
      return { 
        icon: Zap, 
        color: 'text-amber-500', 
        bgColor: 'bg-amber-50 dark:bg-amber-500/10',
        label: 'Features'
      };
    case 'agents': 
      return { 
        icon: Bot, 
        color: 'text-purple-500', 
        bgColor: 'bg-purple-50 dark:bg-purple-500/10',
        label: 'Agents'
      };
    case 'ai-features': 
      return { 
        icon: Sparkles, 
        color: 'text-blue-500', 
        bgColor: 'bg-blue-50 dark:bg-blue-500/10',
        label: 'AI Features'
      };
    case 'troubleshooting': 
      return { 
        icon: HelpCircle, 
        color: 'text-red-500', 
        bgColor: 'bg-red-50 dark:bg-red-500/10',
        label: 'Troubleshooting'
      };
    default: 
      return { 
        icon: FileText, 
        color: 'text-gray-500', 
        bgColor: 'bg-gray-50 dark:bg-gray-500/10',
        label: 'Documentation'
      };
  }
};

// Search highlighting
const HighlightedText = ({ text, searchQuery }: { text: string; searchQuery: string }) => {
  if (!searchQuery.trim()) return <>{text}</>;
  
  const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === searchQuery.toLowerCase() ? (
          <span key={i} className="bg-sakura-200 dark:bg-sakura-600/50 px-1 rounded text-sakura-800 dark:text-sakura-200 font-medium">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

// Custom Discord icon component
const DiscordIcon = ({ size = 20, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

// Custom Reddit icon component  
const RedditIcon = ({ size = 20, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12a12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547l-.8 3.747c1.824.07 3.48.632 4.674 1.488c.308-.309.73-.491 1.207-.491c.968 0 1.754.786 1.754 1.754c0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87c-3.874 0-7.004-2.176-7.004-4.87c0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754c.463 0 .898.196 1.207.49c1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197a.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248c.687 0 1.248-.561 1.248-1.249C10.498 12.562 9.937 12 9.25 12zm5.5 0c-.687 0-1.248.561-1.248 1.25c0 .687.561 1.248 1.249 1.248c.688 0 1.249-.561 1.249-1.249C16 12.562 15.438 12 14.75 12zm-3.5 3.5c-.567 0-1.166.093-1.691.26c-.105.033-.156.1-.156.2c0 .553.684 1.017 1.542 1.017c.858 0 1.542-.464 1.542-1.017c0-.1-.052-.167-.157-.2c-.525-.167-1.125-.26-1.691-.26z"/>
  </svg>
);

const Help = () => {
  const { theme, setTheme } = useTheme();
  
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['getting-started']));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Data
  const [config, setConfig] = useState<DocConfig | null>(null);
  const [docs, setDocs] = useState<Record<string, DocContent>>({});
  const [lastFetch, setLastFetch] = useState<number>(0);

  // Load cache from localStorage
  const loadCache = (): CacheData | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  };

  // Save cache to localStorage
  const saveCache = (data: CacheData) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save docs cache:', error);
    }
  };

  // Check if cache is valid
  const isCacheValid = (timestamp: number): boolean => {
    return Date.now() - timestamp < CACHE_DURATION;
  };

  // Fetch documentation from GitHub
  const fetchDocs = async (forceRefresh = false) => {
    setError(null);
    setRefreshing(forceRefresh);
    
    try {
      // Check cache first
      const cached = loadCache();
      if (!forceRefresh && cached && isCacheValid(cached.lastFetch)) {
        setConfig(cached.config);
        const docsMap: Record<string, DocContent> = {};
        Object.entries(cached.docs).forEach(([key, cachedDoc]) => {
          docsMap[key] = cachedDoc.content;
        });
        setDocs(docsMap);
        setLastFetch(cached.lastFetch);
        setLoading(false);
        return;
      }

      // Fetch config.json
      const configContent = await fetchGitHubFile('config.json');
      const docConfig: DocConfig = JSON.parse(configContent);
      setConfig(docConfig);

      // Fetch all documents
      const docsMap: Record<string, DocContent> = {};
      const cacheDocsMap: Record<string, CachedDoc> = {};
      
      await Promise.all(
        Object.entries(docConfig.files).map(async ([key, file]) => {
          try {
            const content = await fetchGitHubFile(file.filePath);
            const parsedDoc = parseMarkdownWithFrontmatter(content);
            docsMap[key] = parsedDoc;
            cacheDocsMap[key] = {
              content: parsedDoc,
              timestamp: Date.now()
            };
          } catch (error) {
            console.warn(`Failed to fetch ${file.filePath}:`, error);
          }
        })
      );

      setDocs(docsMap);
      const fetchTime = Date.now();
      setLastFetch(fetchTime);

      // Save to cache
      saveCache({
        config: docConfig,
        docs: cacheDocsMap,
        lastFetch: fetchTime
      });

      // Auto-select first document
      if (!selectedDoc && Object.keys(docsMap).length > 0) {
        const firstDoc = Object.entries(docConfig.files)
          .sort(([, a], [, b]) => a.order - b.order)[0];
        if (firstDoc) {
          setSelectedDoc(firstDoc[0]);
        }
      }

    } catch (error) {
      console.error('Failed to fetch documentation:', error);
      setError('Failed to load documentation. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initialize
  useEffect(() => {
    fetchDocs();
  }, []);

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Group documents by category
  const groupedDocs = useMemo(() => {
    if (!config) return {};
    
    const groups: Record<string, DocFile[]> = {};
    
    Object.entries(config.files).forEach(([key, file]) => {
      if (!groups[file.category]) {
        groups[file.category] = [];
      }
      groups[file.category].push({ ...file, id: key });
    });

    // Sort within each category
    Object.keys(groups).forEach(category => {
      groups[category].sort((a, b) => a.order - b.order);
    });

    return groups;
  }, [config]);

  // Search functionality
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !config) return null;

    const results: Array<{ file: DocFile & { id: string }; snippet: string }> = [];
    const query = searchQuery.toLowerCase();

    Object.entries(config.files).forEach(([key, file]) => {
      const doc = docs[key];
      if (!doc) return;

      const titleMatch = file.title.toLowerCase().includes(query);
      const descMatch = file.description.toLowerCase().includes(query);
      const contentMatch = doc.content.toLowerCase().includes(query);

      if (titleMatch || descMatch || contentMatch) {
        let snippet = '';
        if (contentMatch) {
          const contentLower = doc.content.toLowerCase();
          const matchIndex = contentLower.indexOf(query);
          const start = Math.max(0, matchIndex - 60);
          const end = Math.min(doc.content.length, matchIndex + 120);
          snippet = doc.content.slice(start, end);
          if (start > 0) snippet = '...' + snippet;
          if (end < doc.content.length) snippet += '...';
        } else {
          snippet = file.description;
        }

        results.push({
          file: { ...file, id: key },
          snippet
        });
      }
    });

    return results.sort((a, b) => a.file.order - b.file.order);
  }, [searchQuery, config, docs]);

  // Custom markdown components
  const MarkdownComponents: Partial<Components> = {
    h1: ({ children }) => (
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-4 mt-8">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-3 mt-6">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
        {typeof children === 'string' ? (
          <HighlightedText text={children} searchQuery={searchQuery} />
        ) : (
          children
        )}
      </p>
    ),
    code: ({ inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          style={theme === 'dark' ? oneDark : oneLight}
          language={match[1]}
          PreTag="div"
          className="rounded-lg my-4"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-sakura-600 dark:text-sakura-400" {...props}>
          {children}
        </code>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-sakura-400 bg-sakura-50 dark:bg-sakura-900/20 pl-4 py-2 my-4 italic rounded-r-lg">
        {children}
      </blockquote>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-inside mb-4 space-y-1 text-gray-700 dark:text-gray-300">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside mb-4 space-y-1 text-gray-700 dark:text-gray-300">
        {children}
      </ol>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sakura-600 dark:text-sakura-400 hover:text-sakura-700 dark:hover:text-sakura-300 underline inline-flex items-center gap-1 transition-colors"
      >
        {children}
        <ExternalLink size={14} />
      </a>
    )
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-theme(spacing.18)-theme(spacing.12))] bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="glassmorphic p-8 rounded-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-sakura-500 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 font-medium">Loading documentation...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[calc(100vh-theme(spacing.18)-theme(spacing.12))] bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="glassmorphic p-8 rounded-2xl">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Failed to Load Documentation
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
            <button
              onClick={() => fetchDocs(true)}
              className="bg-sakura-500 hover:bg-sakura-600 text-white px-6 py-3 rounded-lg transition-colors font-medium flex items-center gap-2 mx-auto"
            >
              <RefreshCw size={16} />
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-theme(spacing.16)-theme(spacing.1))] bg-white dark:bg-black flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Redesigned Sidebar */}
        <div className="w-80 shrink-0 p-4">
          <div className="glassmorphic rounded-xl p-4 space-y-4 sticky top-4 h-[calc(100vh-10rem)] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sakura-500 rounded-xl">
                  <BookOpen className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Documentation
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">ClaraVerse Guide</p>
                </div>
              </div>
              <button
                onClick={() => fetchDocs(true)}
                disabled={refreshing}
                className="p-2 rounded-lg glassmorphic hover:bg-sakura-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                title="Refresh documentation"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin text-sakura-500' : 'text-gray-600 dark:text-gray-400'} />
              </button>
            </div>
            
            {/* Search */}
            <div className="relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
              <input
                type="text"
                placeholder="Search documentation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 
                  bg-white/50 dark:bg-gray-800/50 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400
                  focus:border-sakura-500 focus:ring-2 focus:ring-sakura-500/20 outline-none transition-all"
              />
            </div>

            {/* Status Indicator */}
            {lastFetch > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 rounded-lg flex-shrink-0">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span>Updated: {new Date(lastFetch).toLocaleString()}</span>
              </div>
            )}

            {/* Navigation - Now properly scrollable */}
            <div className="flex-1 overflow-y-auto min-h-0 pb-4">
              {searchResults ? (
                /* Search Results */
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <Search size={16} className="text-sakura-500" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      Search Results ({searchResults.length})
                    </h3>
                  </div>
                  {searchResults.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        <p className="text-gray-500 dark:text-gray-400">No results found</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {searchResults.map(({ file, snippet }) => {
                        const categoryConfig = getCategoryConfig(file.category);
                        return (
                          <button
                            key={file.id}
                            onClick={() => setSelectedDoc(file.id)}
                            className={`w-full text-left p-4 rounded-lg transition-all duration-200 group ${
                              selectedDoc === file.id
                                ? 'bg-sakura-500 text-white shadow-lg'
                                : 'hover:bg-sakura-100 dark:hover:bg-gray-800 bg-white/50 dark:bg-gray-800/50'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-lg ${
                                selectedDoc === file.id 
                                  ? 'bg-white/20' 
                                  : categoryConfig.bgColor
                                } flex-shrink-0 group-hover:scale-110 transition-transform`}>
                                <categoryConfig.icon size={16} className={
                                  selectedDoc === file.id 
                                    ? 'text-white' 
                                    : categoryConfig.color
                                } />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`font-medium mb-1 truncate ${
                                  selectedDoc === file.id 
                                    ? 'text-white' 
                                    : 'text-gray-900 dark:text-white'
                                }`}>
                                  <HighlightedText text={file.title} searchQuery={searchQuery} />
                                </div>
                                <p className={`text-sm line-clamp-2 ${
                                  selectedDoc === file.id 
                                    ? 'text-white/80' 
                                    : 'text-gray-500 dark:text-gray-400'
                                }`}>
                                  <HighlightedText text={snippet} searchQuery={searchQuery} />
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* Category Navigation */
                <div className="space-y-3">
                  {config?.categories.map(category => {
                    const files = groupedDocs[category] || [];
                    const categoryConfig = getCategoryConfig(category);
                    const isExpanded = expandedCategories.has(category);

                    return (
                      <div key={category}>
                        <button
                          onClick={() => toggleCategory(category)}
                          className="w-full flex items-center justify-between p-3 rounded-lg bg-white/50 dark:bg-gray-800/50 hover:bg-sakura-100 dark:hover:bg-gray-700 transition-all duration-200 group"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${categoryConfig.bgColor} group-hover:scale-110 transition-transform`}>
                              <categoryConfig.icon size={18} className={categoryConfig.color} />
                            </div>
                            <div className="text-left">
                              <div className="font-semibold text-gray-900 dark:text-white">
                                {categoryConfig.label}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {files.length} document{files.length !== 1 ? 's' : ''}
                              </div>
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronDown size={16} className="text-gray-400 group-hover:text-sakura-500 transition-colors" />
                          ) : (
                            <ChevronRight size={16} className="text-gray-400 group-hover:text-sakura-500 transition-colors" />
                          )}
                        </button>
                        
                        {isExpanded && (
                          <div className="ml-4 mt-2 space-y-1">
                            {files.map(file => (
                              <button
                                key={file.id}
                                onClick={() => setSelectedDoc(file.id)}
                                className={`w-full text-left p-3 rounded-lg transition-all duration-200 group ${
                                  selectedDoc === file.id
                                    ? 'bg-sakura-500 text-white shadow-md'
                                    : 'hover:bg-sakura-100 dark:hover:bg-gray-700 bg-white/30 dark:bg-gray-800/30'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-2 h-2 rounded-full transition-colors ${
                                    selectedDoc === file.id 
                                      ? 'bg-white' 
                                      : 'bg-sakura-300 dark:bg-gray-600 group-hover:bg-sakura-500'
                                  }`}></div>
                                  <div className="flex-1 min-w-0">
                                    <div className={`font-medium truncate ${
                                      selectedDoc === file.id 
                                        ? 'text-white' 
                                        : 'text-gray-900 dark:text-white'
                                    }`}>
                                      {file.title}
                                    </div>
                                    <p className={`text-sm line-clamp-1 ${
                                      selectedDoc === file.id 
                                        ? 'text-white/80' 
                                        : 'text-gray-500 dark:text-gray-400'
                                    }`}>
                                      {file.description}
                                    </p>
                                  </div>
                                  <ArrowRight size={14} className={`transition-opacity ${
                                    selectedDoc === file.id 
                                      ? 'text-white opacity-100' 
                                      : 'text-gray-400 opacity-0 group-hover:opacity-100'
                                  }`} />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content - Keep existing content area unchanged */}
        <div className="flex-1 overflow-y-auto">
          {selectedDoc && docs[selectedDoc] ? (
            <div className="h-full overflow-y-auto">
              <div className="max-w-4xl mx-auto p-8">
                {/* Document Header */}
                <div className="mb-8">
                  <div className="glassmorphic p-6 rounded-2xl">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
                          {docs[selectedDoc].metadata.title}
                        </h1>
                        {docs[selectedDoc].metadata.description && (
                          <p className="text-xl text-gray-600 dark:text-gray-400 leading-relaxed">
                            {docs[selectedDoc].metadata.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-6">
                        {config?.files[selectedDoc] && (
                          <div className={`p-3 rounded-xl ${getCategoryConfig(config.files[selectedDoc].category).bgColor}`}>
                            {(() => {
                              const CategoryIcon = getCategoryConfig(config.files[selectedDoc].category).icon;
                              return <CategoryIcon size={24} className={getCategoryConfig(config.files[selectedDoc].category).color} />;
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Metadata */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      {docs[selectedDoc].metadata.lastUpdated && (
                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
                          <Clock size={14} />
                          <span>Updated {docs[selectedDoc].metadata.lastUpdated}</span>
                        </div>
                      )}
                      {docs[selectedDoc].metadata.contributors && docs[selectedDoc].metadata.contributors.length > 0 && (
                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
                          <User size={14} />
                          <span>By {docs[selectedDoc].metadata.contributors.join(', ')}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 bg-sakura-100 dark:bg-sakura-500/20 text-sakura-600 dark:text-sakura-400 px-3 py-1 rounded-full">
                        <Star size={14} />
                        <span>Live from GitHub</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Document Content */}
                <div className="glassmorphic p-8 rounded-2xl">
                  <div className="prose dark:prose-invert prose-lg max-w-none prose-sakura">
                    <ReactMarkdown components={MarkdownComponents}>
                      {docs[selectedDoc].content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center max-w-md">
                <div className="glassmorphic p-8 rounded-2xl">
                  <div className="p-4 bg-sakura-100 dark:bg-sakura-500/20 rounded-2xl inline-block mb-6">
                    <BookOpen className="h-16 w-16 text-sakura-600 dark:text-sakura-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                    Welcome to ClaraVerse Documentation
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    Select a topic from the sidebar to get started, or use the search to find specific information about ClaraVerse features and capabilities.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-sakura-500/20 rounded-xl">
                <BookOpen className="h-6 w-6 text-sakura-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">ClaraVerse Documentation</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Join our community</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <a
                href="https://discord.gg/j633fsrAne"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 transition-colors group"
                title="Discord"
              >
                <DiscordIcon size={20} className="text-white" />
              </a>

              <a
                href="https://github.com/badboysm890/ClaraVerse"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors group"
                title="GitHub"
              >
                <Github size={20} className="text-white" />
              </a>

              <a
                href="https://reddit.com/r/claraverse"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-lg bg-orange-600 hover:bg-orange-700 transition-colors group"
                title="Reddit"
              >
                <RedditIcon size={20} className="text-white" />
              </a>

              <a
                href="https://youtube.com/@claraverseai"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-lg bg-red-600 hover:bg-red-700 transition-colors group"
                title="YouTube"
              >
                <Youtube size={20} className="text-white" />
              </a>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>Made with</span>
              <Heart size={14} className="text-sakura-400 fill-current" />
              <span>by ClaraVerse Team</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;