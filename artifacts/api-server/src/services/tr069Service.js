/**
 * TR-069 ACS service backed by GenieACS.
 *
 * TR069_ACS_URL = the URL CPEs use to reach the CWMP server (http://host:7547)
 * TR069_NBI_URL = GenieACS Northbound API used by this app (http://host:7557)
 *
 * Until an NBI URL is configured every method returns configured:false so the
 * UI can show an honest "not configured" state instead of a false success.
 */

const axios = require('axios');
const logger = require('../utils/logger');

// Never advertise the NBI port as a CWMP endpoint for CPEs.
const ACS_URL = process.env.TR069_ACS_URL || null;
const NBI_URL = process.env.TR069_NBI_URL || null;

function notConfigured() {
  return {
    success: false,
    configured: false,
    message: 'TR-069 ACS is not configured. Set TR069_NBI_URL (and TR069_ACS_URL for CPEs) in your .env.',
  };
}

function failure(error, action) {
  logger.error(`GenieACS ${action} failed`, { error: error.message });
  return { success: false, configured: true, message: error.message };
}

function flattenParameters(node, prefix = '', target = {}) {
  for (const [key, value] of Object.entries(node || {})) {
    if (key.startsWith('_') && key !== '_value') {continue;}
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('_value' in value) {target[path] = value._value;}
      else {flattenParameters(value, path, target);}
    } else if (typeof value !== 'object') {
      target[path] = value;
    }
  }
  return target;
}

class TR069Service {
  constructor() {
    this.port = process.env.TR069_PORT || 7547;
    this.isRunning = false;
    this.reachable = false;
  }

  supported() { return !!NBI_URL; }

  get acsUrl() { return ACS_URL; }
  get nbiUrl() { return NBI_URL; }

  async request(method, path, data) {
    const base = String(NBI_URL).replace(/\/$/, '');
    const response = await axios({
      method,
      url: `${base}${path}`,
      data,
      timeout: 20000,
    });
    return response.data;
  }

  async start() {
    if (!NBI_URL) {
      logger.warn('TR-069 ACS not configured (TR069_NBI_URL not set). Device management unavailable.');
      return false;
    }
    const status = await this.status();
    this.isRunning = status.configured && status.reachable;
    this.reachable = this.isRunning;
    if (this.isRunning) {
      logger.info('TR-069 GenieACS NBI reachable', { acsUrl: ACS_URL, nbiUrl: NBI_URL });
    } else {
      logger.warn('TR-069 GenieACS NBI configured but unreachable', { nbiUrl: NBI_URL, error: status.message });
    }
    return this.isRunning;
  }

  async stop() {
    this.isRunning = false;
    this.reachable = false;
  }

  async status() {
    if (!NBI_URL) {return { ...notConfigured(), reachable: false }; }
    try {
      const devices = await this.request('get', '/devices?limit=1');
      return {
        success: true,
        configured: true,
        reachable: true,
        acsUrl: ACS_URL,
        nbiUrl: NBI_URL,
        deviceCount: Array.isArray(devices) ? devices.length : 0,
      };
    } catch (error) {
      return { ...failure(error, 'status'), reachable: false, acsUrl: ACS_URL, nbiUrl: NBI_URL };
    }
  }

  parseDevice(device) {
    const identity = device._deviceId || {};
    // Some CPEs report the TR-069 1.0 root instead of Device.*.
    const parameters = {
      ...flattenParameters(device.InternetGatewayDevice || {}, "InternetGatewayDevice"),
      ...flattenParameters(device.Device || {}, "Device"),
    };
    return {
      serial: String(
        parameters['Device.SerialNumber'] ||
        parameters['InternetGatewayDevice.DeviceInfo.SerialNumber'] ||
        identity._SerialNumber || device._id || '',
      ),
      manufacturer: String(identity._Manufacturer || '').slice(0, 100),
      model: String(identity._ProductClass || '').slice(0, 100),
      firmware: String(
        parameters['Device.SoftwareVersion'] ||
        parameters['InternetGatewayDevice.DeviceInfo.SoftwareVersion'] || ''
      ).slice(0, 50),
      parameters,
    };
  }

  async listDevices(limit = 500) {
    if (!NBI_URL) {return notConfigured();}
    try {
      const devices = await this.request('get', `/devices?limit=${Number(limit) || 500}`);
      return { success: true, configured: true, devices: Array.isArray(devices) ? devices : [] };
    } catch (error) { return failure(error, 'list devices'); }
  }

  async getDevice(deviceId) {
    if (!NBI_URL) {return notConfigured();}
    try {
      const device = await this.request('get', `/devices/${encodeURIComponent(deviceId)}`);
      return { success: true, configured: true, device };
    } catch (error) { return failure(error, 'get device'); }
  }

  async queryDevice(deviceId) {
    const query = encodeURIComponent(JSON.stringify({ _id: String(deviceId) }));
    const devices = await this.request('get', `/devices?query=${query}&limit=1`);
    return Array.isArray(devices) ? devices[0] : null;
  }

  async findDeviceBySerial(serial) {
    if (!NBI_URL || !serial) {return null;}
    try {
      const query = encodeURIComponent(JSON.stringify({ "_deviceId._SerialNumber": String(serial) }));
      const devices = await this.request('get', `/devices?query=${query}&limit=1`);
      return Array.isArray(devices) ? devices[0] : null;
    } catch (error) {
      logger.warn('GenieACS serial lookup failed', { error: error.message });
      return null;
    }
  }

  async getParameters(deviceId) {
    if (!NBI_URL) {return notConfigured();}
    try {
      const device = await this.queryDevice(deviceId);
      if (!device) {return { success: false, configured: true, message: 'Device not found in GenieACS' };}
      const values = {
        ...flattenParameters(device.InternetGatewayDevice || {}, "InternetGatewayDevice"),
        ...flattenParameters(device.Device || {}, "Device"),
      };
      const parameters = Object.entries(values).map(([name, value]) => ({ name, value }));
      return { success: true, configured: true, parameters };
    } catch (error) { return failure(error, 'get parameters'); }
  }

  async queueTask(deviceId, task) {
    if (!NBI_URL) {return notConfigured();}
    try {
      await this.request('post', `/devices/${encodeURIComponent(deviceId)}/tasks`, task);
      return { success: true, configured: true, message: `${task.name} task queued in GenieACS` };
    } catch (error) { return failure(error, task.name); }
  }

  async rebootDevice(deviceId) { return this.queueTask(deviceId, { name: 'reboot' }); }

  async factoryResetDevice(deviceId) { return this.queueTask(deviceId, { name: 'factoryReset' }); }

  async setParameters(deviceId, parameters) {
    const parameterValues = Object.entries(parameters || {}).map(([name, value]) => {
      if (Array.isArray(value) && value.length === 3) {return value;}
      return [name, value, 'xsd:string'];
    });
    if (!parameterValues.length) {
      return { success: false, configured: this.supported(), message: 'No parameters supplied' };
    }
    return this.queueTask(deviceId, { name: 'setParameterValues', parameterValues });
  }

  async downloadFirmware(deviceId, fileUrl) {
    const url = String(fileUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      return { success: false, configured: this.supported(), message: 'Firmware URL must be http(s)' };
    }
    return this.queueTask(deviceId, { name: 'download', file: url });
  }

  async getDeviceStatus(deviceId) {
    if (!NBI_URL) {return notConfigured();}
    try {
      const device = await this.queryDevice(deviceId);
      if (!device) {return { success: false, configured: true, message: 'Device not found in GenieACS' };}
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
    } catch (error) { return failure(error, 'device status'); }
  }
}

module.exports = new TR069Service();
