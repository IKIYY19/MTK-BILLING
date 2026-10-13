/**
 * MikroTik PPPoE Auto-Provision Generator
 * Generates MikroTik CLI commands for PPPoE secret management
 */

class PPPoEProvisioner {
  /**
   * Generate MikroTik command to create/update a PPPoE secret
   * @param {Object} sub - Subscription object with customer, plan, PPPoE credentials
   * @returns {Object} { command: string, description: string }
   */
  static generateCreateCommand(sub) {
    const { customer, plan, pppoe_username, pppoe_password, pppoe_profile } = sub;
    const rateLimit = plan ? `${plan.speed_down}/${plan.speed_up}` : '1M/1M';
    const profile = pppoe_profile || 'default';

    const commands = [];
    commands.push(`# Auto-provision: ${customer?.name || 'Unknown'} (${pppoe_username})`);
    commands.push(`/ppp secret add name=${pppoe_username} password=${pppoe_password} service=pppoe profile=${profile} rate-limit=${rateLimit} comment="Customer: ${customer?.name} | Plan: ${plan?.name || 'N/A'} | Auto-provisioned"`);

    // If plan has specific rate limit format, also create queue
    if (plan && plan.priority) {
      commands.push(`/queue simple add name="queue_${pppoe_username}" target=${pppoe_username} max-limit=${rateLimit} priority=${plan.priority} comment="Auto-queue for ${pppoe_username}"`);
    }

    return {
      command: commands.join('\n'),
      description: `Created PPPoE secret for ${pppoe_username} (${rateLimit})`,
    };
  }

  /**
   * Generate MikroTik command to disable a PPPoE secret
   */
  static generateDisableCommand(username) {
    return {
      command: `# Auto-suspend: ${username}\n/ppp secret set [find name=${username}] disabled=yes`,
      description: `Disabled PPPoE secret for ${username}`,
    };
  }

  /**
   * Generate MikroTik command to enable a PPPoE secret
   */
  static generateEnableCommand(username) {
    return {
      command: `# Auto-activate: ${username}\n/ppp secret set [find name=${username}] disabled=no`,
      description: `Enabled PPPoE secret for ${username}`,
    };
  }

  /**
   * Generate MikroTik command to delete a PPPoE secret
   */
  static generateDeleteCommand(username) {
    return {
      command: `# Auto-remove: ${username}\n/ppp secret remove [find name=${username}]`,
      description: `Removed PPPoE secret for ${username}`,
    };
  }

  /**
   * Generate MikroTik command to update rate limit
   */
  static generateUpdateRateLimit(username, newPlan) {
    const rateLimit = `${newPlan.speed_down}/${newPlan.speed_up}`;
    return {
      command: `# Auto-update rate limit: ${username}\n/ppp secret set [find name=${username}] rate-limit=${rateLimit}\n/queue simple set [find name="queue_${username}"] max-limit=${rateLimit}`,
      description: `Updated ${username} rate limit to ${rateLimit}`,
    };
  }

  /**
   * Generate MikroTik command to kick a user (disconnect active session)
   */
  static generateKickCommand(username) {
    return {
      command: `/ppp active remove [find name=${username}]`,
      description: `Disconnected active session for ${username}`,
    };
  }

  /**
   * Generate a complete provisioning script for a subscription change
   */
  static generateProvisioningScript(action, sub) {
    const scripts = [];
    scripts.push('#############################################');
    scripts.push(`# Auto-Provisioning Script - ${action.toUpperCase()}`);
    scripts.push(`# Generated: ${new Date().toISOString()}`);
    scripts.push(`# Customer: ${sub.customer?.name || 'Unknown'}`);
    scripts.push(`# PPPoE: ${sub.pppoe_username}`);
    scripts.push('#############################################');
    scripts.push('');

    switch (action) {
      case 'activate':
        if (sub.pppoe_username) {
          scripts.push(PPPoEProvisioner.generateCreateCommand(sub).command);
        }
        break;

      case 'suspend':
        if (sub.pppoe_username) {
          scripts.push(PPPoEProvisioner.generateDisableCommand(sub.pppoe_username).command);
          scripts.push(PPPoEProvisioner.generateKickCommand(sub.pppoe_username).command);
        }
        break;

      case 'activate_existing':
        if (sub.pppoe_username) {
          scripts.push(PPPoEProvisioner.generateEnableCommand(sub.pppoe_username).command);
        }
        break;

      case 'change_plan':
        if (sub.pppoe_username && sub.plan) {
          scripts.push(PPPoEProvisioner.generateUpdateRateLimit(sub.pppoe_username, sub.plan).command);
        }
        break;

      case 'remove':
        if (sub.pppoe_username) {
          scripts.push(PPPoEProvisioner.generateDeleteCommand(sub.pppoe_username).command);
        }
        break;
    }

    scripts.push('');
    scripts.push('#############################################');
    scripts.push('# End of Auto-Provisioning Script');
    scripts.push('#############################################');

    return scripts.join('\n');
  }
}

module.exports = PPPoEProvisioner;
