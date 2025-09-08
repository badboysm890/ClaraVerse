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
    
    // Setup IPC handlers
    this.setupIPCHandlers();
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

    ipcMain.handle('p2p:connect-to-peer', async (event, pairingCode) => {
      return await this.connectToPeer(pairingCode);
    });

    ipcMain.handle('p2p:generate-pairing-code', () => {
      return this.generatePairingCode();
    });

    ipcMain.handle('p2p:update-config', async (event, updates) => {
      return await this.updateConfig(updates);
    });
  }

  async start() {
    try {
      console.log('🌐 Starting real P2P Discovery Service...');
      
      this.isEnabled = true;
      this.initializeLocalPeer();
      
      // Start UDP discovery server
      await this.startUDPDiscovery();
      
      // Start HTTP pairing server
      await this.startHTTPServer();
      
      // Start periodic discovery broadcasts
      this.startPeriodicDiscovery();
      
      console.log('✅ P2P Discovery Service started successfully');
      console.log(`📡 Broadcasting on UDP port ${this.discoveryPort}`);
      console.log(`🔗 Pairing server on HTTP port ${this.localPeer.pairingPort}`);
      
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
      if (this.discoveryInterval) {
        clearInterval(this.discoveryInterval);
        this.discoveryInterval = null;
      }
      
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

  generatePairingCode() {
    const words = ['BRAIN', 'NOVA', 'STAR', 'CORE', 'DATA', 'SYNC', 'FLOW', 'LINK'];
    const word = words[Math.floor(Math.random() * words.length)];
    const number = Math.floor(1000 + Math.random() * 9000);
    return `${word}-${number}`;
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
      
      this.udpSocket.bind(this.discoveryPort, () => {
        this.udpSocket.setBroadcast(true);
        console.log(`📡 UDP Discovery server listening on port ${this.discoveryPort}`);
        resolve();
      });
    });
  }

  async startHTTPServer() {
    const http = require('http');
    
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        this.handleHTTPRequest(req, res);
      });
      
      this.httpServer.on('error', (err) => {
        console.error('HTTP Pairing Server Error:', err);
        reject(err);
      });
      
      this.httpServer.listen(this.localPeer.pairingPort, () => {
        console.log(`🔗 HTTP Pairing server listening on port ${this.localPeer.pairingPort}`);
        resolve();
      });
    });
  }

  startPeriodicDiscovery() {
    // Broadcast our presence every 5 seconds
    this.discoveryInterval = setInterval(() => {
      this.broadcastDiscovery();
    }, 5000);
    
    // Send initial broadcast
    this.broadcastDiscovery();
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
    
    console.log(`📡 Discovery broadcast sent to ${broadcastAddresses.length} networks`);
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
          isLocal: false,
          connectionState: existingPeer?.connectionState || 'disconnected',
          lastSeen: new Date(),
          sourceIP: rinfo.address,
          sourcePort: rinfo.port
        };
        
        this.discoveredPeers.set(peer.id, updatedPeer);
        
        console.log(`🔍 Discovered Clara peer: ${peer.name} (${rinfo.address})`);
        
        // Notify renderer of new peer
        if (this.mainWindow) {
          this.mainWindow.webContents.send('p2p:peer-discovered', updatedPeer);
        }
      }
    } catch (error) {
      console.warn('Invalid discovery message:', error.message);
    }
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
        timestamp: Date.now()
      }));
      return;
    }
    
    if (req.url === '/pair' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        this.handlePairingRequest(body, res);
      });
      return;
    }
    
    // 404 for other requests
    res.writeHead(404);
    res.end('Not Found');
  }

  handlePairingRequest(body, res) {
    try {
      const data = JSON.parse(body);
      const currentCode = this.generatePairingCode(); // In a real implementation, this would be stored/managed
      
      if (data.pairingCode === currentCode) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          peer: this.localPeer,
          message: 'Pairing successful'
        }));
        
        console.log(`✅ Successful pairing with: ${data.requesterId}`);
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Invalid pairing code'
        }));
        
        console.log(`❌ Invalid pairing attempt: ${data.pairingCode}`);
      }
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Invalid request'
      }));
      
      console.log(`❌ Invalid pairing request: ${error.message}`);
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
            
            // Update peer status
            peer.connectionState = 'connected';
            this.discoveredPeers.set(peer.id, peer);
            
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
        requesterId: this.localPeer.id
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
        requesterId: this.localPeer.id
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

  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }
}

module.exports = { P2PDiscoveryService };
