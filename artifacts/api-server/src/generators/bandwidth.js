/**
 * Bandwidth Management Module Generator
 * Generates MikroTik RouterOS commands for queues and traffic shaping
 */

// Predefined speed profiles (in bps)
const SPEED_PROFILES = {
  '1M': { limitAt: '1M/1M', maxLimit: '1M/1M', burstLimit: '1M/1M' },
  '2M': { limitAt: '2M/2M', maxLimit: '2M/2M', burstLimit: '2M/2M' },
  '5M': { limitAt: '5M/5M', maxLimit: '5M/5M', burstLimit: '5M/5M' },
  '10M': { limitAt: '10M/10M', maxLimit: '10M/10M', burstLimit: '10M/10M' },
  '20M': { limitAt: '20M/20M', maxLimit: '20M/20M', burstLimit: '20M/20M' },
  '50M': { limitAt: '50M/50M', maxLimit: '50M/50M', burstLimit: '50M/50M' },
  '100M': { limitAt: '100M/100M', maxLimit: '100M/100M', burstLimit: '100M/100M' },
};

class BandwidthGenerator {
  constructor(config, version = 'v7') {
    this.config = config;
    this.version = version;
    this.lines = [];
  }

  generate() {
    this.lines = [];
    this.lines.push('#############################################');
    this.lines.push('# Bandwidth Management Configuration');
    this.lines.push(`# Generated for RouterOS ${this.version}`);
    this.lines.push('#############################################');
    this.lines.push('');

    if (this.config.simple_queues) {
      this.generateSimpleQueues();
    }

    if (this.config.queue_trees) {
      this.generateQueueTrees();
    }

    if (this.config.pcq) {
      this.generatePCQ();
    }

    return this.lines.join('\n');
  }

  generateSimpleQueues() {
    this.lines.push('# Simple Queues');
    for (const queue of this.config.simple_queues) {
      const name = queue.name ? ` name="${queue.name}"` : '';
      const target = queue.target ? ` target=${queue.target}` : '';
      const maxLimit = queue['max-limit'] ? ` max-limit=${queue['max-limit']}` : '';
      const limitAt = queue['limit-at'] ? ` limit-at=${queue['limit-at']}` : '';
      const priority = queue.priority !== undefined ? ` priority=${queue.priority}` : '';
      const packetMarks = queue['packet-marks'] ? ` packet-marks=${queue['packet-marks']}` : '';
      const parent = queue.parent ? ` parent=${queue.parent}` : '';
      const burstLimit = queue['burst-limit'] ? ` burst-limit=${queue['burst-limit']}` : '';
      const burstThreshold = queue['burst-threshold'] ? ` burst-threshold=${queue['burst-threshold']}` : '';
      const burstTime = queue['burst-time'] ? ` burst-time=${queue['burst-time']}` : '';
      const comment = queue.comment ? ` comment="${queue.comment}"` : '';

      this.lines.push(`/queue simple add${name}${target}${maxLimit}${limitAt}${priority}${packetMarks}${parent}${burstLimit}${burstThreshold}${burstTime}${comment}`);
    }
    this.lines.push('');
  }

  generateQueueTrees() {
    this.lines.push('# Queue Trees');
    for (const queue of this.config.queue_trees) {
      const name = queue.name ? ` name="${queue.name}"` : '';
      const parent = queue.parent ? ` parent=${queue.parent}` : '';
      const packetMark = queue['packet-mark'] ? ` packet-mark=${queue['packet-mark']}` : '';
      const maxLimit = queue['max-limit'] ? ` max-limit=${queue['max-limit']}` : '';
      const limitAt = queue['limit-at'] ? ` limit-at=${queue['limit-at']}` : '';
      const priority = queue.priority !== undefined ? ` priority=${queue.priority}` : '';
      const queueType = queue.queue ? ` queue=${queue.queue}` : '';
      const burstLimit = queue['burst-limit'] ? ` burst-limit=${queue['burst-limit']}` : '';
      const burstThreshold = queue['burst-threshold'] ? ` burst-threshold=${queue['burst-threshold']}` : '';
      const burstTime = queue['burst-time'] ? ` burst-time=${queue['burst-time']}` : '';
      const comment = queue.comment ? ` comment="${queue.comment}"` : '';

      this.lines.push(`/queue tree add${name}${parent}${packetMark}${maxLimit}${limitAt}${priority}${queueType}${burstLimit}${burstThreshold}${burstTime}${comment}`);
    }
    this.lines.push('');
  }

  generatePCQ() {
    this.lines.push('# PCQ Configuration');
    const pcq = this.config.pcq;

    // PCQ types
    const pcqTypes = pcq.types || ['download', 'upload'];
    
    for (const type of pcqTypes) {
      const rate = pcq.rate || '1M';
      const limitAt = pcq['limit-at'] || '256k';
      const burstLimit = pcq['burst-limit'] || '0';
      const burstThreshold = pcq['burst-threshold'] || '0';
      const burstTime = pcq['burst-time'] || '0';
      const priority = pcq.priority || 8;
      const kind = 'pcq';
      const pcqRate = pcq['pcq-rate'] || rate;
      const pcqLimitAt = pcq['pcq-limit-at'] || '32k';
      const pcqBurstLimit = pcq['pcq-burst-limit'] || '0';
      const pcqBurstThreshold = pcq['pcq-burst-threshold'] || '0';
      const pcqBurstTime = pcq['pcq-burst-time'] || '0';
      const pcqClassifier = pcq['pcq-classifier'] || (type === 'download' ? 'dst-address' : 'src-address');
      const pcqTotalLimit = pcq['pcq-total-limit'] || '2048k';

      this.lines.push(`/queue type add name=${type}-pcq kind=${kind} pcq-rate=${pcqRate} pcq-limit-at=${pcqLimitAt} pcq-burst-limit=${pcqBurstLimit} pcq-burst-threshold=${pcqBurstThreshold} pcq-burst-time=${pcqBurstTime} pcq-classifier=${pcqClassifier} pcq-total-limit=${pcqTotalLimit}`);
    }

    this.lines.push('');
  }

  static getSpeedProfile(speed) {
    return SPEED_PROFILES[speed] || SPEED_PROFILES['1M'];
  }

  static getAvailableProfiles() {
    return Object.keys(SPEED_PROFILES);
  }
}

module.exports = BandwidthGenerator;
