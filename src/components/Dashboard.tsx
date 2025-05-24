import React, { useState, useEffect } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { 
  Bot,
  Settings,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ImageIcon,
  MessageSquare,
  Lightbulb,
  Code,
  FileText,
  Zap,
  Info,
  Star,
  RefreshCw,
  Sparkles,
  Server,
  TerminalSquare,
  Database,
  Trash2,
  Cpu,
  Move,
  Check,
  Plus,
  AppWindow,
  Search,
  SlidersHorizontal,
  Grid,
  Layers,
  MoreVertical,
  Activity,
  Globe,
  User,
  Brain,
  Command,
  Book,
  Layout,
  Compass,
  Copy,
  Edit,
  X
} from 'lucide-react';
import { db } from '../db';
import axios from 'axios';
import api from '../services/api';
import WebhookWidget from './widget-components/WebhookWidget';
import WelcomeWidget from './widget-components/WelcomeWidget';
import WhatsNewWidget from './widget-components/WhatsNewWidget';
import CapabilitiesWidget from './widget-components/CapabilitiesWidget';
import PrivacyWidget from './widget-components/PrivacyWidget';
import WidgetContextMenu from './widget-components/WidgetContextMenu';
import AddWidgetModal from './widget-components/AddWidgetModal';
import EmailWidget from './widget-components/EmailWidget';
import QuickChatWidget from './widget-components/QuickChatWidget';
import AppWidget from './widget-components/AppWidget';
import ResizableWidget, { 
  WIDGET_SIZE_CONSTRAINTS, 
  DEFAULT_SIZE_CONSTRAINTS 
} from './widget-components/ResizableWidget';
import { useTheme } from '../hooks/useTheme';

// Extend Window interface to include electron
declare global {
  interface Window {
    electron: {
      getWorkflowsPath: () => Promise<string>;
      getPythonPort: () => Promise<number>;
      checkPythonBackend: () => Promise<{ port: number; status: string; available: boolean }>;
      receive: (channel: string, func: (data: any) => void) => void;
      removeListener: (channel: string, func: (data: any) => void) => void;
    };
  }
}

interface DashboardProps {
  onPageChange?: (page: string) => void;
}

// Default widget configuration for first-time users only
const DEFAULT_WIDGETS = [
  { id: 'privacy', type: 'privacy', order: 2, w: 12, h: 2 },
  { id: 'whats-new', type: 'whats-new', order: 1, w: 12, h: 2 },
  { id: 'welcome', type: 'welcome', order: 0, w: 12, h: 2 },
];

interface Widget {
  id: string;
  type: string;
  name?: string;
  url?: string;
  order: number;
  refreshInterval?: number;
  appId?: string;
  appName?: string;
  appDescription?: string;
  appIcon?: string;
  model?: string; // Add model property for quick chat widgets
  // Add layout properties
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  show: boolean;
  widgetId?: string;
}

const ResponsiveGridLayout = WidthProvider(Responsive);

const Dashboard: React.FC<DashboardProps> = ({ onPageChange }) => {
  const { isDark } = useTheme();
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [showOllamaUrlInput, setShowOllamaUrlInput] = useState(false);
  const [pythonStatus, setPythonStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [pythonPort, setPythonPort] = useState<number | null>(null);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

  // Widget system state
  const [widgets, setWidgets] = useState<Widget[]>(() => {
    // Try to load widgets from localStorage on initialization
    const savedWidgets = localStorage.getItem('dashboard_widgets');
    console.log('Loading widgets from localStorage:', savedWidgets);
    
    if (savedWidgets) {
      try {
        const parsed = JSON.parse(savedWidgets);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log('Loaded saved widgets:', parsed);
          return parsed;
        }
      } catch (error) {
        console.error('Error parsing saved widgets:', error);
      }
    }
    
    console.log('Using default widgets');
    return DEFAULT_WIDGETS;
  });
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [newWidgetName, setNewWidgetName] = useState('');
  const [newWidgetUrl, setNewWidgetUrl] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    x: 0,
    y: 0,
    show: false,
    widgetId: undefined
  });

  const [isRearrangeMode, setIsRearrangeMode] = useState(false);
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);
  const [dragOverWidget, setDragOverWidget] = useState<string | null>(null);

  // Load user name from database
  const [userName, setUserName] = useState<string>('');

  // Load config and check connections
  useEffect(() => {
    console.log('Initial widgets state:', widgets);
    const loadConfig = async () => {
      const config = await db.getAPIConfig();
      
      if (config?.ollama_base_url) {
        setOllamaUrl(config.ollama_base_url);
        checkOllamaConnection(config.ollama_base_url);
      } else {
        setOllamaStatus('disconnected');
      }
      
      if (window.electron) {
        try {
          const port = await window.electron.getPythonPort();
          setPythonPort(port);
        } catch (error) {
          console.error('Could not get Python port from Electron:', error);
        }
      
        try {
          const backendStatus = await window.electron.checkPythonBackend();
          if (backendStatus.port) {
            setPythonPort(backendStatus.port);
          }
          
          if (backendStatus.status === 'running' && backendStatus.available) {
            setPythonStatus('connected');
          } else {
            checkPythonConnection();
          }
        } catch (error) {
          console.error('Error checking Python backend:', error);
          checkPythonConnection();
        }
      } else {
        checkPythonConnection();
      }
    };
    
    loadConfig();
    
    if (window.electron) {
      const backendStatusListener = (status: any) => {
        if (status.port) {
          setPythonPort(status.port);
        }
        
        if (status.status === 'running') {
          checkPythonConnection();
        } else if (['crashed', 'failed', 'stopped'].includes(status.status)) {
          setPythonStatus('disconnected');
        }
      };
      
      window.electron.receive('backend-status', backendStatusListener);
      return () => {
        window.electron.removeListener('backend-status', backendStatusListener);
      };
    }
  }, []);

  // Save widgets to localStorage whenever they change
  useEffect(() => {
    console.log('Saving widgets to localStorage:', widgets);
    localStorage.setItem('dashboard_widgets', JSON.stringify(widgets));
  }, [widgets]);

  // Load user name from database
  useEffect(() => {
    const loadUserName = async () => {
      const personalInfo = await db.getPersonalInfo();
      if (personalInfo?.name) {
        // Capitalize first letter, rest lowercase
        const formattedName = personalInfo.name.charAt(0).toUpperCase() + personalInfo.name.slice(1).toLowerCase();
        setUserName(formattedName);
      }
    };
    loadUserName();
  }, []);

  // Load wallpaper from IndexedDB on mount
  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        const wallpaper = await db.getWallpaper();
        if (wallpaper) {
          setWallpaperUrl(wallpaper);
        }
      } catch (error) {
        console.error('Error loading wallpaper:', error);
      }
    };
    loadWallpaper();
  }, []);

  // Add useEffect to scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
    // Alternative: scroll the dashboard container to top
    const dashboardContainer = document.getElementById('dashboard-container');
    if (dashboardContainer) {
      dashboardContainer.scrollTop = 0;
    }
  }, []);

  const checkOllamaConnection = async (url: string) => {
    setOllamaStatus('checking');
    try {
      const response = await axios.get(`${url}/api/tags`, { timeout: 5000 });
      if (response.status === 200) {
        setOllamaStatus('connected');
      } else {
        setOllamaStatus('disconnected');
      }
    } catch (error) {
      console.error('Ollama connection error:', error);
      setOllamaStatus('disconnected');
    }
  };

  const checkPythonConnection = async () => {
    setPythonStatus('checking');
    setIsReconnecting(true);
    setReconnectError(null);
    
    try {
      const health = await api.checkHealth();
      
      if (health.status === 'connected') {
        setPythonStatus('connected');
        if (health.port && health.port !== pythonPort) {
          setPythonPort(health.port);
        }
        try {
          const result = await api.getTest();
          if (!result) {
            console.warn('Test endpoint returned empty result');
          }
        } catch (testError) {
          console.warn('Test endpoint error:', testError);
        }
      } else {
        setPythonStatus('disconnected');
        setReconnectError('Failed to connect to Python backend');
      }
    } catch (error: any) {
      console.error('Python backend check failed:', error);
      setPythonStatus('disconnected');
      setReconnectError(error.message);
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleAddWidget = (type: string, data?: any) => {
    const widgetId = `${type}-${Date.now()}`;
    if (type === 'webhook') {
      // For webhook widgets, show the custom webhook modal
      setShowAddWidget(true);
      return;
    }

    // For app widgets, use the provided data
    if (type === 'app' && data) {
      const newWidget: Widget = {
        id: widgetId,
        type: 'app',
        appId: data.appId,
        appName: data.appName,
        appDescription: data.appDescription,
        appIcon: data.appIcon,
        order: widgets.length
      };
      console.log('Adding new app widget:', newWidget);
      setWidgets(prev => [...prev, newWidget]);
      // Automatically enter rearrange mode after adding widget
      setIsRearrangeMode(true);
      return;
    }

    // For other widget types, add them directly
    const newWidget: Widget = {
      id: widgetId,
      type,
      order: widgets.length
    };
    
    console.log('Adding new widget:', newWidget);
    setWidgets(prev => [...prev, newWidget]);
    // Automatically enter rearrange mode after adding widget
    setIsRearrangeMode(true);
  };

  const handleRemoveWidget = (id: string) => {
    console.log('Attempting to remove widget:', id);
    setWidgets(prev => {
      // Only prevent removal if it's the last widget
      if (prev.length === 1) {
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
        return prev;
      }
      return prev.filter(w => w.id !== id);
    });
  };

  // Grid layout configuration
  const layouts = {
    lg: widgets.map((widget, index) => {
      const constraints = WIDGET_SIZE_CONSTRAINTS[widget.type as keyof typeof WIDGET_SIZE_CONSTRAINTS] || DEFAULT_SIZE_CONSTRAINTS;
      return {
        i: widget.id,
        x: widget.x ?? (index % 3) * 4, // Use nullish coalescing to only use default if x is null/undefined
        y: widget.y ?? Math.floor(index / 3) * 4, // Use nullish coalescing to only use default if y is null/undefined
        w: widget.w || constraints.minW,
        h: widget.h || constraints.minH,
        minW: constraints.minW,
        minH: constraints.minH,
        maxW: constraints.maxW,
        maxH: constraints.maxH,
        static: !isRearrangeMode // Make widgets static when not in rearrange mode
      };
    })
  };

  // Handle layout change
  const handleLayoutChange = (layout: any[], layouts: any) => {
    // Only update positions if in rearrange mode to prevent unwanted position changes
    if (isRearrangeMode) {
      const updatedWidgets = widgets.map(widget => {
        const layoutItem = layout.find(item => item.i === widget.id);
        if (layoutItem) {
          return {
            ...widget,
            x: layoutItem.x,
            y: layoutItem.y,
            w: layoutItem.w,
            h: layoutItem.h
          };
        }
        return widget;
      });
      setWidgets(updatedWidgets);
    }
  };

  // Handle widget resize
  const handleWidgetResize = (id: string, dimensions: { width: number; height: number }) => {
    setWidgets(prev => prev.map(widget => {
      if (widget.id === id) {
        return {
          ...widget,
          w: Math.ceil(dimensions.width / 100), // Convert pixels to grid units
          h: Math.ceil(dimensions.height / 100)  // Convert pixels to grid units
        };
      }
      return widget;
    }));
  };

  const renderWidget = (widget: Widget) => {
    console.log('Attempting to render widget:', widget);
    if (!widget) {
      console.warn('Received undefined or null widget');
      return null;
    }
    if (!widget.type) {
      console.warn('Widget missing type property:', widget);
      return null;
    }

    // Get current size from layout
    const layout = layouts.lg.find(l => l.i === widget.id);
    const currentSize = {
      w: layout?.w || 4,
      h: layout?.h || 4
    };

    const handleSizePresetSelect = (preset: { w: number; h: number }) => {
      setWidgets(prev => prev.map(w => {
        if (w.id === widget.id) {
          return {
            ...w,
            w: preset.w,
            h: preset.h
          };
        }
        return w;
      }));
    };

    const wrapWithResizable = (component: React.ReactNode) => (
      <ResizableWidget
        key={widget.id}
        className="glassmorphic rounded-2xl"
        isRearrangeMode={isRearrangeMode}
        onSizePresetSelect={handleSizePresetSelect}
        currentSize={currentSize}
        widgetType={widget.type}
      >
        {component}
      </ResizableWidget>
    );

    switch (widget.type) {
      case 'welcome':
        return wrapWithResizable(
          <WelcomeWidget
            id={widget.id}
            onRemove={handleRemoveWidget}
            pythonStatus={pythonStatus}
            pythonPort={pythonPort}
            onPageChange={onPageChange}
          />
        );
      case 'whats-new':
        return wrapWithResizable(
          <WhatsNewWidget
            id={widget.id}
            onRemove={handleRemoveWidget}
          />
        );
      case 'capabilities':
        return wrapWithResizable(
          <CapabilitiesWidget
            id={widget.id}
            onRemove={handleRemoveWidget}
          />
        );
      case 'privacy':
        return wrapWithResizable(
          <PrivacyWidget
            id={widget.id}
            onRemove={handleRemoveWidget}
          />
        );
      case 'webhook':
        return wrapWithResizable(
          <WebhookWidget
            id={widget.id}
            name={widget.name || ''}
            url={widget.url || ''}
            onRemove={handleRemoveWidget}
          />
        );
      case 'quick-chat':
        return wrapWithResizable(
          <QuickChatWidget
            id={widget.id}
            onRemove={handleRemoveWidget}
          />
        );
      case 'email':
        return wrapWithResizable(
          <EmailWidget
            id={widget.id}
            name={widget.name || ''}
            url={widget.url || ''}
            onRemove={handleRemoveWidget}
          />
        );
      case 'app':
        return wrapWithResizable(
          <AppWidget
            id={widget.id}
            appId={widget.appId || ''}
            name={widget.appName || ''}
            description={widget.appDescription || ''}
            icon={widget.appIcon}
            onRemove={handleRemoveWidget}
          />
        );
      default:
        console.warn('Unknown widget type:', widget.type);
        return null;
    }
  };

  // Add handler for context menu
  const handleContextMenu = (e: React.MouseEvent, widgetId?: string) => {
    e.preventDefault();
    if (isRearrangeMode) return; // Disable context menu in rearrange mode
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      show: true,
      widgetId
    });
  };

  // Close context menu
  const closeContextMenu = () => {
    setContextMenu(prev => ({ ...prev, show: false }));
  };

  // Handle widget reordering with drag and drop
  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (!isRearrangeMode) return;
    setDraggedWidget(id);
    // Create a ghost image
    const ghostImg = document.createElement('div');
    ghostImg.classList.add('opacity-50', 'bg-sakura-100', 'rounded-lg', 'p-4');
    ghostImg.textContent = 'Moving widget...';
    document.body.appendChild(ghostImg);
    e.dataTransfer.setDragImage(ghostImg, 20, 20);
    setTimeout(() => {
      document.body.removeChild(ghostImg);
    }, 0);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!isRearrangeMode || draggedWidget === id) return;
    setDragOverWidget(id);
  };

  const handleDrop = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!isRearrangeMode || !draggedWidget || draggedWidget === id) return;
    
    setWidgets(prev => {
      const updatedWidgets = [...prev];
      const draggedIndex = updatedWidgets.findIndex(w => w.id === draggedWidget);
      const dropIndex = updatedWidgets.findIndex(w => w.id === id);
      
      if (draggedIndex < 0 || dropIndex < 0) return prev;
      
      // Reorder all widgets with proper order values
      // This ensures consistent ordering is maintained
      const dragged = updatedWidgets[draggedIndex];
      
      // Remove the dragged widget
      updatedWidgets.splice(draggedIndex, 1);
      
      // Insert at the new position
      updatedWidgets.splice(dropIndex, 0, dragged);
      
      // Update all order properties to match the new array order
      return updatedWidgets.map((widget, index) => ({
        ...widget,
        order: index
      }));
    });
    
    setDraggedWidget(null);
    setDragOverWidget(null);
  };

  const handleDragEnd = () => {
    setDraggedWidget(null);
    setDragOverWidget(null);
  };

  const handleAddWebhookWidget = (name: string, url: string) => {
    const widgetId = `webhook-${Date.now()}`;
    const newWidget: Widget = {
      id: widgetId,
      type: 'webhook',
      name,
      url,
      order: widgets.length
    };
    setWidgets(prev => [...prev, newWidget]);
    localStorage.setItem(`webhook_widget_${widgetId}`, JSON.stringify({ name, url }));
    setShowAddWidget(false);
    // Automatically enter rearrange mode after adding widget
    setIsRearrangeMode(true);
  };

  const handleAddEmailWidget = (name: string, url: string, refreshInterval: number) => {
    const widgetId = `email-${Date.now()}`;
    const newWidget: Widget = {
      id: widgetId,
      type: 'email',
      name,
      url,
      refreshInterval,
      order: widgets.length
    };
    setWidgets(prev => [...prev, newWidget]);
    localStorage.setItem(`email_widget_${widgetId}`, JSON.stringify({ name, url, refreshInterval }));
    setShowAddWidget(false);
    // Automatically enter rearrange mode after adding widget
    setIsRearrangeMode(true);
  };

  const handleAddQuickChatWidget = (name: string, url: string, model: string, systemPrompt: string = '', prePrompt: string = '') => {
    const widgetId = `quick-chat-${Date.now()}`;
    const newWidget: Widget = {
      id: widgetId,
      type: 'quick-chat',
      name,
      url,
      model,
      order: widgets.length
    };
    setWidgets(prev => [...prev, newWidget]);
    localStorage.setItem(`quick_chat_widget_${widgetId}`, JSON.stringify({ 
      ollamaUrl: url, 
      model,
      systemPrompt,
      prePrompt
    }));
    setShowAddWidget(false);
    // Automatically enter rearrange mode after adding widget
    setIsRearrangeMode(true);
  };

  const toggleRearrangeMode = () => {
    if (isRearrangeMode) {
      // When exiting rearrange mode, ensure all widgets have correct order values
      // but preserve their x,y positions
      setWidgets(prev => 
        prev.map((widget, index) => ({
          ...widget,
          order: index
        }))
      );
      
      // Reset any drag state
      setDraggedWidget(null);
      setDragOverWidget(null);
    }
    setIsRearrangeMode(!isRearrangeMode);
  };

  const handleSetWallpaper = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          // Convert file to base64
          const reader = new FileReader();
          reader.onload = async (e) => {
            const base64String = e.target?.result as string;
            // Store in IndexedDB
            await db.setWallpaper(base64String);
            // Update state
            setWallpaperUrl(base64String);
          };
          reader.readAsDataURL(file);
        } catch (error) {
          console.error('Error setting wallpaper:', error);
        }
      }
    };
    input.click();
  };

  return (
    <div 
      id="dashboard-container"
      className="h-[calc(100vh-theme(spacing.16)-theme(spacing.12))] overflow-y-auto scrollbar-none relative"
      onContextMenu={(e) => {
        e.preventDefault();
        handleContextMenu(e);
      }}
    >
      {/* Wallpaper */}
      {wallpaperUrl && (
        <div 
          className="fixed top-0 left-0 right-0 bottom-0 z-0"
          style={{
            backgroundImage: `url(${wallpaperUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.1,
            filter: 'blur(1px)',
            pointerEvents: 'none'
          }}
        />
      )}
      
      <div className="relative z-10">
        {/* Rearrange Mode Controls */}
        <div id="dashboard-header" className="mb-4 flex justify-between items-center px-4 pt-4 group">
          {/* Greeting */}
          <div id="greeting-message" className="py-3">
            <h2 className="text-4xl font-extrabold text-gray-800 dark:text-gray-100 font-sans" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.1)', letterSpacing: '-0.01em' }}>
              Hi, <span className="bg-gradient-to-r from-sakura-500 to-pink-500 bg-clip-text text-transparent">{userName || 'there'}</span> 
            </h2>
          </div>

          <div className={`flex items-center gap-4 transition-opacity duration-200 ${isRearrangeMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}> 
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors bg-sakura-500 text-white"
              onClick={toggleRearrangeMode}
            >
              {isRearrangeMode ? (
                <>
                  <Check className="w-4 h-4" />
                  Done
                </>
              ) : (
                <>
                  <Move className="w-4 h-4" />
                  Rearrange Widgets
                </>
              )}
            </button>
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors bg-sakura-500 text-white"
              onClick={() => setShowAddWidget(true)}
            >
              <Plus className="w-4 h-4" />
              Add Widget
            </button>
          </div>
        </div>

        {/* Toast Notification */}
        {showToast && (
          <div className="fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg animate-fadeIn z-50">
            At least one widget must remain on the dashboard
          </div>
        )}

        {/* Grid Layout */}
        <div className="px-2">
          <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
            rowHeight={100}
            margin={[16, 16]}
            onLayoutChange={handleLayoutChange}
            isDraggable={isRearrangeMode}
            isResizable={false}
            useCSSTransforms={true}
          >
            {widgets.map(widget => (
              <div 
                key={widget.id} 
                className="widget-container"
                onContextMenu={(e) => handleContextMenu(e, widget.id)}
              >
                {renderWidget(widget)}
              </div>
            ))}
          </ResponsiveGridLayout>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu.show && (
        <WidgetContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onAddWidget={() => setShowAddWidget(true)}
          onRearrangeWidgets={toggleRearrangeMode}
          onSetWallpaper={handleSetWallpaper}
          onRemoveWidget={
            contextMenu.widgetId 
              ? () => handleRemoveWidget(contextMenu.widgetId!)
              : undefined
          }
          showRemove={!!contextMenu.widgetId}
        />
      )}

      {/* Add Widget Modal */}
      {showAddWidget && (
        <AddWidgetModal
          onClose={() => setShowAddWidget(false)}
          onAddWidget={handleAddWidget}
          onAddWebhookWidget={handleAddWebhookWidget}
          onAddEmailWidget={handleAddEmailWidget}
          onAddQuickChatWidget={handleAddQuickChatWidget}
          onResetDefault={() => {
            setWidgets(DEFAULT_WIDGETS);
            localStorage.setItem('dashboard_widgets', JSON.stringify(DEFAULT_WIDGETS));
            setShowAddWidget(false);
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;
