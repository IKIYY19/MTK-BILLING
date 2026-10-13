/**
 * TR-069 ACS Service using GenieACS
 * Handles CPE device management and provisioning via CWMP protocol
 *
 * NOTE: TR-069 requires a separate GenieACS ACS process (with MongoDB + Redis).
 * Set TR069_ACS_URL to your GenieACS NBI URL (e.g. http://localhost:7557)
 * to enable real device management. Until configured, all methods return a
 * "not configured" response so the UI can display the correct status.
 */

const logger = require('../utils/logger');

const ACS_URL = process.env.TR069_ACS_URL || null;

function notConfigured() {
  return {
    success: false,
    configured: false,
    message: 'TR-069 ACS is not configured. Set TR069_ACS_URL in your .env to enable device management.',
  };
}

class TR069Service {
  constructor() {
    this.port = process.env.TR069_PORT || 7547;
    this.isRunning = false;
  }

  /** Check whether ACS is configured */
  supported() {
    return !!ACS_URL;
  }

  /**
   * Initialize and start the TR-069 ACS server
   */
  async start() {
    if (!ACS_URL) {
      logger.warn('TR-069 ACS not configured (TR069_ACS_URL not set). Device management will be unavailable.');
      return false;
    }
    logger.info('TR-069 ACS configured', { acsUrl: ACS_URL, port: this.port });
    this.isRunning = true;
    return true;
  }

  /**
   * Stop the TR-069 ACS server
   */
  async stop() {
    this.isRunning = false;
    logger.info('TR-069 ACS service stopped');
  }

  /**
   * Send Reboot RPC to a CPE device
   * @param {string} deviceId - Device serial number or ID
   */
  async rebootDevice(deviceId) {
    if (!ACS_URL) { return notConfigured(); }
    try {
      logger.info('Sending Reboot RPC to device via GenieACS NBI', { deviceId, acsUrl: ACS_URL });
      // GenieACS NBI: POST /devices/<id>/tasks  { name: "reboot" }
      const axios = require('axios');
      await axios.post(`${ACS_URL}/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`, { name: 'reboot' }, { timeout: 10000 });
      return { success: true, configured: true, message: 'Reboot command sent to GenieACS' };
    } catch (error) {
      logger.error('Failed to send Reboot RPC', { deviceId, error: error.message });
      return { success: false, configured: true, message: error.message };
    }
  }

  /**
   * Send FactoryReset RPC to a CPE device
   * @param {string} deviceId - Device serial number or ID
   */
  async factoryResetDevice(deviceId) {
    if (!ACS_URL) { return notConfigured(); }
    try {
      logger.info('Sending FactoryReset RPC to device via GenieACS NBI', { deviceId });
      const axios = require('axios');
      await axios.post(`${ACS_URL}/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`, { name: 'factoryReset' }, { timeout: 10000 });
      return { success: true, configured: true, message: 'Factory reset command sent to GenieACS' };
    } catch (error) {
      logger.error('Failed to send FactoryReset RPC', { deviceId, error: error.message });
      return { success: false, configured: true, message: error.message };
    }
  }

  /**
   * Get device parameters from CPE
   * @param {string} deviceId - Device serial number or ID
   * @param {Array} parameterNames - Array of parameter paths to retrieve
   */
  async getParameters(deviceId, parameterNames) {
    if (!ACS_URL) { return notConfigured(); }
    try {
      logger.info('Getting parameters from device via GenieACS NBI', { deviceId, parameterNames });
      const axios = require('axios');
      const task = { name: 'getParameterValues', parameterNames };
      const res = await axios.post(`${ACS_URL}/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`, task, { timeout: 10000 });
      return { success: true, configured: true, parameters: res.data || {} };
    } catch (error) {
      logger.error('Failed to get parameters', { deviceId, error: error.message });
      return { success: false, configured: true, message: error.message };
    }
  }

  /**
   * Set device parameters on CPE
   * @param {string} deviceId - Device serial number or ID
   * @param {Object} parameters - Object with parameter paths and values
   */
  async setParameters(deviceId, parameters) {
    if (!ACS_URL) { return notConfigured(); }
    try {
      logger.info('Setting parameters on device via GenieACS NBI', { deviceId });
      const axios = require('axios');
      const parameterValues = Object.entries(parameters).map(([name, value]) => [name, value, 'xsd:string']);
      const task = { name: 'setParameterValues', parameterValues };
      await axios.post(`${ACS_URL}/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`, task, { timeout: 10000 });
      return { success: true, configured: true, message: 'Parameters queued for update in GenieACS' };
    } catch (error) {
      logger.error('Failed to set parameters', { deviceId, error: error.message });
      return { success: false, configured: true, message: error.message };
    }
  }

  /**
   * Get device status and information
   * @param {string} deviceId - Device serial number or ID
   */
  async getDeviceStatus(deviceId) {
    if (!ACS_URL) { return notConfigured(); }
    try {
      logger.info('Getting device status from GenieACS NBI', { deviceId });
      const axios = require('axios');
      const res = await axios.get(`${ACS_URL}/devices?query=${encodeURIComponent(JSON.stringify({ _id: deviceId }))}`, { timeout: 10000 });
      const device = (res.data || [])[0];
      if (!device) {
        return { success: false, configured: true, message: 'Device not found in GenieACS' };
      }
      return {
        success: true,
        configured: true,
        status: {
          deviceId,
          online: !!device._lastInform,
          lastInform: device._lastInform || null,
          parameters: device,
        },
      };
    } catch (error) {
      logger.error('Failed to get device status', { deviceId, error: error.message });
      return { success: false, configured: true, message: error.message };
    }
  }
}

const tr069Service = new TR069Service();

module.exports = tr069Service;
