/**
 * Connectivity Settings Component
 * 
 * Manages P2P connections and remote Clara device discovery
 */

import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Smartphone, 
  Monitor, 
  Users, 
  Key, 
  Play, 
  Pause, 
  X, 
  Globe,
  Settings as SettingsIcon,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2
} from 'lucide-react';
import { p2pService, ClaraPeer, P2PConfig } from '../../services/p2pService';

const ConnectivitySettings: React.FC = () => {
  const [config, setConfig] = useState<P2PConfig>(p2pService.getConfig());
  const [peers, setPeers] = useState<ClaraPeer[]>([]);
  const [localPeer, setLocalPeer] = useState<ClaraPeer | null>(p2pService.getLocalPeer());
  const [isServiceEnabled, setIsServiceEnabled] = useState(p2pService.isServiceEnabled());
  const [isConnecting, setIsConnecting] = useState(false);
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [autoConnectEnabled, setAutoConnectEnabled] = useState(true);
  const [connectionHistory, setConnectionHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Effect to listen for P2P service events
  useEffect(() => {
    // Notify backend that connectivity tab is open
    if (window.electronAPI) {
      window.electronAPI.invoke('p2p:connectivity-tab-opened');
    }

    // Cleanup when component unmounts
    return () => {
      if (window.electronAPI) {
        window.electronAPI.invoke('p2p:connectivity-tab-closed');
      }
    };
  }, []);

  useEffect(() => {
    // Sync initial service state with backend
    const syncServiceState = async () => {
      try {
        const actualStatus = await p2pService.getServiceStatus();
        setIsServiceEnabled(actualStatus);
      } catch (error) {
        console.warn('Failed to sync service state:', error);
      }
    };
    
    syncServiceState();

    const handleServiceStarted = (peer: ClaraPeer) => {
      setLocalPeer(peer);
      setIsServiceEnabled(true);
    };

    const handleServiceStopped = () => {
      setIsServiceEnabled(false);
      setPeers([]);
    };

    const handlePeerDiscovered = (peer: ClaraPeer) => {
      setPeers(prev => {
        const existing = prev.find(p => p.id === peer.id);
        if (existing) {
          // Update existing peer
          return prev.map(p => p.id === peer.id ? peer : p);
        }
        return [...prev, peer];
      });
    };

    const handlePeerConnected = (peer: ClaraPeer) => {
      setPeers(prev => {
        const existing = prev.find(p => p.id === peer.id);
        if (existing) {
          // Update existing peer to connected state
          return prev.map(p => p.id === peer.id ? { ...p, connectionState: 'connected' } : p);
        }
        // Add new connected peer
        return [...prev, { ...peer, connectionState: 'connected' }];
      });
      console.log('🔗 Peer connected:', peer.name);
    };

    const handlePeerDisconnected = (peer: ClaraPeer) => {
      setPeers(prev => prev.map(p => p.id === peer.id ? { ...p, connectionState: 'disconnected' } : p));
    };

    const handleConfigUpdated = (newConfig: P2PConfig) => {
      setConfig(newConfig);
    };

    // Register event listeners
    p2pService.on('service-started', handleServiceStarted);
    p2pService.on('service-stopped', handleServiceStopped);
    p2pService.on('peer-discovered', handlePeerDiscovered);
    p2pService.on('peer-connected', handlePeerConnected);
    p2pService.on('peer-disconnected', handlePeerDisconnected);
    p2pService.on('config-updated', handleConfigUpdated);

    // Load initial state
    setPeers(p2pService.getPeers());

    // Load connection history if available
    if ((window as any).electronAPI) {
      (window as any).electronAPI.invoke('p2p:get-connection-history').then((history: any[]) => {
        setConnectionHistory(history || []);
      }).catch((error: any) => {
        console.warn('Failed to load connection history:', error);
      });
    }
    
    // Load auto-connect settings (if in Electron)
    if ((window as any).electronAPI) {
      (window as any).electronAPI.invoke('p2p:get-settings').then((settings: any) => {
        setAutoStartEnabled(settings.autoStartOnBoot || false);
        setAutoConnectEnabled(settings.autoConnectEnabled !== false); // Default to true
      }).catch(() => {
        // Fallback if not available
        setAutoStartEnabled(false);
        setAutoConnectEnabled(true);
      });
    }
    
    // Listen for Electron IPC events (if in Electron)
    if ((window as any).electronAPI) {
      const handleElectronPeerConnected = (_: any, peer: ClaraPeer) => {
        handlePeerConnected(peer);
      };
      
      const handleElectronPeerDiscovered = (_: any, peer: ClaraPeer) => {
        handlePeerDiscovered(peer);
      };

      const handleElectronPeerDisconnected = (_: any, peer: ClaraPeer) => {
        handlePeerDisconnected(peer);
      };
      
      (window as any).electronAPI.on('p2p:peer-connected', handleElectronPeerConnected);
      (window as any).electronAPI.on('p2p:peer-discovered', handleElectronPeerDiscovered);
      (window as any).electronAPI.on('p2p:peer-disconnected', handleElectronPeerDisconnected);
    }

    // Cleanup
    return () => {
      p2pService.removeAllListeners();
      
      // Remove Electron listeners if they exist
      if ((window as any).electronAPI) {
        (window as any).electronAPI.removeAllListeners('p2p:peer-connected');
        (window as any).electronAPI.removeAllListeners('p2p:peer-discovered');
        (window as any).electronAPI.removeAllListeners('p2p:peer-disconnected');
      }
    };
  }, []);

  // Toggle P2P service
  const handleToggleService = async () => {
    try {
      if (isServiceEnabled) {
        await p2pService.stop();
      } else {
        await p2pService.start();
      }
      // Update local state to reflect actual backend state
      const actualStatus = await p2pService.getServiceStatus();
      setIsServiceEnabled(actualStatus);
    } catch (error) {
      console.error('Error toggling P2P service:', error);
      alert('Failed to toggle P2P service. Please try again.');
    }
  };

  // Update configuration
  const handleConfigChange = async (updates: Partial<P2PConfig>) => {
    try {
      await p2pService.updateConfig(updates);
    } catch (error) {
      console.error('Error updating P2P config:', error);
      alert('Failed to update configuration. Please try again.');
    }
  };

  // Add unpair device functionality
  const handleUnpairDevice = async (peerId: string) => {
    try {
      if ((window as any).electronAPI) {
        const result = await (window as any).electronAPI.invoke('p2p:unpair-device', peerId);
        if (!result.success) {
          throw new Error(result.error || 'Failed to unpair device');
        }
      }
      // Update local state
      setPeers(prev => prev.map(p => 
        p.id === peerId 
          ? { ...p, connectionState: 'disconnected', isAutoConnect: false } 
          : p
      ));
    } catch (error) {
      console.error('Unpair failed:', error);
      alert('Failed to unpair device. Please try again.');
    }
  };

  // Handle auto-start toggle
  const handleAutoStartToggle = async (enabled: boolean) => {
    try {
      if ((window as any).electronAPI) {
        await (window as any).electronAPI.invoke('p2p:set-auto-start', enabled);
        setAutoStartEnabled(enabled);
        console.log(`🔧 Auto-start ${enabled ? 'enabled' : 'disabled'}`);
      }
    } catch (error) {
      console.error('Failed to update auto-start setting:', error);
    }
  };

  // Handle auto-connect toggle
  const handleAutoConnectToggle = async (enabled: boolean) => {
    try {
      if ((window as any).electronAPI) {
        await (window as any).electronAPI.invoke('p2p:set-auto-connect', enabled);
        setAutoConnectEnabled(enabled);
        console.log(`🔗 Auto-connect ${enabled ? 'enabled' : 'disabled'}`);
      }
    } catch (error) {
      console.error('Failed to update auto-connect setting:', error);
    }
  };

  // Disconnect from peer
  const handleDisconnectPeer = async (peerId: string) => {
    try {
      console.log('🔌 Attempting to disconnect peer:', peerId);
      await p2pService.disconnectFromPeer(peerId);
      console.log('✅ Disconnect successful');
    } catch (error) {
      console.error('Disconnect failed:', error);
      alert('Failed to disconnect. Please try again.');
    }
  };

  // Connect to a discovered peer directly
  const handleConnectToDiscoveredPeer = async (peer: ClaraPeer) => {
    try {
      setIsConnecting(true);
      
      console.log('🔗 Connecting to discovered peer:', peer.name);
      await p2pService.connectToPeer(peer);
    } catch (error) {
      console.error('Connection to discovered peer failed:', error);
      alert(`Failed to connect to ${peer.name}. Please try again.`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Get device icon based on platform
  const getDeviceIcon = (platform: string) => {
    switch (platform) {
      case 'android':
      case 'ios':
        return Smartphone;
      case 'darwin':
      case 'win32':
      case 'linux':
      default:
        return Monitor;
    }
  };

  // Get connection status info
  const getConnectionStatus = (state: string) => {
    switch (state) {
      case 'connected':
        return { icon: CheckCircle, color: 'text-green-500', text: 'Connected' };
      case 'connecting':
        return { icon: Loader2, color: 'text-yellow-500', text: 'Connecting' };
      case 'failed':
        return { icon: AlertCircle, color: 'text-red-500', text: 'Failed' };
      default:
        return { icon: Clock, color: 'text-gray-500', text: 'Disconnected' };
    }
  };

  const connectedPeers = peers.filter(peer => peer.connectionState === 'connected');
  const discoveredPeers = peers.filter(peer => peer.connectionState === 'disconnected' && peer.isLocal);

  return (
    <div className="space-y-6">
      {/* Header with Service Toggle */}
      <div className="glassmorphic rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Wifi className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Connectivity
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Connect Clara devices and share AI capabilities
              </p>
            </div>
          </div>
          
          {/* Service Toggle Switch */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              P2P Service
            </span>
            <button
              onClick={handleToggleService}
              className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                isServiceEnabled
                  ? 'bg-gradient-to-r from-blue-400 to-blue-500 shadow-lg shadow-blue-500/25'
                  : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 flex items-center justify-center ${
                isServiceEnabled ? 'translate-x-6' : 'translate-x-0'
              }`}>
                {isServiceEnabled ? (
                  <Play className="w-3 h-3 text-blue-500" />
                ) : (
                  <Pause className="w-3 h-3 text-gray-500" />
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Service Status */}
        <div className={`p-4 rounded-lg border ${
          isServiceEnabled 
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700' 
            : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center gap-2">
            {isServiceEnabled ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <WifiOff className="w-5 h-5 text-gray-500" />
            )}
            <span className={`font-medium ${
              isServiceEnabled 
                ? 'text-green-700 dark:text-green-300' 
                : 'text-gray-700 dark:text-gray-300'
            }`}>
              {isServiceEnabled ? 'P2P Service Active' : 'P2P Service Disabled'}
            </span>
          </div>
          <p className={`text-sm mt-1 ${
            isServiceEnabled 
              ? 'text-green-600 dark:text-green-400' 
              : 'text-gray-600 dark:text-gray-400'
          }`}>
            {isServiceEnabled 
              ? 'Your device is discoverable and can connect to other Clara instances'
              : 'Enable to connect with other Clara devices and share AI capabilities'
            }
          </p>
        </div>
      </div>

      {isServiceEnabled && (
        <>
          {/* Device Information */}
          <div className="glassmorphic rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Monitor className="w-5 h-5 text-purple-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                This Device
              </h3>
            </div>
            
            {localPeer && (
              <div className="flex items-center gap-4 p-4 bg-white/50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                  <Monitor className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {localPeer.name}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {localPeer.deviceInfo?.platform || 'Unknown'} • Version {localPeer.version}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    ID: {localPeer.id}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">
                      Online
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Capabilities: {localPeer.capabilities?.length || 0}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Pairing Section */}
          <div className="glassmorphic rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Key className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Device Pairing
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* Device Discovery Status */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                  Device Discovery
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Clara automatically discovers nearby devices on your network. Simply click "Connect" on any discovered device.
                </p>
                
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                    <Wifi className="w-5 h-5" />
                    <span className="font-medium">Auto-Discovery Active</span>
                  </div>
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                    Your device is discoverable and scanning for other Clara devices
                  </p>
                </div>

                {/* Connection History Toggle */}
                <div className="mt-4">
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-2"
                  >
                    <Clock className="w-4 h-4" />
                    {showHistory ? 'Hide' : 'Show'} Connection History
                  </button>
                </div>

                {/* Connection History */}
                {showHistory && connectionHistory.length > 0 && (
                  <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                    <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">Recent Connections</h5>
                    {connectionHistory.slice(0, 10).map((entry, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            entry.success 
                              ? 'bg-green-500' 
                              : 'bg-red-500'
                          }`} />
                          <span className="font-medium">{entry.peerName}</span>
                          <span className="text-gray-500">({entry.action})</span>
                        </div>
                        <span className="text-gray-400 text-xs">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Connected Devices */}
          {connectedPeers.length > 0 && (
            <div className="glassmorphic rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-5 h-5 text-green-500" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Connected Devices ({connectedPeers.length})
                </h3>
              </div>

              <div className="space-y-3">
                {connectedPeers.map((peer) => {
                  const DeviceIcon = getDeviceIcon(peer.deviceInfo?.platform || 'unknown');
                  const status = getConnectionStatus(peer.connectionState);
                  const StatusIcon = status.icon;

                  return (
                    <div
                      key={peer.id}
                      className="flex items-center gap-4 p-4 bg-white/50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                        <DeviceIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
                      </div>
                      
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {peer.name}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {peer.deviceInfo?.platform || 'Unknown'} • {peer.isLocal ? 'Local Network' : 'Remote'}
                        </p>
                        <div className="flex items-center gap-4 mt-1">
                          <div className="flex items-center gap-1">
                            <StatusIcon className={`w-3 h-3 ${status.color}`} />
                            <span className={`text-xs font-medium ${status.color}`}>
                              {status.text}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-500">
                            {peer.capabilities?.length || 0} capabilities
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => alert('🚀 Remote agent execution coming soon!')}
                          className="px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors text-sm"
                        >
                          Execute Agent
                        </button>
                        <button
                          onClick={() => handleDisconnectPeer(peer.id)}
                          className="px-3 py-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors text-sm"
                        >
                          Disconnect
                        </button>
                        <button
                          onClick={() => handleUnpairDevice(peer.id)}
                          className="px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors text-sm"
                          title="Remove device completely (requires re-pairing to reconnect)"
                        >
                          Unpair
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Discovered Devices */}
          {discoveredPeers.length > 0 && (
            <div className="glassmorphic rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Globe className="w-5 h-5 text-blue-500" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Discovered Devices ({discoveredPeers.length})
                </h3>
              </div>

              <div className="space-y-3">
                {discoveredPeers.map((peer) => {
                  const DeviceIcon = getDeviceIcon(peer.deviceInfo?.platform || 'unknown');

                  return (
                    <div
                      key={peer.id}
                      className="flex items-center gap-4 p-4 bg-white/50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                        <DeviceIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {peer.name}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {peer.deviceInfo?.platform || 'Unknown'} • Local Network
                        </p>
                        <span className="text-xs text-gray-500 dark:text-gray-500">
                          Last seen: {peer.lastSeen.toLocaleTimeString()}
                        </span>
                      </div>

                      <button
                        onClick={() => handleConnectToDiscoveredPeer(peer)}
                        disabled={isConnecting}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        {isConnecting ? 'Connecting...' : 'Connect'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Settings */}
          <div className="glassmorphic rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <SettingsIcon className="w-5 h-5 text-gray-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Connection Settings
              </h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Device Name
                  </label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    How your device appears to others
                  </p>
                </div>
                <input
                  type="text"
                  value={config.deviceName}
                  onChange={(e) => handleConfigChange({ deviceName: e.target.value })}
                  className="w-48 px-3 py-2 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-blue-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100 text-sm"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Allow Incoming Connections
                  </label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Let other devices connect to you
                  </p>
                </div>
                <button
                  onClick={() => handleConfigChange({ allowIncoming: !config.allowIncoming })}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                    config.allowIncoming
                      ? 'bg-gradient-to-r from-green-400 to-green-500'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${
                    config.allowIncoming ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Auto-start P2P on Launch
                  </label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Automatically start P2P service when Clara opens
                  </p>
                </div>
                <button
                  onClick={() => handleAutoStartToggle(!autoStartEnabled)}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                    autoStartEnabled
                      ? 'bg-gradient-to-r from-purple-400 to-purple-500'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${
                    autoStartEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Auto-connect to Known Devices
                  </label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Automatically reconnect to previously paired devices (like Bluetooth)
                  </p>
                </div>
                <button
                  onClick={() => handleAutoConnectToggle(!autoConnectEnabled)}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                    autoConnectEnabled
                      ? 'bg-gradient-to-r from-blue-400 to-blue-500'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${
                    autoConnectEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Local Network Discovery
                  </label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Automatically find Clara devices on your network
                  </p>
                </div>
                <button
                  onClick={() => handleConfigChange({ discoveryEnabled: !config.discoveryEnabled })}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                    config.discoveryEnabled
                      ? 'bg-gradient-to-r from-purple-400 to-purple-500'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${
                    config.discoveryEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>
          </div>

          {/* Info Card */}
          <div className="glassmorphic rounded-xl p-6 border-l-4 border-blue-500">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                  How Connectivity Works
                </h4>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <p>• <strong>Zero Configuration:</strong> No manual network setup required</p>
                  <p>• <strong>Secure by Default:</strong> All connections are encrypted end-to-end</p>
                  <p>• <strong>NAT Traversal:</strong> Works behind firewalls and routers automatically</p>
                  <p>• <strong>Local First:</strong> Prioritizes same-network connections for speed</p>
                  <p>• <strong>Privacy Focused:</strong> No data goes through external servers</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ConnectivitySettings;
