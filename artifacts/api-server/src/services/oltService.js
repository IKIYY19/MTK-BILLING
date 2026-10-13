/**
 * OLT (Optical Line Terminal) Service
 * Supports Huawei, ZTE, and FiberHome OLTs via SNMP and Telnet
 */

const { encrypt, decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');
const db = global.dbAvailable ? global.db : require('../db/memory');

// SNMP library (we'll use node-snmp-native or similar)
let snmp;
try {
  snmp = require('net-snmp');
} catch (e) {
  logger.warn('SNMP library not available. Install with: npm install net-snmp');
  snmp = null;
}

// Telnet/SSH library
let telnet;
try {
  telnet = require('telnet-client');
} catch (e) {
  logger.warn('Telnet library not available. Install with: npm install telnet-client');
  telnet = null;
}

// OLT SNMP OIDs by vendor
const OLT_OIDS = {
  huawei: {
    // MA5600T/MA5800 OIDs
    systemName: '1.3.6.1.2.1.1.5.0',
    systemDesc: '1.3.6.1.2.1.1.1.0',
    ponPorts: '1.3.6.1.4.1.2011.6.139.3.11.1.1.1', // hwGponPortTable
    onuList: '1.3.6.1.4.1.2011.6.139.3.11.1.2.1',  // hwGponOnuTable
    opticalPower: '1.3.6.1.4.1.2011.6.139.3.11.1.3.1', // hwGponOpticalPower
    onuState: '1.3.6.1.4.1.2011.6.139.3.11.1.2.1.5', // hwGponOnuRunState
    vendor: '1.3.6.1.4.1.2011.6.139.3.11.1.2.1.2', // hwGponOnuVendor
  },
  zte: {
    // C300/C320/C600 OIDs
    systemName: '1.3.6.1.2.1.1.5.0',
    systemDesc: '1.3.6.1.2.1.1.1.0',
    ponPorts: '1.3.6.1.4.1.3902.1081.10.1.1.1', // zteGponPortTable
    onuList: '1.3.6.1.4.1.3902.1081.10.2.1.1',  // zteGponOnuTable
    opticalPower: '1.3.6.1.4.1.3902.1081.10.3.1', // zteGponOpticalPower
    onuState: '1.3.6.1.4.1.3902.1081.10.2.1.1.5', // zteGponOnuState
    vendor: '1.3.6.1.4.1.3902.1081.10.2.1.1.2',
  },
  fiberhome: {
    // AN5516/AN5116 OIDs
    systemName: '1.3.6.1.2.1.1.5.0',
    systemDesc: '1.3.6.1.2.1.1.1.0',
    ponPorts: '1.3.6.1.4.1.5875.800.10.1.1.1',
    onuList: '1.3.6.1.4.1.5875.800.10.2.1.1',
    opticalPower: '1.3.6.1.4.1.5875.800.10.3.1',
    onuState: '1.3.6.1.4.1.5875.800.10.2.1.1.5',
    vendor: '1.3.6.1.4.1.5875.800.10.2.1.1.2',
  },
  nokia: {
    // ISAM 7302/7330 OIDs
    systemName: '1.3.6.1.2.1.1.5.0',
    systemDesc: '1.3.6.1.2.1.1.1.0',
    ponPorts: '1.3.6.1.4.1.637.61.1.21.1.1',
    onuList: '1.3.6.1.4.1.637.61.1.21.2.1',
    opticalPower: '1.3.6.1.4.1.637.61.1.21.3.1',
    onuState: '1.3.6.1.4.1.637.61.1.21.2.1.5',
    vendor: '1.3.6.1.4.1.637.61.1.21.2.1.2',
  },
  generic: {
    // Generic OLT - uses standard MIB-II + custom OIDs from database
    systemName: '1.3.6.1.2.1.1.5.0',
    systemDesc: '1.3.6.1.2.1.1.1.0',
    // Custom OIDs will be loaded from olt_connections.custom_oids field
    ponPorts: null,
    onuList: null,
    opticalPower: null,
    onuState: null,
    vendor: null,
  },
};

// OLT connection manager
class OLTService {
  /**
   * Get OIDs for connection (supports custom OIDs for Generic OLTs)
   */
  static getOIDs(conn) {
    const baseOIDs = OLT_OIDS[conn.vendor] || OLT_OIDS.generic;
    
    // If Generic OLT with custom OIDs, override from database
    if (conn.vendor === 'generic' && conn.custom_oids) {
      try {
        const customOIDs = typeof conn.custom_oids === 'string' 
          ? JSON.parse(conn.custom_oids) 
          : conn.custom_oids;
        
        return {
          ...baseOIDs,
          ...customOIDs, // Override with custom values
        };
      } catch (e) {
        logger.warn('Failed to parse custom OIDs', { id: conn.id });
      }
    }
    
    return baseOIDs;
  }

  /**
   * Save OLT connection to database
   */
  static async saveConnection(data) {
    const { v4: uuidv4 } = require('uuid');
    const id = data.id || uuidv4();
    
    const encryptedPassword = encrypt(data.password);
    const encryptedCommunity = encrypt(data.snmp_community || 'public');
    const customOIDs = data.custom_oids ? JSON.stringify(data.custom_oids) : null;

    const query = `
      INSERT INTO olt_connections (id, name, vendor, model, ip_address, telnet_port, snmp_port,
        username, password_encrypted, snmp_community_encrypted, location, status, custom_oids, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        name = $2, vendor = $3, model = $4, ip_address = $5, telnet_port = $6, snmp_port = $7,
        username = $8, password_encrypted = $9, snmp_community_encrypted = $10,
        location = $11, status = $12, custom_oids = $13, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await db.query(query, [
      id,
      data.name,
      data.vendor, // 'huawei', 'zte', 'fiberhome', 'nokia', 'generic'
      data.model || '',
      data.ip_address,
      data.telnet_port || 23,
      data.snmp_port || 161,
      data.username || 'admin',
      encryptedPassword,
      encryptedCommunity,
      data.location || '',
      data.status || 'active',
      customOIDs,
    ]);

    // Return without sensitive data
    const conn = result.rows[0];
    return this.sanitizeConnection(conn);
  }

  /**
   * Get all OLT connections
   */
  static async getAllConnections() {
    const result = await db.query('SELECT * FROM olt_connections ORDER BY created_at DESC');
    return result.rows.map(conn => this.sanitizeConnection(conn));
  }

  /**
   * Get single OLT connection
   */
  static async getConnection(id) {
    const result = await db.query('SELECT * FROM olt_connections WHERE id = $1', [id]);
    if (result.rows.length === 0) {return null;}
    return this.sanitizeConnection(result.rows[0]);
  }

  /**
   * Delete OLT connection
   */
  static async deleteConnection(id) {
    await db.query('DELETE FROM olt_connections WHERE id = $1', [id]);
    return { success: true };
  }

  /**
   * Test OLT connectivity
   */
  static async testConnection(id) {
    const conn = await this.getRawConnection(id);
    if (!conn) {return { success: false, error: 'Connection not found' };}

    try {
      // Test SNMP connectivity
      if (snmp) {
        const session = snmp.createSession(conn.ip_address, decrypt(conn.snmp_community_encrypted), {
          port: conn.snmp_port,
          timeout: 5000,
          retries: 1,
        });

        const oids = this.getOIDs(conn);
        const result = await new Promise((resolve, reject) => {
          session.get([oids.systemName, oids.systemDesc], (error, varbinds) => {
            if (error) {reject(error);}
            else {resolve(varbinds);}
          });
        });

        session.close();

        return {
          success: true,
          snmp: true,
          systemName: result[0]?.value || 'Unknown',
          description: result[1]?.value || 'Unknown',
        };
      }

      return { success: false, error: 'SNMP library not available' };
    } catch (error) {
      logger.error('OLT connection test failed', { error: error.message, id });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get ONU list from OLT
   */
  static async getONUs(id) {
    const conn = await this.getRawConnection(id);
    if (!conn) {throw new Error('OLT connection not found');}

    try {
      if (!snmp) {throw new Error('SNMP library not available');}

      const session = snmp.createSession(conn.ip_address, decrypt(conn.snmp_community_encrypted), {
        port: conn.snmp_port,
        timeout: 10000,
        retries: 2,
      });

      const oids = this.getOIDs(conn);
      
      // Walk ONU table
      const onus = await new Promise((resolve, reject) => {
        const onus = [];
        session.subtree(oids.onuList, (error, varbinds) => {
          if (error) {
            reject(error);
          } else {
            // Parse varbinds into ONU objects
            // This is simplified - real implementation would parse OIDs properly
            varbinds.forEach(vb => {
              onus.push({
                oid: vb.oid,
                value: vb.value,
              });
            });
            resolve(onus);
          }
        });
      });

      session.close();

      // Get optical power data
      const opticalPower = await this.getOpticalPower(session, conn, oids);

      return {
        success: true,
        onus,
        opticalPower,
        count: onus.length,
      };
    } catch (error) {
      logger.error('Failed to get ONUs from OLT', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Get optical power levels
   */
  static async getOpticalPower(session, conn, oids) {
    try {
      const result = await new Promise((resolve, reject) => {
        session.get([oids.opticalPower], (error, varbinds) => {
          if (error) {reject(error);}
          else {resolve(varbinds);}
        });
      });

      return result.map(vb => ({
        oid: vb.oid,
        value: vb.value,
        unit: 'dBm',
      }));
    } catch (error) {
      logger.warn('Failed to get optical power', { error: error.message });
      return [];
    }
  }

  /**
   * Get PON port status
   */
  static async getPONPorts(id) {
    const conn = await this.getRawConnection(id);
    if (!conn) {throw new Error('OLT connection not found');}

    try {
      if (!snmp) {throw new Error('SNMP library not available');}

      const session = snmp.createSession(conn.ip_address, decrypt(conn.snmp_community_encrypted), {
        port: conn.snmp_port,
        timeout: 10000,
        retries: 2,
      });

      const oids = this.getOIDs(conn);

      const ports = await new Promise((resolve, reject) => {
        const ports = [];
        session.subtree(oids.ponPorts, (error, varbinds) => {
          if (error) {reject(error);}
          else {
            varbinds.forEach(vb => {
              ports.push({ oid: vb.oid, value: vb.value });
            });
            resolve(ports);
          }
        });
      });

      session.close();
      return { success: true, ports, count: ports.length };
    } catch (error) {
      logger.error('Failed to get PON ports', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Get OLT system info
   */
  static async getSystemInfo(id) {
    const conn = await this.getRawConnection(id);
    if (!conn) {throw new Error('OLT connection not found');}

    try {
      if (!snmp) {throw new Error('SNMP library not available');}

      const session = snmp.createSession(conn.ip_address, decrypt(conn.snmp_community_encrypted), {
        port: conn.snmp_port,
        timeout: 5000,
        retries: 1,
      });

      const oids = this.getOIDs(conn);

      const result = await new Promise((resolve, reject) => {
        session.get([oids.systemName, oids.systemDesc], (error, varbinds) => {
          if (error) {reject(error);}
          else {resolve(varbinds);}
        });
      });

      session.close();

      return {
        success: true,
        systemName: result[0]?.value || 'Unknown',
        description: result[1]?.value || 'Unknown',
        vendor: conn.vendor,
        model: conn.model,
        ipAddress: conn.ip_address,
      };
    } catch (error) {
      logger.error('Failed to get OLT system info', { error: error.message, id });
      throw error;
    }
  }

  /**
   * Execute Telnet command on OLT
   */
  static async executeCommand(id, command) {
    const conn = await this.getRawConnection(id);
    if (!conn) {throw new Error('OLT connection not found');}

    // Command sanitization - prevent injection attacks
    const dangerousPatterns = [
      /;\s*rm\s+/i,        // rm commands
      /;\s*del\s+/i,       // del commands
      /;\s*format\s+/i,    // format commands
      /;\s*reboot/i,       // reboot commands
      /;\s*shutdown/i,     // shutdown commands
      /&&\s*rm\s+/i,       // rm with &&
      /\|\s*rm\s+/i,       // rm with pipe
      />\s*\//i,           // redirect to root
      /`/i,                // backticks
      /\$\(/i,             // command substitution
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error('Command contains dangerous patterns and was blocked');
      }
    }

    // Allow only safe display/info commands by default
    const allowedPrefixes = [
      'display',
      'show',
      'get',
      'list',
      'stat',
      'status',
      'version',
      'help',
    ];

    const commandLower = command.trim().toLowerCase();
    const isAllowed = allowedPrefixes.some(prefix => commandLower.startsWith(prefix));

    if (!isAllowed) {
      logger.warn('Blocked potentially dangerous command', { id, command });
      throw new Error('Only display/show commands are allowed for safety');
    }

    try {
      if (!telnet) {throw new Error('Telnet library not available');}

      const connection = new telnet();

      const result = await connection.connect({
        host: conn.ip_address,
        port: conn.telnet_port || 23,
        username: conn.username,
        password: decrypt(conn.password_encrypted),
        shellPrompt: /#/,
        loginPrompt: /login:/,
        passwordPrompt: /password:/,
        timeout: 10000,
      });

      const output = await connection.exec(command);
      await connection.end();

      logger.info('OLT command executed successfully', { id, command });
      return { success: true, output };
    } catch (error) {
      logger.error('OLT command failed', { error: error.message, id, command });
      throw error;
    }
  }

  /**
   * Get OLT statistics
   */
  static async getStatistics(id) {
    const conn = await this.getRawConnection(id);
    if (!conn) {throw new Error('OLT connection not found');}

    try {
      const onus = await this.getONUs(id);
      const ports = await this.getPONPorts(id);
      const info = await this.getSystemInfo(id);

      return {
        success: true,
        systemInfo: info,
        onuCount: onus.count,
        portCount: ports.count,
        activeONUs: onus.onus?.filter(o => o.value === 'active').length || 0,
      };
    } catch (error) {
      logger.error('Failed to get OLT statistics', { error: error.message, id });
      throw error;
    }
  }

  // Internal helpers

  static async getRawConnection(id) {
    const result = await db.query('SELECT * FROM olt_connections WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  static sanitizeConnection(conn) {
    if (!conn) {return null;}
    const { password_encrypted, snmp_community_encrypted, ...safe } = conn;
    return safe;
  }
}

module.exports = OLTService;
