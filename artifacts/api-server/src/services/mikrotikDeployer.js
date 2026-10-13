/**
 * MikroTik Auto-Deployment Service
 * Automatically deploys generated scripts to MikroTik devices
 */

const mikrotikRest = require('./mikrotikRest');
const mikrotikSSH = require('./mikrotikSSH');
const crypto = require('crypto');

class MikroTikDeployer {
  constructor() {
    this.deployments = new Map(); // Store deployment history
    this.rollbackPoints = new Map(); // Store rollback points
  }

  /**
   * Deploy a script to a MikroTik device
   */
  async deploy(connectionId, script, options = {}) {
    const {
      method = 'auto', // 'auto', 'rest', 'ssh'
      createBackup = true,
      validateBeforeDeploy = true,
      comment = '',
    } = options;

    const deploymentId = crypto.randomBytes(16).toString('hex');
    const deployment = {
      id: deploymentId,
      connectionId,
      script,
      method,
      status: 'pending',
      createdAt: new Date(),
      comment,
      steps: [],
    };

    try {
      // Step 1: Validate script
      if (validateBeforeDeploy) {
        deployment.steps.push({ step: 'validation', status: 'running' });
        const validation = this.validateScript(script);
        deployment.validation = validation;
        
        if (!validation.valid) {
          deployment.status = 'failed';
          deployment.steps.push({ step: 'validation', status: 'failed', error: validation.error });
          this.deployments.set(deploymentId, deployment);
          return { success: false, deployment, error: validation.error };
        }
        deployment.steps.push({ step: 'validation', status: 'completed' });
      }

      // Step 2: Create backup if requested
      if (createBackup) {
        deployment.steps.push({ step: 'backup', status: 'running' });
        const backupName = `pre_deploy_${deploymentId}.backup`;
        
        const connection = this.getConnection(connectionId);
        if (connection) {
          const backupResult = await this.createBackup(connectionId, backupName);
          deployment.backupName = backupName;
          deployment.steps.push({ 
            step: 'backup', 
            status: backupResult.success ? 'completed' : 'failed',
            error: backupResult.error 
          });
          
          if (backupResult.success) {
            this.rollbackPoints.set(deploymentId, {
              deploymentId,
              backupName,
              connectionId,
              createdAt: new Date(),
            });
          }
        }
      }

      // Step 3: Deploy script
      deployment.steps.push({ step: 'deploy', status: 'running' });
      
      let deployResult;
      if (method === 'auto') {
        // Try REST first, fall back to SSH
        deployResult = await this.deployAuto(connectionId, script);
      } else if (method === 'rest') {
        deployResult = await mikrotikRest.executeScript(connectionId, script);
      } else if (method === 'ssh') {
        deployResult = await mikrotikSSH.executeScript(connectionId, script);
      }

      deployment.deployResult = deployResult;
      deployment.steps.push({ 
        step: 'deploy', 
        status: deployResult.success ? 'completed' : 'failed',
        error: deployResult.error 
      });

      // Step 4: Verify deployment
      if (deployResult.success) {
        deployment.steps.push({ step: 'verification', status: 'running' });
        const verification = await this.verifyDeployment(connectionId, script);
        deployment.verification = verification;
        deployment.steps.push({ 
          step: 'verification', 
          status: verification.success ? 'completed' : 'failed',
          error: verification.error 
        });
      }

      deployment.status = deployResult.success ? 'completed' : 'failed';
      deployment.completedAt = new Date();
      this.deployments.set(deploymentId, deployment);

      return {
        success: deployResult.success,
        deployment,
        error: deployResult.error,
      };
    } catch (error) {
      deployment.status = 'failed';
      deployment.error = error.message;
      deployment.completedAt = new Date();
      this.deployments.set(deploymentId, deployment);

      return {
        success: false,
        deployment,
        error: error.message,
      };
    }
  }

  /**
   * Auto-detect and deploy using best method
   */
  async deployAuto(connectionId, script) {
    // Try REST first (v7)
    const restResult = await mikrotikRest.executeScript(connectionId, script);
    if (restResult.success) {
      return { ...restResult, method: 'rest' };
    }

    // Fall back to SSH
    const sshResult = await mikrotikSSH.executeScript(connectionId, script);
    return { ...sshResult, method: 'ssh' };
  }

  /**
   * Get connection from either service
   */
  getConnection(connectionId) {
    return mikrotikRest.getConnection(connectionId) || mikrotikSSH.getConnection(connectionId);
  }

  /**
   * Validate script before deployment
   */
  validateScript(script) {
    const errors = [];

    // Check for common dangerous commands
    const dangerousCommands = [
      '/system reset-configuration',
      '/system reboot',
      '/system shutdown',
      '/file remove',
      '/user remove',
    ];

    dangerousCommands.forEach(cmd => {
      if (script.toLowerCase().includes(cmd.toLowerCase())) {
        errors.push(`Potentially dangerous command detected: ${cmd}`);
      }
    });

    // Check for syntax errors (basic)
    const lines = script.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('#') && !line.startsWith('/') && !line.startsWith(':')) {
        errors.push(`Invalid syntax at line ${i + 1}: ${line}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      error: errors.length > 0 ? errors.join(', ') : null,
    };
  }

  /**
   * Verify deployment by checking if changes were applied
   */
  async verifyDeployment(connectionId, script) {
    try {
      // Extract key commands from script to verify
      const commands = this.extractCommands(script);
      const results = [];

      for (const command of commands) {
        const result = await this.verifyCommand(connectionId, command);
        results.push({ command, result });
      }

      const allVerified = results.every(r => r.result.success);
      return {
        success: allVerified,
        results,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Extract key commands from script
   */
  extractCommands(script) {
    const commands = [];
    const lines = script.split('\n');
    
    lines.forEach(line => {
      line = line.trim();
      if (line.startsWith('/add') || line.startsWith('/set')) {
        commands.push(line);
      }
    });

    return commands;
  }

  /**
   * Verify a specific command was applied
   */
  async verifyCommand(connectionId, command) {
    try {
      // Extract the path from the command
      const match = command.match(/^\/([^\s]+)/);
      if (!match) {
        return { success: false, error: 'Invalid command format' };
      }

      const path = match[1];
      const connection = this.getConnection(connectionId);
      
      if (!connection) {
        return { success: false, error: 'Connection not found' };
      }

      // Try to query the resource
      let result;
      if (mikrotikRest.getConnection(connectionId)) {
        result = await mikrotikRest.executeCommand(connectionId, `/${path.split('/')[0]}`);
      } else {
        result = await mikrotikSSH.executeCommand(connectionId, `/${path.split('/')[0]} print`);
      }

      return {
        success: result.success,
        data: result.data || result.stdout,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create a backup
   */
  async createBackup(connectionId, name) {
    const connection = this.getConnection(connectionId);
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    if (mikrotikRest.getConnection(connectionId)) {
      return await mikrotikRest.createBackup(connectionId, name);
    } else {
      return await mikrotikSSH.createBackup(connectionId, name);
    }
  }

  /**
   * Rollback to a previous deployment
   */
  async rollback(deploymentId) {
    const rollbackPoint = this.rollbackPoints.get(deploymentId);
    if (!rollbackPoint) {
      return { success: false, error: 'Rollback point not found' };
    }

    try {
      const result = await this.restoreBackup(
        rollbackPoint.connectionId,
        rollbackPoint.backupName
      );

      return {
        success: result.success,
        message: 'Rollback completed',
        result,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Restore from backup
   */
  async restoreBackup(connectionId, backupName) {
    const connection = this.getConnection(connectionId);
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    if (mikrotikRest.getConnection(connectionId)) {
      return await mikrotikRest.restoreBackup(connectionId, backupName);
    } else {
      return await mikrotikSSH.restoreBackup(connectionId, backupName);
    }
  }

  /**
   * Get deployment history
   */
  getDeployment(deploymentId) {
    return this.deployments.get(deploymentId);
  }

  /**
   * List all deployments
   */
  listDeployments(connectionId = null) {
    const deployments = Array.from(this.deployments.values());
    
    if (connectionId) {
      return deployments.filter(d => d.connectionId === connectionId);
    }

    return deployments;
  }

  /**
   * Get deployment statistics
   */
  getStats() {
    const deployments = Array.from(this.deployments.values());
    
    return {
      total: deployments.length,
      completed: deployments.filter(d => d.status === 'completed').length,
      failed: deployments.filter(d => d.status === 'failed').length,
      pending: deployments.filter(d => d.status === 'pending').length,
      rollbackPoints: this.rollbackPoints.size,
    };
  }
}

module.exports = new MikroTikDeployer();
