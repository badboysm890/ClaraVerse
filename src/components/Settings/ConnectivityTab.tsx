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
  RefreshCw, 
  Play, 
  Pause, 
  Copy, 
  Check, 
  X, 
  Eye,
  EyeOff,
  Globe,
  Zap,
  Settings as SettingsIcon,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader
} from 'lucide-react';
import { p2pService, ClaraPeer, P2PConfig } from '../../services/p2pService';

const ConnectivitySettings: React.FC = () => {
  const [config, setConfig] = useState<P2PConfig>(p2pService.getConfig());
  const [peers, setPeers] = useState<ClaraPeer[]>([]);
  const [localPeer, setLocalPeer] = useState<ClaraPeer | null>(p2pService.getLocalPeer());
  const [pairingCode, setPairingCode] = useState<string | null>(p2pService.getCurrentPairingCode());
  const [isServiceEnabled, setIsServiceEnabled] = useState(p2pService.isServiceEnabled());
  const [showPairingCode, setShowPairingCode] = useState(false);
  const [connectCode, setConnectCode] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Effect to listen for P2P service events
  useEffect(() => {
    const handleServiceStarted = (peer: ClaraPeer) => {
      setLocalPeer(peer);
      setIsServiceEnabled(true);
    };

    const handleServiceStopped = () => {
      setIsServiceEnabled(false);
      setPeers([]);
      setPairingCode(null);
    };

    const handlePeerDiscovered = (peer: ClaraPeer) => {
      setPeers(prev => {
        const existing = prev.find(p => p.id === peer.id);
        if (existing) return prev;
        return [...prev, peer];
      });
    };

    const handlePeerConnected = (peer: ClaraPeer) => {
      setPeers(prev => prev.map(p => p.id === peer.id ? peer : p));
    };

    const handlePeerDisconnected = (peer: ClaraPeer) => {
      setPeers(prev => prev.map(p => p.id === peer.id ? peer : p));
    };

    const handlePairingCodeGenerated = (code: string) => {
      setPairingCode(code);
    };

    const handlePairingCodeRefreshed = (code: string) => {
      setPairingCode(code);
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
    p2pService.on('pairing-code-generated', handlePairingCodeGenerated);
    p2pService.on('pairing-code-refreshed', handlePairingCodeRefreshed);
    p2pService.on('config-updated', handleConfigUpdated);

    // Load initial state
    setPeers(p2pService.getPeers());

    // Generate initial pairing code if none exists
    if (!pairingCode) {
      const initialCode = p2pService.refreshPairingCode();
      setPairingCode(initialCode);
    }

    // Cleanup
    return () => {
      p2pService.removeAllListeners();
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

  // Connect to a peer using pairing code
  const handleConnectToPeer = async () => {
    if (!connectCode.trim()) return;
    
    setIsConnecting(true);
    try {
      await p2pService.connectToPeer(connectCode.trim());
      setConnectCode('');
    } catch (error) {
      console.error('Connection failed:', error);
      alert('Failed to connect. Please check the pairing code and try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  // Copy pairing code to clipboard
  const copyPairingCode = async () => {
    if (!pairingCode) return;
    
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (error) {
      console.error('Failed to copy pairing code:', error);
    }
  };

  // Refresh pairing code
  const refreshPairingCode = () => {
    const newCode = p2pService.refreshPairingCode();
    setPairingCode(newCode);
  };

  // Disconnect from peer
  const handleDisconnectPeer = async (peerId: string) => {
    try {
      await p2pService.disconnectFromPeer(peerId);
    } catch (error) {
      console.error('Disconnect failed:', error);
      alert('Failed to disconnect. Please try again.');
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
        return { icon: Loader, color: 'text-yellow-500', text: 'Connecting' };
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
                    Capabilities: {localPeer.capabilities.length}
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Share Your Code */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                  Share Your Device
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Other devices can connect to you using this pairing code
                </p>
                
                {pairingCode ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className={`flex-1 p-3 rounded-lg border font-mono text-lg text-center tracking-wider ${
                        showPairingCode 
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-200'
                          : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500'
                      }`}>
                        {showPairingCode ? pairingCode : '••••••••••••'}
                      </div>
                      <button
                        onClick={() => setShowPairingCode(!showPairingCode)}
                        className="p-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                        title={showPairingCode ? 'Hide code' : 'Show code'}
                      >
                        {showPairingCode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={copyPairingCode}
                        disabled={!showPairingCode}
                        className={`flex-1 px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                          copiedCode
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {copiedCode ? (
                          <>
                            <Check className="w-4 h-4" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy Code
                          </>
                        )}
                      </button>
                      
                      <button
                        onClick={refreshPairingCode}
                        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                        title="Generate new code"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                    Generating pairing code...
                  </div>
                )}
              </div>

              {/* Connect to Another Device */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                  Connect to Another Device
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Enter a pairing code from another Clara device
                </p>
                
                <div className="space-y-3">
                  <input
                    type="text"
                    value={connectCode}
                    onChange={(e) => setConnectCode(e.target.value.toUpperCase())}
                    placeholder="CLARA-1234"
                    className="w-full px-4 py-3 rounded-lg bg-white/50 border border-gray-200 focus:outline-none focus:border-blue-300 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-100 font-mono text-center text-lg tracking-wider"
                    maxLength={12}
                  />
                  
                  <button
                    onClick={handleConnectToPeer}
                    disabled={!connectCode.trim() || isConnecting}
                    className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {isConnecting ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        Connect
                      </>
                    )}
                  </button>
                </div>
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
                  const DeviceIcon = getDeviceIcon(peer.deviceInfo.platform);
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
                          {peer.deviceInfo.platform} • {peer.isLocal ? 'Local Network' : 'Remote'}
                        </p>
                        <div className="flex items-center gap-4 mt-1">
                          <div className="flex items-center gap-1">
                            <StatusIcon className={`w-3 h-3 ${status.color}`} />
                            <span className={`text-xs font-medium ${status.color}`}>
                              {status.text}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-500">
                            {peer.capabilities.length} capabilities
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
                          className="px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors text-sm"
                        >
                          Disconnect
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
                  const DeviceIcon = getDeviceIcon(peer.deviceInfo.platform);

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
                          {peer.deviceInfo.platform} • Local Network
                        </p>
                        <span className="text-xs text-gray-500 dark:text-gray-500">
                          Last seen: {peer.lastSeen.toLocaleTimeString()}
                        </span>
                      </div>

                      <button
                        onClick={() => alert('🤝 Direct connection pairing coming soon!')}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                      >
                        Connect
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
                    Auto-connect to Known Devices
                  </label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Automatically reconnect to previously paired devices
                  </p>
                </div>
                <button
                  onClick={() => handleConfigChange({ autoConnect: !config.autoConnect })}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                    config.autoConnect
                      ? 'bg-gradient-to-r from-blue-400 to-blue-500'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${
                    config.autoConnect ? 'translate-x-6' : 'translate-x-0'
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
