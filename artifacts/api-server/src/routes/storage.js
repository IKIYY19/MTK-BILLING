/**
 * Storage Routes
 * Handles file storage operations via Google Cloud Storage
 */

const express = require('express');
const GoogleCloudStorageService = require('../services/googleCloudStorage');
const { decryptObject } = require('../utils/encryption');

const router = express.Router();

async function getIntegrationConfig(serviceName) {
  try {
    if (!global.db) {return null;}
    const result = await global.db.query(
      'SELECT config_data, is_active FROM integrations WHERE service_name = $1 AND is_active = true LIMIT 1',
      [serviceName]
    );
    if (result.rows.length === 0) {return null;}
    const decrypted = decryptObject(result.rows[0].config_data);
    return decrypted;
  } catch (error) {
    console.error('Error fetching integration config:', error);
    return null;
  }
}

async function getGcsService() {
  const integrationConfig = await getIntegrationConfig('google_cloud_storage');
  if (integrationConfig) {
    return new GoogleCloudStorageService({
      projectId: integrationConfig.project_id,
      keyFilename: integrationConfig.key_filename,
      bucketName: integrationConfig.bucket_name,
    });
  }
  return new GoogleCloudStorageService();
}

// ═══════════════════════════════════════
// UPLOAD FILE
// ═══════════════════════════════════════
router.post('/upload', async (req, res) => {
  try {
    const { filePath, destination, metadata } = req.body;
    if (!filePath || !destination) {
      return res.status(400).json({ error: 'filePath and destination are required' });
    }

    const gcs = await getGcsService();
    const result = await gcs.uploadFile(filePath, destination, metadata);

    res.json(result);
  } catch (e) {
    console.error('Upload file error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// UPLOAD BUFFER
// ═══════════════════════════════════════
router.post('/upload-buffer', async (req, res) => {
  try {
    const { buffer, destination, metadata } = req.body;
    if (!buffer || !destination) {
      return res.status(400).json({ error: 'buffer and destination are required' });
    }

    const gcs = await getGcsService();
    const bufferData = Buffer.from(buffer, 'base64');
    const result = await gcs.uploadBuffer(bufferData, destination, metadata);

    res.json(result);
  } catch (e) {
    console.error('Upload buffer error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// DOWNLOAD FILE
// ═══════════════════════════════════════
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const { destination } = req.query;

    if (!destination) {
      return res.status(400).json({ error: 'destination query parameter is required' });
    }

    const gcs = await getGcsService();
    const result = await gcs.downloadFile(filename, destination);

    res.json(result);
  } catch (e) {
    console.error('Download file error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// DELETE FILE
// ═══════════════════════════════════════
router.delete('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    const gcs = await getGcsService();
    const result = await gcs.deleteFile(filename);

    res.json(result);
  } catch (e) {
    console.error('Delete file error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// LIST FILES
// ═══════════════════════════════════════
router.get('/list', async (req, res) => {
  try {
    const { prefix, maxResults } = req.query;

    const gcs = await getGcsService();
    const result = await gcs.listFiles(
      prefix || '',
      maxResults ? parseInt(maxResults) : 100
    );

    res.json(result);
  } catch (e) {
    console.error('List files error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// GET FILE METADATA
// ═══════════════════════════════════════
router.get('/metadata/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    const gcs = await getGcsService();
    const result = await gcs.getFileMetadata(filename);

    res.json(result);
  } catch (e) {
    console.error('Get metadata error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// GENERATE SIGNED URL
// ═══════════════════════════════════════
router.post('/signed-url', async (req, res) => {
  try {
    const { filename, expiresIn } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'filename is required' });
    }

    const gcs = await getGcsService();
    const result = await gcs.generateSignedUrl(
      filename,
      expiresIn ? parseInt(expiresIn) : 3600
    );

    res.json(result);
  } catch (e) {
    console.error('Generate signed URL error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// COPY FILE
// ═══════════════════════════════════════
router.post('/copy', async (req, res) => {
  try {
    const { source, destination } = req.body;
    if (!source || !destination) {
      return res.status(400).json({ error: 'source and destination are required' });
    }

    const gcs = await getGcsService();
    const result = await gcs.copyFile(source, destination);

    res.json(result);
  } catch (e) {
    console.error('Copy file error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// BACKUP DATABASE
// ═══════════════════════════════════════
router.post('/backup', async (req, res) => {
  try {
    const { sqlDumpPath, backupName } = req.body;
    if (!sqlDumpPath || !backupName) {
      return res.status(400).json({ error: 'sqlDumpPath and backupName are required' });
    }

    const gcs = await getGcsService();
    const result = await gcs.backupDatabase(sqlDumpPath, backupName);

    res.json(result);
  } catch (e) {
    console.error('Backup database error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// LIST BACKUPS
// ═══════════════════════════════════════
router.get('/backups', async (req, res) => {
  try {
    const gcs = await getGcsService();
    const result = await gcs.listBackups();

    res.json(result);
  } catch (e) {
    console.error('List backups error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
