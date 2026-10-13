/**
 * System & Monitoring Module Generator
 * Generates MikroTik RouterOS commands for system settings, monitoring, and maintenance
 */

class SystemGenerator {
  constructor(config, version = 'v7') {
    this.config = config;
    this.version = version;
    this.lines = [];
  }

  generate() {
    this.lines = [];
    this.lines.push('#############################################');
    this.lines.push('# System & Monitoring Configuration');
    this.lines.push(`# Generated for RouterOS ${this.version}`);
    this.lines.push('#############################################');
    this.lines.push('');

    if (this.config.system) {
      this.generateSystem();
    }

    if (this.config.ntp) {
      this.generateNTP();
    }

    if (this.config.snmp) {
      this.generateSNMP();
    }

    if (this.config.logging) {
      this.generateLogging();
    }

    if (this.config.backup_scheduler) {
      this.generateBackupScheduler();
    }

    if (this.config.services) {
      this.generateServices();
    }

    if (this.config.users) {
      this.generateUsers();
    }

    return this.lines.join('\n');
  }

  generateSystem() {
    this.lines.push('# System Settings');
    const sys = this.config.system;

    if (sys.identity) {
      this.lines.push(`/system identity set name="${sys.identity}"`);
    }

    if (sys.timezone) {
      this.lines.push(`/system clock set time-zone-name=${sys.timezone}`);
    }

    if (sys.location) {
      this.lines.push(`/system identity set location="${sys.location}"`);
    }

    if (sys.contact) {
      this.lines.push(`/system identity set contact="${sys.contact}"`);
    }
    this.lines.push('');
  }

  generateNTP() {
    this.lines.push('# NTP Configuration');
    const ntp = this.config.ntp;

    if (ntp.enabled !== undefined) {
      this.lines.push(`/system ntp client set enabled=${ntp.enabled}`);
    }

    if (ntp.servers && ntp.servers.length > 0) {
      this.lines.push(`/system ntp client set server-dns-names=${ntp.servers.join(',')}`);
    }

    if (ntp['primary-ntp']) {
      this.lines.push(`/system ntp client set primary-ntp=${ntp['primary-ntp']}`);
    }

    if (ntp['secondary-ntp']) {
      this.lines.push(`/system ntp client set secondary-ntp=${ntp['secondary-ntp']}`);
    }

    // NTP Server mode
    if (ntp.server_mode) {
      this.lines.push('/system ntp server set enabled=yes');
      if (ntp.server_broadcast) {
        this.lines.push('/system ntp server set broadcast=yes');
      }
      if (ntp.manycast) {
        this.lines.push('/system ntp server set manycast=yes');
      }
    }
    this.lines.push('');
  }

  generateSNMP() {
    this.lines.push('# SNMP Configuration');
    const snmp = this.config.snmp;

    if (snmp.enabled !== undefined) {
      this.lines.push(`/snmp set enabled=${snmp.enabled}`);
    }

    if (snmp.contact) {
      this.lines.push(`/snmp set contact="${snmp.contact}"`);
    }

    if (snmp.location) {
      this.lines.push(`/snmp set location="${snmp.location}"`);
    }

    if (snmp.community) {
      this.lines.push(`/snmp community set [find] name=${snmp.community}`);
    }

    if (snmp.communities) {
      for (const community of snmp.communities) {
        const name = community.name ? ` name=${community.name}` : '';
        const addresses = community.addresses ? ` addresses=${community.addresses.join(',')}` : '';
        const security = community.security ? ` security=${community.security}` : '';
        const readAccess = community['read-access'] !== undefined ? ` read-access=${community['read-access']}` : '';
        const comment = community.comment ? ` comment="${community.comment}"` : '';

        this.lines.push(`/snmp community add${name}${addresses}${security}${readAccess}${comment}`);
      }
    }

    if (snmp.trap_targets) {
      for (const target of snmp.trap_targets) {
        const address = target.address ? ` address=${target.address}` : '';
        const community = target.community ? ` community=${target.community}` : '';
        const version = target.version ? ` version=${target.version}` : '';
        const comment = target.comment ? ` comment="${target.comment}"` : '';

        this.lines.push(`/snmp trap-target add${address}${community}${version}${comment}`);
      }
    }
    this.lines.push('');
  }

  generateLogging() {
    this.lines.push('# Logging Configuration');
    const logging = this.config.logging;

    // Actions
    if (logging.actions) {
      for (const action of logging.actions) {
        const name = action.name ? ` name=${action.name}` : '';
        const targetType = action.target ? ` target=${action.target}` : '';
        const remoteAddress = action['remote-address'] ? ` remote-address=${action['remote-address']}` : '';
        const remotePort = action['remote-port'] ? ` remote-port=${action['remote-port']}` : '';
        const syslogFacility = action['syslog-facility'] ? ` syslog-facility=${action['syslog-facility']}` : '';
        const comment = action.comment ? ` comment="${action.comment}"` : '';

        this.lines.push(`/system logging action add${name}${targetType}${remoteAddress}${remotePort}${syslogFacility}${comment}`);
      }
    }

    // Rules
    if (logging.rules) {
      for (const rule of logging.rules) {
        const topics = rule.topics ? ` topics=${rule.topics}` : '';
        const action = rule.action ? ` action=${rule.action}` : '';
        const comment = rule.comment ? ` comment="${rule.comment}"` : '';

        this.lines.push(`/system logging add${topics}${action}${comment}`);
      }
    }
    this.lines.push('');
  }

  generateBackupScheduler() {
    this.lines.push('# Backup & Export Scheduler');
    const backup = this.config.backup_scheduler;

    // Backup script
    if (backup.script) {
      this.lines.push('/system script add name=backup-script source="');
      this.lines.push(':local backupName (\"backup_\" . [/system identity get name] . \"_\" . [:pick [:tostr [/system clock get date]] 0 10]);');
      this.lines.push('/system backup save name=$backupName;');
      this.lines.push(':log info (\"Backup created: \" . $backupName);"');
    }

    // Export script
    if (backup.export_script) {
      this.lines.push('/system script add name=export-script source="');
      this.lines.push(':local exportName (\"export_\" . [/system identity get name] . \"_\" . [:pick [:tostr [/system clock get date]] 0 10]);');
      this.lines.push('/export file=$exportName;');
      this.lines.push(':log info (\"Export created: \" . $exportName);"');
    }

    // Scheduler
    if (backup.schedule) {
      const schedule = backup.schedule;
      const name = schedule.name ? ` name=${schedule.name}` : '';
      const onEvent = schedule['on-event'] ? ` on-event="${schedule['on-event']}"` : '';
      const startDate = schedule['start-date'] ? ` start-date=${schedule['start-date']}` : '';
      const startTime = schedule['start-time'] ? ` start-time=${schedule['start-time']}` : '';
      const interval = schedule.interval ? ` interval=${schedule.interval}` : '';
      const comment = schedule.comment ? ` comment="${schedule.comment}"` : '';

      this.lines.push(`/system scheduler add${name}${onEvent}${startDate}${startTime}${interval}${comment}`);
    }
    this.lines.push('');
  }

  generateServices() {
    this.lines.push('# Service Management');
    const services = this.config.services;

    // Disable insecure services
    if (services.disable_insecure) {
      this.lines.push('# Disabling Insecure Services');
      if (services.telnet === false || services.disable_insecure.includes('telnet')) {
        this.lines.push('/ip service set telnet disabled=yes');
      }
      if (services.ftp === false || services.disable_insecure.includes('ftp')) {
        this.lines.push('/ip service set ftp disabled=yes');
      }
      if (services.www === false || services.disable_insecure.includes('www')) {
        this.lines.push('/ip service set www disabled=yes');
      }
    }

    // Enable secure services
    if (services.enable_secure) {
      this.lines.push('# Enabling Secure Services');
      if (services.ssh !== false && services.enable_secure.includes('ssh')) {
        const port = services.ssh_port ? ` port=${services.ssh_port}` : '';
        this.lines.push(`/ip service set ssh disabled=no${port}`);
      }
      if (services.winbox !== false && services.enable_secure.includes('winbox')) {
        const port = services.winbox_port ? ` port=${services.winbox_port}` : '';
        this.lines.push(`/ip service set winbox disabled=no${port}`);
      }
      if (services.api !== false && services.enable_secure.includes('api')) {
        const port = services.api_port ? ` port=${services.api_port}` : '';
        this.lines.push(`/ip service set api disabled=no${port}`);
      }
      if (services['api-ssl'] !== false && services.enable_secure.includes('api-ssl')) {
        const port = services['api-ssl_port'] ? ` port=${services['api-ssl_port']}` : '';
        this.lines.push(`/ip service set api-ssl disabled=no${port}`);
      }
    }

    // Allowed addresses
    if (services.allowed_addresses) {
      this.lines.push(`/ip service set address=${services.allowed_addresses.join(',')}`);
    }
    this.lines.push('');
  }

  generateUsers() {
    this.lines.push('# User Management');
    for (const user of this.config.users) {
      const name = user.name ? ` name=${user.name}` : '';
      const password = user.password ? ` password=${user.password}` : '';
      const comment = user.comment ? ` comment="${user.comment}"` : '';
      const group = user.group ? ` group=${user.group}` : '';
      const disabled = user.disabled !== undefined ? ` disabled=${user.disabled}` : '';

      this.lines.push(`/user add${name}${password}${group}${disabled}${comment}`);

      // Permissions
      if (user.permissions) {
        for (const perm of user.permissions) {
          this.lines.push(`/user group set ${user.group || 'read'} policy=${perm}`);
        }
      }
    }
    this.lines.push('');
  }
}

module.exports = SystemGenerator;
