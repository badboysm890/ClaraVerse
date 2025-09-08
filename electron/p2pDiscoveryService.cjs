/**
 * P2P Discovery Service for Electron Main Process
 * 
 * Handles real network discovery, mDNS, and P2P networking
 */

const { ipcMain } = require('electron');
const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');

class P2PDiscoveryService {
  constructor() {
    this.isEnabled = false;
    this.discoveryPort = 47264; // Clara P2P discovery port
    this.udpSocket = null;
    this.httpServer = null;
    this.discoveredPeers = new Map();
    this.localPeer = null;
    this.discoveryInterval = null;
    this.mainWindow = null;
    this.connectivityTabOpen = false; // Track if connectivity tab is open
    this.discoveryActive = false; // Track if discovery is actively running
    this.currentPairingCode = null; // Legacy: Still used for initial pairing
    this.deviceToken = null; // NEW: Permanent device authentication token
    this.connectedPeersFile = require('path').join(require('os').homedir(), '.clara', 'connected-peers.json');
    this.configFile = require('path').join(require('os').homedir(), '.clara', 'p2p-config.json');
    
    // Load configuration and previously connected peers
    this.loadConfiguration();
    this.loadConnectedPeers();
    
    // Generate or load permanent device token
    this.initializeDeviceToken();
    
    // Setup IPC handlers
    this.setupIPCHandlers();
    
    // Auto-start P2P if enabled
    if (this.autoStartOnBoot) {
      setTimeout(() => {
        this.start().then(() => {
          console.log('🚀 P2P service auto-started on boot');
        }).catch(error => {
          console.error('Failed to auto-start P2P service:', error);
        });
      }, 2000); // Wait 2 seconds for app to fully initialize
    }
  }

  setupIPCHandlers() {
    ipcMain.handle('p2p:start', async () => {
      return await this.start();
    });

    ipcMain.handle('p2p:stop', async () => {
      return await this.stop();
    });

    ipcMain.handle('p2p:get-peers', () => {
      return Array.from(this.discoveredPeers.values());
    });

    ipcMain.handle('p2p:get-local-peer', () => {
      return this.localPeer;
    });

    ipcMain.handle('p2p:connect-to-peer', async (event, peer) => {
      return await this.connectToPeer(peer);
    });

    ipcMain.handle('p2p:generate-pairing-code', () => {
      if (!this.currentPairingCode) {
        this.generatePairingCode();
      }
      return this.currentPairingCode;
    });

    ipcMain.handle('p2p:update-config', async (event, updates) => {
      return await this.updateConfig(updates);
    });
    
    ipcMain.handle('p2p:set-auto-start', async (event, enabled) => {
      this.autoStartOnBoot = enabled;
      this.saveConfiguration();
      return { success: true };
    });
    
    ipcMain.handle('p2p:set-auto-connect', async (event, enabled) => {
      this.autoConnectEnabled = enabled;
      this.saveConfiguration();
      return { success: true };
    });
    
    ipcMain.handle('p2p:get-settings', () => {
      return {
        autoStartOnBoot: this.autoStartOnBoot,
        autoConnectEnabled: this.autoConnectEnabled,
        isEnabled: this.isEnabled
      };
    });

    // New handlers for smart discovery management
    ipcMain.handle('p2p:connectivity-tab-opened', () => {
      console.log('📱 Connectivity tab opened - enabling discovery');
      this.connectivityTabOpen = true;
      if (this.isEnabled) {
        this.manageDiscovery();
      }
      return { success: true };
    });

    ipcMain.handle('p2p:connectivity-tab-closed', () => {
      console.log('📱 Connectivity tab closed - checking if discovery needed');
      this.connectivityTabOpen = false;
      if (this.isEnabled) {
        this.manageDiscovery();
      }
      return { success: true };
    });

    // Handler for disconnecting from a peer
    ipcMain.handle('p2p:disconnect-peer', async (event, peerId) => {
      return await this.disconnectFromPeer(peerId);
    });

    // Handler for unpairing a device (removes stored token)
    ipcMain.handle('p2p:unpair-device', async (event, peerId) => {
      return await this.disconnectFromPeer(peerId, true);
    });

    // Handler for getting connection history
    ipcMain.handle('p2p:get-connection-history', () => {
      return this.getConnectionHistory();
    });

    // Handler for clearing connection history
    ipcMain.handle('p2p:clear-connection-history', () => {
      try {
        const historyPath = path.join(this.dataDirectory, 'connection-history.json');
        if (fs.existsSync(historyPath)) {
          fs.unlinkSync(historyPath);
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }

  async start() {
    try {
      console.log('🌐 Starting real P2P Discovery Service...');
      
      this.isEnabled = true;
      this.initializeLocalPeer();
      
      // Generate initial pairing code
      if (!this.currentPairingCode) {
        this.generatePairingCode();
      }
      
      // Start UDP discovery server
      await this.startUDPDiscovery();
      
      // Start HTTP pairing server
      await this.startHTTPServer();
      
      // Start intelligent discovery management
      this.manageDiscovery();
      
      console.log('✅ P2P Discovery Service started successfully');
      console.log(`📡 Broadcasting on UDP port ${this.discoveryPort}`);
      console.log(`🔗 Pairing server on HTTP port ${this.localPeer.pairingPort}`);
      
      // Save auto-start preference when manually started
      if (!this.autoStartOnBoot) {
        this.autoStartOnBoot = true;
        this.saveConfiguration();
        console.log('💾 Auto-start enabled for next boot');
      }
      
      return { success: true, localPeer: this.localPeer };
    } catch (error) {
      console.error('❌ Failed to start P2P Discovery Service:', error);
      return { success: false, error: error.message };
    }
  }

  async stop() {
    try {
      console.log('🛑 Stopping P2P Discovery Service...');
      
      this.isEnabled = false;
      
      // Stop discovery interval
      this.stopPeriodicDiscovery();
      
      // Close UDP socket
      if (this.udpSocket) {
        this.udpSocket.close();
        this.udpSocket = null;
      }
      
      // Close HTTP server
      if (this.httpServer) {
        this.httpServer.close();
        this.httpServer = null;
      }
      
      console.log('✅ P2P Discovery Service stopped');
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to stop P2P Discovery Service:', error);
      return { success: false, error: error.message };
    }
  }

  initializeLocalPeer() {
    this.localPeer = {
      id: this.generatePeerId(),
      name: os.hostname() || 'Clara Desktop',
      version: '1.0.0',
      capabilities: ['agent-execution', 'file-sharing', 'real-time-chat'],
      isLocal: true,
      connectionState: 'disconnected',
      lastSeen: new Date(),
      pairingPort: 47265 + Math.floor(Math.random() * 5), // Random port 47265-47269
      deviceInfo: {
        platform: os.platform(),
        hostname: os.hostname(),
        userAgent: 'Clara Desktop/1.0.0'
      }
    };
    
    console.log(`🏷️ Local peer initialized: ${this.localPeer.name} (${this.localPeer.id})`);
  }

  generatePeerId() {
    return 'clara-' + crypto.randomBytes(8).toString('hex');
  }

  initializeDeviceToken() {
    try {
      const config = this.loadConfiguration();
      if (config && config.deviceToken) {
        this.deviceToken = config.deviceToken;
        console.log('📱 Loaded existing device token');
      } else {
        // Generate new permanent device token
        this.deviceToken = this.generateDeviceToken();
        this.saveConfiguration();
        console.log('🔐 Generated new device token:', this.deviceToken.substring(0, 8) + '...');
      }
    } catch (error) {
      console.error('Failed to initialize device token:', error);
      this.deviceToken = this.generateDeviceToken();
    }
  }

  generateDeviceToken() {
    // Generate a permanent 32-byte token (256 bits) for strong security
    return crypto.randomBytes(32).toString('hex');
  }

  generatePairingCode() {
    const words = ['BRAIN', 'NOVA', 'STAR', 'CORE', 'DATA', 'SYNC', 'FLOW', 'LINK'];
    const word = words[Math.floor(Math.random() * words.length)];
    const number = Math.floor(1000 + Math.random() * 9000);
    this.currentPairingCode = `${word}-${number}`;
    console.log(`🔑 Generated pairing code: ${this.currentPairingCode}`);
    return this.currentPairingCode;
  }

  async startUDPDiscovery() {
    return new Promise((resolve, reject) => {
      this.udpSocket = dgram.createSocket('udp4');
      
      this.udpSocket.on('message', (msg, rinfo) => {
        this.handleDiscoveryMessage(msg, rinfo);
      });
      
      this.udpSocket.on('error', (err) => {
        console.error('UDP Discovery Error:', err);
        reject(err);
      });
      
      // Try to bind to the preferred port, or find an available one
      const tryBind = (port) => {
        this.udpSocket.bind(port, (error) => {
          if (error) {
            if (error.code === 'EADDRINUSE' && port < 47300) {
              // Try next port
              tryBind(port + 1);
            } else {
              reject(error);
            }
          } else {
            this.discoveryPort = port;
            this.udpSocket.setBroadcast(true);
            console.log(`📡 UDP Discovery server listening on port ${this.discoveryPort}`);
            resolve();
          }
        });
      };
      
      tryBind(this.discoveryPort);
    });
  }

  async startHTTPServer() {
    const http = require('http');
    
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        this.handleHTTPRequest(req, res);
      });
      
      this.httpServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // Try next port
          this.localPeer.pairingPort++;
          this.httpServer.listen(this.localPeer.pairingPort, () => {
            console.log(`🔗 HTTP Pairing server listening on port ${this.localPeer.pairingPort}`);
            resolve();
          });
        } else {
          console.error('HTTP Pairing Server Error:', err);
          reject(err);
        }
      });
      
      this.httpServer.listen(this.localPeer.pairingPort, () => {
        console.log(`🔗 HTTP Pairing server listening on port ${this.localPeer.pairingPort}`);
        resolve();
      });
    });
  }

  // Check if we have any connected peers
  hasConnectedPeers() {
    return Array.from(this.discoveredPeers.values()).some(peer => peer.connectionState === 'connected');
  }

  // Intelligent discovery management
  manageDiscovery() {
    const hasConnected = this.hasConnectedPeers();
    const shouldRunDiscovery = this.connectivityTabOpen || !hasConnected;

    if (shouldRunDiscovery && !this.discoveryActive) {
      console.log(`🔍 Starting discovery - Tab open: ${this.connectivityTabOpen}, Connected peers: ${hasConnected ? 'Yes' : 'No'}`);
      this.startPeriodicDiscovery();
    } else if (!shouldRunDiscovery && this.discoveryActive) {
      console.log(`⏹️ Stopping discovery - All peers connected and tab closed`);
      this.stopPeriodicDiscovery();
    }
  }

  startPeriodicDiscovery() {
    if (this.discoveryActive) return; // Already running
    
    this.discoveryActive = true;
    // Broadcast our presence every 5 seconds
    this.discoveryInterval = setInterval(() => {
      this.broadcastDiscovery();
    }, 5000);
    
    // Send initial broadcast
    this.broadcastDiscovery();
  }

  stopPeriodicDiscovery() {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    this.discoveryActive = false;
  }

  broadcastDiscovery() {
    if (!this.isEnabled || !this.udpSocket) return;
    
    const message = JSON.stringify({
      type: 'clara-discovery',
      peer: this.localPeer,
      timestamp: Date.now()
    });
    
    // Get broadcast addresses for all network interfaces
    const networkInterfaces = os.networkInterfaces();
    const broadcastAddresses = [];
    
    Object.values(networkInterfaces).forEach(interfaces => {
      interfaces?.forEach(iface => {
        if (iface.family === 'IPv4' && !iface.internal && iface.netmask) {
          // Calculate broadcast address
          const ip = iface.address.split('.').map(Number);
          const netmask = iface.netmask.split('.').map(Number);
          const broadcast = ip.map((octet, i) => octet | (255 - netmask[i])).join('.');
          broadcastAddresses.push(broadcast);
        }
      });
    });
    
    // Also add common broadcast addresses
    broadcastAddresses.push('255.255.255.255');
    
    // Send to all broadcast addresses
    broadcastAddresses.forEach(addr => {
      this.udpSocket.send(message, this.discoveryPort, addr, (err) => {
        if (err && err.code !== 'EACCES') {
          console.warn(`Discovery broadcast to ${addr} failed:`, err.message);
        }
      });
    });
    
    // Only log occasionally to avoid spam
    if (this.broadcastCount % 12 === 0) { // Log every minute (12 * 5 seconds)
      console.log(`📡 Discovery active - broadcasting to ${broadcastAddresses.length} networks`);
    }
    this.broadcastCount = (this.broadcastCount || 0) + 1;
  }

  handleDiscoveryMessage(msg, rinfo) {
    try {
      const data = JSON.parse(msg.toString());
      
      if (data.type === 'clara-discovery' && data.peer) {
        const peer = data.peer;
        
        // Don't discover ourselves
        if (peer.id === this.localPeer.id) return;
        
        // Update or add peer
        const existingPeer = this.discoveredPeers.get(peer.id);
        const updatedPeer = {
          ...peer,
          isLocal: true, // This peer is on the local network
          connectionState: existingPeer?.connectionState || 'disconnected',
          lastSeen: new Date(),
          sourceIP: rinfo.address,
          sourcePort: rinfo.port,
          // Use the pairing port from the peer data, not the UDP port
          pairingPort: peer.pairingPort,
          // Ensure capabilities exists with defaults
          capabilities: peer.capabilities || ['agent-execution', 'file-sharing', 'real-time-chat'],
          // Ensure deviceInfo exists with defaults
          deviceInfo: peer.deviceInfo || {
            platform: 'unknown',
            hostname: peer.name || 'Unknown Device',
            userAgent: 'Clara/1.0.0'
          }
        };
        
        this.discoveredPeers.set(peer.id, updatedPeer);
        
        // Only log when we first discover a peer, not on every update
        if (!existingPeer) {
          console.log(`🔍 Discovered Clara peer: ${peer.name} (${rinfo.address})`);
        }
        
        // Auto-connect to previously connected peers (only if not already connected)
        if (this.autoConnectEnabled && updatedPeer.connectionState !== 'connected') {
          this.attemptAutoConnect(updatedPeer);
        }
        
        // Notify renderer of new peer
        if (this.mainWindow) {
          this.mainWindow.webContents.send('p2p:peer-discovered', updatedPeer);
        }
      }
    } catch (error) {
      console.warn('Invalid discovery message:', error.message);
    }
  }

  async attemptAutoConnect(discoveredPeer) {
    try {
      // Check if this peer was previously connected
      const connectedPeers = this.loadConnectedPeers();
      console.log(`🔍 Checking ${connectedPeers.length} previously connected peers for auto-connect`);
      
      if (!connectedPeers || !Array.isArray(connectedPeers)) {
        return; // No previous connections or invalid data
      }
      
      const previousConnection = connectedPeers.find(p => p.id === discoveredPeer.id);
      
      if (previousConnection && discoveredPeer.connectionState !== 'connected') {
        console.log(`🔄 Auto-connecting to previously paired device: ${discoveredPeer.name}`);
        console.log(`🔐 Previous connection has token: ${previousConnection.deviceToken ? 'YES' : 'NO'}`);
        
        // Try token authentication first (for known peers)
        if (previousConnection.deviceToken) {
          try {
            console.log(`🔐 Attempting token authentication for: ${discoveredPeer.name}`);
            // Set the device token on the peer before authentication
            discoveredPeer.deviceToken = previousConnection.deviceToken;
            const result = await this.testTokenAuthentication(discoveredPeer, previousConnection.deviceToken);
            if (result.success) {
              // Update peer status
              discoveredPeer.connectionState = 'connected';
              discoveredPeer.isAutoConnect = true;
              discoveredPeer.connectedAt = new Date();
              discoveredPeer.lastConnected = new Date();
              this.discoveredPeers.set(discoveredPeer.id, discoveredPeer);
              
              // Save updated connection
              this.saveConnectedPeers();
              
              // Manage discovery after connection
              this.manageDiscovery();
              
              // Notify frontend
              if (this.mainWindow) {
                this.mainWindow.webContents.send('p2p:peer-connected', discoveredPeer);
              }
              
              console.log(`✅ Auto-connected via token to ${discoveredPeer.name}`);
              return; // Success, no need to try pairing code
            }
          } catch (error) {
            console.log(`❌ Token authentication failed for ${discoveredPeer.name}: ${error.message}`);
          }
        } else {
          console.log(`⚠️ No device token found for ${discoveredPeer.name}, falling back to pairing code`);
        }
        
        // Fallback to pairing code (legacy method)
        try {
          const pairingCode = await this.fetchPeerPairingCode(discoveredPeer);
          if (pairingCode) {
            // Attempt auto-connection
            const result = await this.testPeerConnection(discoveredPeer, pairingCode);
            if (result.success) {
              // Update peer status
              discoveredPeer.connectionState = 'connected';
              discoveredPeer.isAutoConnect = true;
              discoveredPeer.connectedAt = new Date();
              this.discoveredPeers.set(discoveredPeer.id, discoveredPeer);
              
              // Save updated connection
              this.saveConnectedPeers();
              
              // Notify frontend
              if (this.mainWindow) {
                this.mainWindow.webContents.send('p2p:peer-connected', discoveredPeer);
              }
              
              console.log(`✅ Auto-connected via pairing code to ${discoveredPeer.name}`);
            } else {
              console.log(`❌ Auto-connect failed for ${discoveredPeer.name}: Pairing code mismatch`);
            }
          }
        } catch (error) {
          console.log(`❌ Pairing code auto-connect failed for ${discoveredPeer.name}: ${error.message}`);
        }
      }
    } catch (error) {
      console.warn('Auto-connect attempt failed:', error.message);
    }
  }

  async fetchPeerPairingCode(peer) {
    return new Promise((resolve) => {
      const http = require('http');
      const timeout = 3000;
      
      const options = {
        hostname: peer.sourceIP,
        port: peer.pairingPort,
        path: '/pairing-code',
        method: 'GET',
        timeout: timeout
      };
      
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            resolve(response.pairingCode);
          } catch (error) {
            resolve(null);
          }
        });
      });
      
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      
      req.end();
    });
  }

  handleHTTPRequest(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (req.url === '/info' && req.method === 'GET') {
      // Provide peer information
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        peer: this.localPeer,
        deviceToken: this.deviceToken, // Include device token for known peers
        timestamp: Date.now()
      }));
      return;
    }
    
    if (req.url === '/pair' && req.method === 'POST') {
      // Direct pairing for new devices (generates tokens automatically)
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        this.handleNewDevicePairing(body, res);
      });
      return;
    }
    
    if (req.url === '/auth-token' && req.method === 'POST') {
      // Token-based authentication for known peers
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        this.handleTokenAuthentication(body, res);
      });
      return;
    }
    
    // 404 for other requests
    res.writeHead(404);
    res.end('Not Found');
  }

  handleNewDevicePairing(body, res) {
    try {
      const data = JSON.parse(body);
      
      console.log(`� New device pairing request from: ${data.requesterName} (${data.requesterId})`);
      
      // Show confirmation dialog for new device
      this.showNewDeviceConfirmation(data, res);
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Invalid request'
      }));
      
      console.log(`❌ Invalid pairing request: ${error.message}`);
    }
  }

  handleTokenAuthentication(body, res) {
    try {
      const data = JSON.parse(body);
      console.log(`🔐 Device token authentication attempt from: ${data.requesterId}`);
      
      // Check if this device token matches a known connected peer
      const connectedPeers = this.loadConnectedPeers();
      if (!connectedPeers || !Array.isArray(connectedPeers)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'No known devices found'
        }));
        return;
      }
      
      const knownPeer = connectedPeers.find(peer => 
        peer.deviceToken === data.deviceToken && peer.id === data.requesterId
      );
      
      if (knownPeer) {
        // Automatic authentication for known devices
        console.log(`✅ Auto-authenticated known device: ${knownPeer.name} (${data.requesterId})`);
        
        // Update peer status
        const connectedPeer = {
          id: data.requesterId,
          name: data.requesterName || knownPeer.name,
          deviceToken: data.deviceToken,
          connectionState: 'connected',
          connectedAt: new Date(),
          isAutoConnect: true,
          lastConnected: new Date()
        };
        
        this.discoveredPeers.set(data.requesterId, connectedPeer);
        this.saveConnectedPeers();
        
        // Send success response with our device token
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Token authenticated successfully',
          deviceToken: this.deviceToken // Send our token back
        }));
        
        // Notify frontend
        if (this.mainWindow) {
          this.mainWindow.webContents.send('p2p:peer-connected', connectedPeer);
        }
      } else {
        // Unknown device token
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Unknown device token'
        }));
        
        console.log(`❌ Unknown device token from: ${data.requesterId}`);
      }
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Invalid request'
      }));
      
      console.log(`❌ Invalid token authentication request: ${error.message}`);
    }
  }

  async showNewDeviceConfirmation(data, res) {
    try {
      console.log(`⚠️  PAIRING CONFIRMATION REQUESTED - This should only happen for NEW devices!`);
      console.log(`📱 Device: ${data.requesterName} (${data.requesterId})`);
      
      if (this.mainWindow) {
        // Show confirmation dialog in the main window
        const { dialog } = require('electron');
        
        const result = await dialog.showMessageBox(this.mainWindow, {
          type: 'question',
          buttons: ['Accept', 'Deny'],
          defaultId: 0,
          title: 'Clara - New Device Connection',
          message: `New Clara device wants to connect`,
          detail: `Device: ${data.requesterName}\nID: ${data.requesterId}\n\nThis is a one-time confirmation. Future connections will be automatic.`,
          icon: null
        });
        
        if (result.response === 0) { // Accept
          // Add to connected peers with device token for future auto-connect
          const connectedPeer = {
            id: data.requesterId,
            name: data.requesterName || 'Unknown Device',
            deviceToken: data.deviceToken, // Save the requesting device's token
            connectionState: 'connected',
            connectedAt: new Date(),
            isAutoConnect: true
          };
          
          this.discoveredPeers.set(data.requesterId, connectedPeer);
          this.saveConnectedPeers();
          
          // Send success response with our device token
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            peer: this.localPeer,
            deviceToken: this.deviceToken, // Send our token for mutual authentication
            message: 'Connection accepted'
          }));
          
          // Notify frontend
          if (this.mainWindow) {
            this.mainWindow.webContents.send('p2p:peer-connected', connectedPeer);
          }
          
          console.log(`✅ Connection accepted for: ${data.requesterId}`);
        } else { // Deny
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Connection denied by user'
          }));
          
          console.log(`❌ Connection denied for: ${data.requesterId}`);
        }
      } else {
        // Fallback: auto-accept if no UI available
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          peer: this.localPeer,
          message: 'Connection auto-accepted'
        }));
        
        console.log(`✅ Connection auto-accepted for: ${data.requesterId}`);
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Server error' }));
      console.error('Confirmation dialog error:', error);
    }
  }

  async connectToPeer(pairingCode) {
    try {
      console.log(`🤝 Attempting to connect with pairing code: ${pairingCode}`);
      console.log(`🔍 Current discovered peers: ${this.discoveredPeers.size}`);
      
      // Debug: List all discovered peers
      for (const peer of this.discoveredPeers.values()) {
        console.log(`📡 Available peer: ${peer.name} (${peer.id}) - ${peer.connectionState}`);
      }
      
      // First try discovered peers
      for (const peer of this.discoveredPeers.values()) {
        try {
          const response = await this.testPeerConnection(peer, pairingCode);
          if (response.success) {
            console.log(`✅ Successfully connected to ${peer.name}`);
            
            // Update peer status and save connection with device token
            peer.connectionState = 'connected';
            peer.isAutoConnect = true;
            peer.connectedAt = new Date();
            peer.lastConnected = new Date();
            
            // Save device token if provided in response
            if (response.deviceToken) {
              peer.deviceToken = response.deviceToken;
              console.log('🔐 Saved device token for future auto-connect');
            }
            
            this.discoveredPeers.set(peer.id, peer);
            
            // Save to persistent storage
            this.saveConnectedPeers();
            
            // Notify frontend
            if (this.mainWindow) {
              this.mainWindow.webContents.send('p2p:peer-connected', peer);
            }
            
            return {
              success: true,
              peer: peer,
              message: 'Connection successful'
            };
          }
        } catch (error) {
          console.log(`❌ Failed to connect to ${peer.name}: ${error.message}`);
        }
      }
      
      // If no discovered peers worked, try network scan for the pairing code
      console.log('🔍 No discovered peers matched, trying network scan...');
      const networkResult = await this.scanNetworkForPairingCode(pairingCode);
      if (networkResult.success) {
        return networkResult;
      }
      
      return {
        success: false,
        error: 'No peer found with that pairing code'
      };
      
    } catch (error) {
      console.error('Connection error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async testPeerConnection(peer, pairingCode) {
    return new Promise((resolve, reject) => {
      const http = require('http');
      
      const data = JSON.stringify({
        type: 'pairing-request',
        pairingCode: pairingCode,
        requesterId: this.localPeer.id,
        requesterName: this.localPeer.name,
        deviceToken: this.deviceToken // Include our device token for saving
      });
      
      const options = {
        hostname: peer.sourceIP,
        port: peer.pairingPort,
        path: '/pair',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 5000
      };
      
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            resolve(response);
          } catch (error) {
            reject(new Error('Invalid response'));
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Connection timeout')));
      req.write(data);
      req.end();
    });
  }

  async connectToPeer(peer) {
    try {
      // Use stored device token for connection
      const storedToken = this.getStoredDeviceToken(peer.ip);
      if (storedToken) {
        this.logger.log('Connecting with stored device token');
        const success = await this.testTokenAuthentication(peer, storedToken);
        if (success) {
          return { success: true, peer: success };
        } else {
          // Token failed - remove it and try new pairing
          this.removeStoredDeviceToken(peer.ip);
          this.logger.log('Stored token failed, removed and trying new pairing');
        }
      }

      // No stored token or token failed - initiate new device pairing
      this.logger.log('Initiating new device pairing for:', peer.name || peer.ip);
      const result = await this.requestNewDeviceAccess(peer);
      return result;
    } catch (error) {
      this.logger.error('Error in connectToPeer:', error.message);
      return { success: false, error: error.message };
    }
  }

  async requestNewDeviceAccess(peer) {
    try {
      // Generate a device token for this connection
      const deviceToken = this.generateDeviceToken();
      
      // Send new device request to peer
      const requestData = JSON.stringify({
        type: 'new-device-request',
        deviceToken: deviceToken,
        deviceInfo: {
          name: this.localPeer.name,
          platform: process.platform,
          version: this.localPeer.version,
          id: this.localPeer.id,
          ip: peer.ip // Include IP for the receiving end
        },
        timestamp: Date.now()
      });

      const response = await this.sendHttpRequest(peer.ip, peer.pairingPort, '/device-pairing', requestData);
      
      if (response && response.success) {
        // Store the device token for future use
        this.storeDeviceToken(peer.ip, deviceToken);
        
        // Create connected peer object
        const connectedPeer = {
          ...peer,
          connectionState: 'connected',
          connectedAt: new Date(),
          deviceToken: deviceToken
        };
        
        // Add to connected peers
        this.connectedPeers.set(peer.id, connectedPeer);
        this.saveConnectedPeers();
        
        // Add to connection history
        this.addConnectionHistory(connectedPeer, 'connect', true);
        
        this.logger.log('✅ Successfully connected to:', peer.name);
        return { success: true, peer: connectedPeer };
      } else {
        this.addConnectionHistory(peer, 'connect', false);
        return { success: false, error: response?.error || 'Device pairing request rejected' };
      }
    } catch (error) {
      this.logger.error('Error in requestNewDeviceAccess:', error.message);
      this.addConnectionHistory(peer, 'connect', false);
      return { success: false, error: error.message };
    }
  }

  async testTokenAuthentication(peer, deviceToken) {
    return new Promise((resolve) => {
      const http = require('http');
      
      const postData = JSON.stringify({
        requesterId: this.localPeer.id,
        requesterName: this.localPeer.name,
        deviceToken: this.deviceToken // Send our device token for authentication
      });
      
      console.log(`🔐 Sending token auth request to ${peer.name} with our token: ${this.deviceToken.substring(0, 8)}...`);
      
      const options = {
        hostname: peer.sourceIP || peer.ipAddress,
        port: peer.pairingPort,
        path: '/auth-token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 3000
      };
      
      const req = http.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(responseData);
            console.log(`🔐 Token auth response from ${peer.name}: ${response.success ? 'SUCCESS' : 'FAILED'}`);
            resolve({
              success: response.success,
              deviceToken: response.deviceToken, // Store their token
              response: response
            });
          } catch (error) {
            console.log(`❌ Invalid token auth response from ${peer.name}: ${error.message}`);
            resolve({ success: false, error: 'Invalid response format' });
          }
        });
      });
      
      req.on('error', (error) => {
        console.log(`❌ Token auth connection error to ${peer.name}: ${error.message}`);
        resolve({ success: false, error: error.message });
      });
      
      req.on('timeout', () => {
        req.destroy();
        console.log(`❌ Token auth timeout to ${peer.name}`);
        resolve({ success: false, error: 'Connection timeout' });
      });
      
      req.write(postData);
      req.end();
    });
  }

  async updateConfig(updates) {
    try {
      console.log('📝 Updating P2P configuration:', updates);
      
      // Update local configuration
      if (updates.deviceName && this.localPeer) {
        this.localPeer.name = updates.deviceName;
        console.log(`📱 Device name updated to: ${updates.deviceName}`);
      }
      
      if (updates.enabled !== undefined) {
        if (updates.enabled && !this.isEnabled) {
          await this.start();
        } else if (!updates.enabled && this.isEnabled) {
          await this.stop();
        }
      }
      
      console.log('✅ P2P configuration updated successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to update P2P configuration:', error);
      return false;
    }
  }

  async scanNetworkForPairingCode(pairingCode) {
    console.log(`🔍 Scanning network for pairing code: ${pairingCode}`);
    
    // Get local network ranges
    const networkInterfaces = os.networkInterfaces();
    const networkRanges = [];
    
    Object.values(networkInterfaces).forEach(interfaces => {
      interfaces?.forEach(iface => {
        if (iface.family === 'IPv4' && !iface.internal && iface.netmask) {
          const ip = iface.address.split('.').map(Number);
          const netmask = iface.netmask.split('.').map(Number);
          
          // Calculate network address
          const network = ip.map((octet, i) => octet & netmask[i]);
          networkRanges.push({ network, netmask });
        }
      });
    });
    
    // Scan common ports for Clara instances
    const commonPorts = [47265, 47266, 47267, 47268, 47269]; // Multiple ports in case of multiple instances
    const promises = [];
    
    for (const range of networkRanges) {
      // Scan first 20 IPs in each network (for testing)
      for (let i = 1; i <= 20; i++) {
        const targetIP = [...range.network];
        targetIP[3] = i;
        const ip = targetIP.join('.');
        
        for (const port of commonPorts) {
          promises.push(this.testIPForPairingCode(ip, port, pairingCode));
        }
      }
    }
    
    try {
      const results = await Promise.allSettled(promises);
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          console.log(`✅ Found peer via network scan: ${result.value.peer.name}`);
          
          // Add to discovered peers
          this.discoveredPeers.set(result.value.peer.id, result.value.peer);
          
          return result.value;
        }
      }
      
      return { success: false, error: 'Network scan completed - no peer found' };
    } catch (error) {
      console.error('Network scan error:', error);
      return { success: false, error: 'Network scan failed' };
    }
  }

  async testIPForPairingCode(ip, port, pairingCode) {
    return new Promise((resolve) => {
      const http = require('http');
      const timeout = 2000; // 2 second timeout
      
      const data = JSON.stringify({
        type: 'pairing-request',
        pairingCode: pairingCode,
        requesterId: this.localPeer.id,
        requesterName: this.localPeer.name
      });
      
      const options = {
        hostname: ip,
        port: port,
        path: '/pair',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: timeout
      };
      
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.success) {
              resolve({
                success: true,
                peer: {
                  ...response.peer,
                  connectionState: 'connected',
                  sourceIP: ip,
                  sourcePort: port
                }
              });
            } else {
              resolve({ success: false });
            }
          } catch (error) {
            resolve({ success: false });
          }
        });
      });
      
      req.on('error', () => resolve({ success: false }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false });
      });
      
      req.write(data);
      req.end();
    });
  }

  loadConfiguration() {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Create directory if it doesn't exist
      const dir = path.dirname(this.configFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Load P2P configuration if file exists
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        const config = JSON.parse(data);
        
        // Apply saved configuration
        if (config.autoStartP2P === true) {
          this.autoStartOnBoot = true;
          console.log('🔧 P2P auto-start enabled from saved configuration');
        }
        
        if (config.autoConnectToPeers === true) {
          this.autoConnectEnabled = true;
          console.log('🔗 Auto-connect to peers enabled from saved configuration');
        }
        
        console.log('📋 Loaded P2P configuration');
        return config; // Return loaded config for device token access
      } else {
        // Default configuration
        this.autoStartOnBoot = false;
        this.autoConnectEnabled = true; // Enable by default
        return null;
      }
    } catch (error) {
      console.warn('Failed to load P2P configuration:', error.message);
      this.autoStartOnBoot = false;
      this.autoConnectEnabled = true;
      return null;
    }
  }

  saveConfiguration() {
    try {
      const fs = require('fs');
      
      const config = {
        autoStartP2P: this.autoStartOnBoot || false,
        autoConnectToPeers: this.autoConnectEnabled || true,
        deviceToken: this.deviceToken, // Save permanent device token
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
      console.log('💾 Saved P2P configuration with device token');
    } catch (error) {
      console.warn('Failed to save P2P configuration:', error.message);
    }
  }

  loadConnectedPeers() {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Create directory if it doesn't exist
      const dir = path.dirname(this.connectedPeersFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Load connected peers if file exists
      if (fs.existsSync(this.connectedPeersFile)) {
        const data = fs.readFileSync(this.connectedPeersFile, 'utf8');
        const peers = JSON.parse(data);
        
        // Add to discovered peers with auto-connect flag
        peers.forEach(peer => {
          peer.connectionState = 'disconnected'; // Reset state on startup
          peer.isAutoConnect = true;
          // Ensure capabilities exists with defaults
          peer.capabilities = peer.capabilities || ['agent-execution', 'file-sharing', 'real-time-chat'];
          // Ensure deviceInfo exists with defaults
          peer.deviceInfo = peer.deviceInfo || {
            platform: 'unknown',
            hostname: peer.name || 'Unknown Device',
            userAgent: 'Clara/1.0.0'
          };
          this.discoveredPeers.set(peer.id, peer);
        });
        
        console.log(`📚 Loaded ${peers.length} previously connected peers`);
        return peers; // Return the loaded peers array
      }
      
      return []; // Return empty array if no file
    } catch (error) {
      console.warn('Failed to load connected peers:', error.message);
      return []; // Return empty array on error
    }
  }

  saveConnectedPeers() {
    try {
      const fs = require('fs');
      
      // Get peers that should auto-reconnect (connected or previously connected)
      const connectedPeers = Array.from(this.discoveredPeers.values())
        .filter(peer => peer.isAutoConnect && (peer.connectionState === 'connected' || peer.deviceToken))
        .map(peer => ({
          id: peer.id,
          name: peer.name,
          deviceToken: peer.deviceToken, // Save the device token!
          lastConnected: peer.lastConnected || new Date(),
          lastDisconnected: peer.lastDisconnected,
          connectionState: peer.connectionState,
          isAutoConnect: true
        }));
      
      fs.writeFileSync(this.connectedPeersFile, JSON.stringify(connectedPeers, null, 2));
      console.log(`💾 Saved ${connectedPeers.length} connected peers with tokens`);
    } catch (error) {
      console.warn('Failed to save connected peers:', error.message);
    }
  }

  async disconnectFromPeer(peerId, unpair = false) {
    try {
      const peer = this.discoveredPeers.get(peerId) || this.connectedPeers.get(peerId);
      if (!peer) {
        return { success: false, error: 'Peer not found' };
      }

      // Update peer state to disconnected
      peer.connectionState = 'disconnected';
      peer.lastDisconnected = new Date();
      
      if (unpair) {
        // Remove device token for unpairing (user wants to remove device completely)
        this.removeStoredDeviceToken(peer.ip);
        peer.isAutoConnect = false;
        peer.deviceToken = null;
        this.addConnectionHistory(peer, 'unpair', true);
        console.log(`🔓 Unpaired device: ${peer.name}`);
      } else {
        // Just disconnect but keep pairing for auto-reconnect
        this.addConnectionHistory(peer, 'disconnect', true);
        console.log(`🔌 Disconnected from peer: ${peer.name}`);
      }
      
      // Update discovered peers
      this.discoveredPeers.set(peerId, peer);
      
      // Remove from connected peers
      this.connectedPeers.delete(peerId);

      // Save updated peer state
      this.saveConnectedPeers();

      // Notify frontend
      if (this.mainWindow) {
        this.mainWindow.webContents.send('p2p:peer-disconnected', peer);
      }

      // Re-evaluate discovery needs
      this.manageDiscovery();

      return { success: true };

    } catch (error) {
      console.error('Failed to disconnect from peer:', error);
      return { success: false, error: error.message };
    }
  }

  // Device Token Management
  generateDeviceToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  getStoredDeviceToken(peerIP) {
    try {
      const tokensPath = path.join(this.dataDirectory, 'device-tokens.json');
      if (fs.existsSync(tokensPath)) {
        const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
        return tokens[peerIP] || null;
      }
    } catch (error) {
      this.logger.error('Error reading device tokens:', error.message);
    }
    return null;
  }

  storeDeviceToken(peerIP, token) {
    try {
      const tokensPath = path.join(this.dataDirectory, 'device-tokens.json');
      let tokens = {};
      
      if (fs.existsSync(tokensPath)) {
        tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
      }
      
      tokens[peerIP] = token;
      fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
      this.logger.log('Device token stored for:', peerIP);
    } catch (error) {
      this.logger.error('Error storing device token:', error.message);
    }
  }

  removeStoredDeviceToken(peerIP) {
    try {
      const tokensPath = path.join(this.dataDirectory, 'device-tokens.json');
      if (fs.existsSync(tokensPath)) {
        const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
        delete tokens[peerIP];
        fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
        this.logger.log('Device token removed for:', peerIP);
      }
    } catch (error) {
      this.logger.error('Error removing device token:', error.message);
    }
  }

  // Connection History Management
  addConnectionHistory(peer, action, success = true) {
    try {
      const historyPath = path.join(this.dataDirectory, 'connection-history.json');
      let history = [];
      
      if (fs.existsSync(historyPath)) {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      }
      
      const entry = {
        timestamp: new Date().toISOString(),
        peerName: peer.name || peer.ip,
        peerIP: peer.ip,
        action: action, // 'connect', 'disconnect', 'reject', 'token-failed'
        success: success,
        platform: peer.deviceInfo?.platform || 'unknown'
      };
      
      history.unshift(entry); // Add to beginning
      
      // Keep only last 100 entries
      if (history.length > 100) {
        history = history.slice(0, 100);
      }
      
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
    } catch (error) {
      this.logger.error('Error adding connection history:', error.message);
    }
  }

  getConnectionHistory() {
    try {
      const historyPath = path.join(this.dataDirectory, 'connection-history.json');
      if (fs.existsSync(historyPath)) {
        return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      }
    } catch (error) {
      this.logger.error('Error reading connection history:', error.message);
    }
    return [];
  }

  // Prevent duplicate device discovery
  addDiscoveredPeer(peerData) {
    const existingPeer = this.discoveredPeers.get(peerData.id);
    
    if (existingPeer) {
      // Update existing peer info but keep connection state
      existingPeer.lastSeen = new Date();
      existingPeer.deviceInfo = peerData.deviceInfo;
      existingPeer.capabilities = peerData.capabilities;
      return existingPeer;
    } else {
      // New peer discovery
      const peer = {
        ...peerData,
        lastSeen: new Date(),
        connectionState: 'disconnected'
      };
      
      this.discoveredPeers.set(peerData.id, peer);
      this.addConnectionHistory(peer, 'discovered');
      
      // Emit to frontend
      if (this.mainWindow) {
        this.mainWindow.webContents.send('p2p:peer-discovered', peer);
      }
      
      return peer;
    }
  }

  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }
}

module.exports = { P2PDiscoveryService };
