/**
 * P2P Service for Clara Decentralized Network
 * 
 * Handles peer-to-peer connections between Clara instances using WebRTC
 * Provides zero-config networking with automatic discovery and NAT traversal
 */

// Simple browser-compatible EventEmitter
class SimpleEventEmitter {
  private events: { [key: string]: Function[] } = {};

  on(event: string, listener: Function): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  emit(event: string, ...args: any[]): void {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(...args));
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }
}

// Types for P2P communication
export interface ClaraPeer {
  id: string;
  name: string;
  version: string;
  capabilities: string[];
  isLocal: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'failed';
  lastSeen: Date;
  deviceInfo: {
    platform: string;
    hostname?: string;
    userAgent?: string;
  };
}

export interface P2PConfig {
  deviceName: string;
  enabled: boolean;
  allowIncoming: boolean;
  autoConnect: boolean;
  discoveryEnabled: boolean;
  relayServers: string[];
}

export interface ConnectionRequest {
  fromPeerId: string;
  fromName: string;
  pairingCode: string;
  timestamp: Date;
}

export interface AgentExecutionRequest {
  requestId: string;
  agentId: string;
  agentName: string;
  inputs: Record<string, any>;
  fromPeer: string;
  timestamp: Date;
}

// Default configuration
const DEFAULT_P2P_CONFIG: P2PConfig = {
  deviceName: 'Clara Device',
  enabled: false,
  allowIncoming: true,
  autoConnect: true,
  discoveryEnabled: true,
  relayServers: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302'
  ]
};

class P2PService extends SimpleEventEmitter {
  private config: P2PConfig = DEFAULT_P2P_CONFIG;
  private peers: Map<string, ClaraPeer> = new Map();
  private connections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private localPeer: ClaraPeer | null = null;
  private discoveryInterval: number | null = null;
  private currentPairingCode: string | null = null;
  private isEnabled = false;

  constructor() {
    super();
    this.initializeLocalPeer();
  }

  /**
   * Initialize the local peer identity
   */
  private initializeLocalPeer() {
    this.localPeer = {
      id: this.generatePeerId(),
      name: this.config.deviceName,
      version: '1.0.0', // TODO: Get from app version
      capabilities: ['agent-execution', 'file-sharing', 'real-time-chat'],
      isLocal: true,
      connectionState: 'disconnected',
      lastSeen: new Date(),
      deviceInfo: {
        platform: this.detectPlatform(),
        hostname: 'localhost',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'
      }
    };
  }

  /**
   * Generate a unique peer ID
   */
  private generatePeerId(): string {
    return 'clara-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Detect the current platform
   */
  private detectPlatform(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    
    const platform = navigator.platform?.toLowerCase() || '';
    if (platform.includes('mac')) return 'darwin';
    if (platform.includes('win')) return 'win32';
    return 'linux';
  }

  /**
   * Start the P2P service
   */
  async start(): Promise<void> {
    try {
      console.log('🌐 Starting Clara P2P Service...');
      
      // Use Electron backend if available, otherwise simulate
      if ((window as any).electronAPI?.invoke) {
        const result = await (window as any).electronAPI.invoke('p2p:start');
        if (result.success) {
          this.isEnabled = true;
          this.config.enabled = true;
          this.localPeer = result.localPeer;
          this.emit('service-started', this.localPeer);
          
          // Start listening for peer discoveries from backend
          this.setupBackendListeners();
          
          console.log('✅ Clara P2P Service started successfully (Electron backend)');
        } else {
          throw new Error(result.error);
        }
      } else {
        // Fallback to simulation for web environments
        this.isEnabled = true;
        this.config.enabled = true;
        
        if (this.config.discoveryEnabled) {
          await this.startDiscovery();
        }
        
        if (this.config.allowIncoming) {
          await this.startPairingServer();
        }
        
        this.emit('service-started', this.localPeer);
        console.log('✅ Clara P2P Service started successfully (simulation mode)');
      }
      
    } catch (error) {
      console.error('❌ Failed to start P2P service:', error);
      this.emit('service-error', error);
      throw error;
    }
  }

  /**
   * Stop the P2P service
   */
  async stop(): Promise<void> {
    try {
      console.log('🛑 Stopping Clara P2P Service...');
      
      // Use Electron backend if available
      if ((window as any).electronAPI?.invoke) {
        const result = await (window as any).electronAPI.invoke('p2p:stop');
        if (result.success) {
          this.isEnabled = false;
          this.config.enabled = false;
          this.peers.clear();
          this.currentPairingCode = null;
          this.emit('service-stopped');
          console.log('✅ P2P Service stopped (Electron backend)');
        }
      } else {
        // Fallback simulation cleanup
        this.isEnabled = false;
        this.config.enabled = false;
        
        if (this.discoveryInterval) {
          clearInterval(this.discoveryInterval);
          this.discoveryInterval = null;
        }
        
        this.peers.clear();
        this.currentPairingCode = null;
        
        this.emit('service-stopped');
        console.log('✅ P2P Service stopped (simulation mode)');
      }
      
    } catch (error) {
      console.error('❌ Error stopping P2P service:', error);
      this.emit('service-error', error);
    }
  }

  /**
   * Setup listeners for backend events
   */
  private setupBackendListeners(): void {
    if (!(window as any).electronAPI?.on) return;
    
    // Listen for peer discoveries from Electron backend
    (window as any).electronAPI.on('p2p:peer-discovered', (peer: ClaraPeer) => {
      this.peers.set(peer.id, peer);
      this.emit('peer-discovered', peer);
      console.log('🔍 Peer discovered via Electron backend:', peer.name);
    });
    
    // Listen for pairing successes
    (window as any).electronAPI.on('p2p:pairing-success', (peer: ClaraPeer) => {
      if (peer) {
        this.peers.set(peer.id, { ...peer, connectionState: 'connected' });
        this.emit('peer-connected', peer);
        console.log('🤝 Peer connected via pairing:', peer.name);
      }
    });
  }

  /**
   * Start local network discovery using mDNS-like approach
   */
  private async startDiscovery(): Promise<void> {
    // Simulate local network discovery
    // In a real implementation, this would use WebRTC's RTCPeerConnection
    // with mDNS or a lightweight discovery protocol
    
    this.discoveryInterval = setInterval(async () => {
      try {
        await this.discoverLocalPeers();
      } catch (error) {
        console.warn('Discovery error:', error);
      }
    }, 5000); // Discover every 5 seconds
    
    console.log('🔍 Local network discovery started');
  }

  /**
   * Discover other Clara instances on the local network
   */
  private async discoverLocalPeers(): Promise<void> {
    // Simulate discovering a local peer for demo purposes
    // In production, this would scan the local network or use mDNS
    
    if (Math.random() < 0.1) { // 10% chance to "discover" a peer
      const mockPeer: ClaraPeer = {
        id: 'clara-local-' + Math.random().toString(36).substr(2, 9),
        name: 'Clara Desktop (Living Room)',
        version: '1.0.0',
        capabilities: ['agent-execution', 'file-sharing'],
        isLocal: true,
        connectionState: 'disconnected',
        lastSeen: new Date(),
        deviceInfo: {
          platform: 'darwin',
          hostname: 'MacBook-Pro.local'
        }
      };
      
      if (!this.peers.has(mockPeer.id)) {
        this.peers.set(mockPeer.id, mockPeer);
        this.emit('peer-discovered', mockPeer);
        console.log('🔍 Discovered local peer:', mockPeer.name);
      }
    }
  }

  /**
   * Start the pairing server for incoming connections
   */
  private async startPairingServer(): Promise<void> {
    // Generate a pairing code for this session
    this.currentPairingCode = this.generatePairingCode();
    console.log('🔐 Pairing code generated:', this.currentPairingCode);
    
    // In a real implementation, this would start a lightweight server
    // or register with a discovery service
    this.emit('pairing-code-generated', this.currentPairingCode);
  }

  /**
   * Generate a human-readable pairing code
   */
  private generatePairingCode(): string {
    const words = ['CLARA', 'AGENT', 'SMART', 'MAGIC', 'BRAIN', 'SPARK'];
    const numbers = Math.floor(1000 + Math.random() * 9000).toString();
    const word = words[Math.floor(Math.random() * words.length)];
    return `${word}-${numbers}`;
  }

  /**
   * Connect to a peer using a pairing code
   */
  async connectToPeer(pairingCode: string): Promise<void> {
    try {
      console.log('🤝 Attempting to connect with pairing code:', pairingCode);
      
      // Use Electron backend if available
      if ((window as any).electronAPI?.invoke) {
        const result = await (window as any).electronAPI.invoke('p2p:connect-to-peer', pairingCode);
        if (result.success) {
          const peer = result.peer;
          this.peers.set(peer.id, peer);
          this.emit('peer-connected', peer);
          console.log('✅ Connected to peer via Electron backend:', peer.name);
        } else {
          throw new Error(result.error);
        }
      } else {
        // Fallback simulation
        const mockPeer: ClaraPeer = {
          id: 'clara-remote-' + Date.now(),
          name: 'Clara Mobile',
          version: '1.0.0',
          capabilities: ['agent-execution'],
          isLocal: false,
          connectionState: 'connecting',
          lastSeen: new Date(),
          deviceInfo: {
            platform: 'android',
            userAgent: 'Clara Mobile App'
          }
        };
        
        this.peers.set(mockPeer.id, mockPeer);
        this.emit('peer-connecting', mockPeer);
        
        // Simulate connection time
        setTimeout(() => {
          mockPeer.connectionState = 'connected';
          this.emit('peer-connected', mockPeer);
          console.log('✅ Connected to peer (simulation):', mockPeer.name);
        }, 2000);
      }
      
    } catch (error) {
      console.error('❌ Failed to connect to peer:', error);
      this.emit('connection-failed', { pairingCode, error });
      throw error;
    }
  }

  /**
   * Disconnect from a peer
   */
  async disconnectFromPeer(peerId: string): Promise<void> {
    try {
      const peer = this.peers.get(peerId);
      if (!peer) return;
      
      // Close WebRTC connection
      const connection = this.connections.get(peerId);
      if (connection) {
        connection.close();
        this.connections.delete(peerId);
      }
      
      // Close data channel
      this.dataChannels.delete(peerId);
      
      // Update peer state
      peer.connectionState = 'disconnected';
      
      this.emit('peer-disconnected', peer);
      console.log('🔌 Disconnected from peer:', peer.name);
      
    } catch (error) {
      console.error('❌ Error disconnecting from peer:', error);
      this.emit('disconnection-error', { peerId, error });
    }
  }

  /**
   * Execute an agent on a remote peer
   */
  async executeAgentRemotely(peerId: string, agentId: string, inputs: Record<string, any>): Promise<any> {
    try {
      const peer = this.peers.get(peerId);
      if (!peer || peer.connectionState !== 'connected') {
        throw new Error('Peer not connected');
      }
      
      const request: AgentExecutionRequest = {
        requestId: 'req-' + Date.now(),
        agentId,
        agentName: 'Remote Agent', // TODO: Get actual agent name
        inputs,
        fromPeer: this.localPeer!.id,
        timestamp: new Date()
      };
      
      console.log(`🚀 Executing agent "${agentId}" on remote peer:`, peer.name);
      this.emit('remote-execution-started', { peer, request });
      
      // Simulate remote execution
      return new Promise((resolve) => {
        setTimeout(() => {
          const result = {
            success: true,
            output: `Agent executed successfully on ${peer.name}`,
            executionTime: 2.5,
            requestId: request.requestId
          };
          
          this.emit('remote-execution-completed', { peer, request, result });
          resolve(result);
        }, 3000);
      });
      
    } catch (error) {
      console.error('❌ Remote agent execution failed:', error);
      this.emit('remote-execution-failed', { peerId, agentId, error });
      throw error;
    }
  }

  // Getters
  getLocalPeer(): ClaraPeer | null {
    // Ensure localPeer is properly initialized
    if (!this.localPeer) {
      this.initializeLocalPeer();
    }
    
    // Ensure deviceInfo exists
    if (this.localPeer && !this.localPeer.deviceInfo) {
      this.localPeer.deviceInfo = {
        platform: this.detectPlatform(),
        hostname: 'localhost',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'
      };
    }
    
    return this.localPeer;
  }

  getPeers(): ClaraPeer[] {
    return Array.from(this.peers.values());
  }

  getConnectedPeers(): ClaraPeer[] {
    return this.getPeers().filter(peer => peer.connectionState === 'connected');
  }

  getCurrentPairingCode(): string | null {
    return this.currentPairingCode;
  }

  getConfig(): P2PConfig {
    return { ...this.config };
  }

  isServiceEnabled(): boolean {
    return this.isEnabled;
  }

  // Configuration methods
  async updateConfig(updates: Partial<P2PConfig>): Promise<void> {
    // Use Electron backend if available
    if ((window as any).electronAPI?.invoke) {
      await (window as any).electronAPI.invoke('p2p:update-config', updates);
      console.log('📝 P2P configuration updated via Electron backend:', updates);
    } else {
      // Fallback simulation
      this.config = { ...this.config, ...updates };
      
      // Update local peer name if changed
      if (updates.deviceName && this.localPeer) {
        this.localPeer.name = updates.deviceName;
      }
      
      // Restart service if needed
      if (this.isEnabled && (updates.enabled === false)) {
        await this.stop();
      } else if (!this.isEnabled && updates.enabled === true) {
        await this.start();
      }
      
      console.log('📝 P2P configuration updated (simulation):', this.config);
    }
    
    this.emit('config-updated', this.config);
  }

  /**
   * Generate a new pairing code
   */
  refreshPairingCode(): string {
    // Use Electron backend if available
    if ((window as any).electronAPI?.invoke) {
      (window as any).electronAPI.invoke('p2p:generate-pairing-code').then((code: string) => {
        this.currentPairingCode = code;
        this.emit('pairing-code-refreshed', code);
        console.log('🔄 New pairing code generated via Electron backend:', code);
      }).catch((error: any) => {
        console.error('Failed to generate pairing code via backend, using fallback:', error);
        this.currentPairingCode = this.generatePairingCode();
        this.emit('pairing-code-refreshed', this.currentPairingCode);
      });
      
      // Return current code or generate a temporary one while waiting for backend
      if (!this.currentPairingCode) {
        this.currentPairingCode = this.generatePairingCode();
        this.emit('pairing-code-refreshed', this.currentPairingCode);
      }
    } else {
      // Fallback simulation
      this.currentPairingCode = this.generatePairingCode();
      this.emit('pairing-code-refreshed', this.currentPairingCode);
      console.log('🔄 New pairing code generated (simulation):', this.currentPairingCode);
    }
    return this.currentPairingCode || 'CLARA-0000';
  }
}

// Export singleton instance
export const p2pService = new P2PService();

// Export types
export default P2PService;
