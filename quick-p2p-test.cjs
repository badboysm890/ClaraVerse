#!/usr/bin/env node

/**
 * Quick P2P Test Script
 * 
 * A lightweight test to verify P2P functionality quickly
 */

const crypto = require('crypto');
const dgram = require('dgram');
const http = require('http');

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function quickTest() {
  log('🚀 Quick P2P System Test', 'bold');
  
  try {
    // Test 1: Load the P2P service
    log('\n📦 Test 1: Loading P2P Service...', 'blue');
    const P2PService = require('./electron/p2pDiscoveryService.cjs');
    log('✅ P2P Service loaded successfully', 'green');
    
    // Test 2: Create instance (in test mode)
    log('\n🏗️  Test 2: Creating P2P Instance...', 'blue');
    const service = new P2PService.P2PDiscoveryService();
    log('✅ P2P Instance created successfully', 'green');
    
    // Test 3: Test device fingerprinting
    log('\n🔍 Test 3: Device Fingerprinting...', 'blue');
    const fingerprint = service.generateDeviceFingerprint();
    log(`✅ Device fingerprint: ${fingerprint.substring(0, 16)}...`, 'green');
    
    // Test 4: Test token generation
    log('\n🔐 Test 4: Token Generation...', 'blue');
    const token = service.generateDeviceToken();
    log(`✅ Device token generated: ${token.substring(0, 16)}...`, 'green');
    
    // Test 5: Test encryption
    log('\n🔒 Test 5: Encryption/Decryption...', 'blue');
    const testData = { secret: 'test-data', timestamp: Date.now() };
    const encrypted = service.encryptData(testData);
    if (encrypted) {
      const decrypted = service.decryptData(encrypted);
      if (JSON.stringify(testData) === JSON.stringify(decrypted)) {
        log('✅ Encryption/Decryption working correctly', 'green');
      } else {
        log('❌ Encryption/Decryption failed - data corruption', 'red');
      }
    } else {
      log('❌ Encryption failed', 'red');
    }
    
    // Test 6: Test token validation
    log('\n⏰ Test 6: Token Validation...', 'blue');
    const isValid = service.isTokenValid(token);
    log(`✅ Token validation: ${isValid ? 'VALID' : 'INVALID'}`, isValid ? 'green' : 'red');
    
    // Test 7: Check UDP port availability
    log('\n🌐 Test 7: Network Port Availability...', 'blue');
    await testPortAvailability();
    
    log('\n🎉 Quick test completed successfully!', 'bold');
    log('To run the full test suite: npm run test:p2p', 'cyan');
    
  } catch (error) {
    log(`❌ Test failed: ${error.message}`, 'red');
    console.error(error.stack);
  }
}

async function testPortAvailability() {
  const testPorts = [47264, 47265, 47266];
  
  for (const port of testPorts) {
    try {
      await new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');
        
        socket.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            log(`⚠️  Port ${port} is in use (this is normal if Clara is running)`, 'yellow');
          } else {
            log(`❌ Port ${port} error: ${err.message}`, 'red');
          }
          resolve();
        });
        
        socket.bind(port, () => {
          log(`✅ Port ${port} is available`, 'green');
          socket.close(resolve);
        });
      });
    } catch (error) {
      log(`❌ Port ${port} test failed: ${error.message}`, 'red');
    }
  }
}

// Run quick test
if (require.main === module) {
  quickTest().catch(error => {
    log(`❌ Quick test failed: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { quickTest };
