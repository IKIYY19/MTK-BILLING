/**
 * Google Cloud Storage API Integration
 * Alternative backup and file storage solution
 */

let storageFactory = null;

function getStorageFactory() {
  if (storageFactory) {
    return storageFactory;
  }

  try {
    storageFactory = require('@google-cloud/storage').Storage;
    return storageFactory;
  } catch (error) {
    return null;
  }
}

class GoogleCloudStorageService {
  constructor(config = {}) {
    this.projectId = config.projectId || process.env.GCS_PROJECT_ID || '';
    this.keyFilename = config.keyFilename || process.env.GCS_KEY_FILENAME || '';
    this.bucketName = config.bucketName || process.env.GCS_BUCKET_NAME || '';

    const storageConfig = {
      projectId: this.projectId,
    };

    if (this.keyFilename) {
      storageConfig.keyFilename = this.keyFilename;
    }

    const Storage = getStorageFactory();

    if (!Storage) {
      this.storage = null;
      this.bucket = null;
      return;
    }

    this.storage = new Storage(storageConfig);
    this.bucket = this.storage.bucket(this.bucketName);
  }

  isConfigured() {
    return Boolean(this.bucket);
  }

  async uploadFile(filePath, destination, metadata = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Google Cloud Storage SDK is not installed',
      };
    }

    try {
      await this.bucket.upload(filePath, {
        destination: destination,
        metadata: metadata,
      });

      const file = this.bucket.file(destination);
      const [fileMetadata] = await file.getMetadata();

      return {
        success: true,
        name: destination,
        size: fileMetadata.size,
        contentType: fileMetadata.contentType,
        timeCreated: fileMetadata.timeCreated,
      };
    } catch (error) {
      console.error('GCS upload error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async uploadBuffer(buffer, destination, metadata = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Google Cloud Storage SDK is not installed',
      };
    }

    try {
      const file = this.bucket.file(destination);
      const stream = file.createWriteStream({
        metadata: metadata,
      });

      return new Promise((resolve, reject) => {
        stream.on('error', (error) => {
          console.error('GCS buffer upload error:', error);
          reject({
            success: false,
            message: error.message,
          });
        });

        stream.on('finish', async () => {
          try {
            const [fileMetadata] = await file.getMetadata();
            resolve({
              success: true,
              name: destination,
              size: fileMetadata.size,
              contentType: fileMetadata.contentType,
              timeCreated: fileMetadata.timeCreated,
            });
          } catch (error) {
            reject({
              success: false,
              message: error.message,
            });
          }
        });

        stream.end(buffer);
      });
    } catch (error) {
      console.error('GCS buffer upload error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async downloadFile(source, destination) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Google Cloud Storage SDK is not installed',
      };
    }

    try {
      await this.bucket.file(source).download({
        destination: destination,
      });

      return {
        success: true,
        destination: destination,
      };
    } catch (error) {
      console.error('GCS download error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async downloadFileAsBuffer(source) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Google Cloud Storage SDK is not installed',
      };
    }

    try {
      const [file] = await this.bucket.file(source).download();
      
      return {
        success: true,
        buffer: file,
      };
    } catch (error) {
      console.error('GCS buffer download error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async deleteFile(filename) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Google Cloud Storage SDK is not installed',
      };
    }

    try {
      await this.bucket.file(filename).delete();

      return {
        success: true,
        message: 'File deleted successfully',
      };
    } catch (error) {
      console.error('GCS delete error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async listFiles(prefix = '', maxResults = 100) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Google Cloud Storage SDK is not installed',
      };
    }

    try {
      const [files] = await this.bucket.getFiles({
        prefix: prefix,
        maxResults: maxResults,
      });

      const fileList = files.map((file) => ({
        name: file.name,
        size: file.metadata.size,
        contentType: file.metadata.contentType,
        timeCreated: file.metadata.timeCreated,
        updated: file.metadata.updated,
      }));

      return {
        success: true,
        files: fileList,
      };
    } catch (error) {
      console.error('GCS list error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async getFileMetadata(filename) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Google Cloud Storage SDK is not installed',
      };
    }

    try {
      const [metadata] = await this.bucket.file(filename).getMetadata();

      return {
        success: true,
        name: metadata.name,
        size: metadata.size,
        contentType: metadata.contentType,
        timeCreated: metadata.timeCreated,
        updated: metadata.updated,
        md5Hash: metadata.md5Hash,
      };
    } catch (error) {
      console.error('GCS get metadata error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async generateSignedUrl(filename, expiresIn = 3600) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Google Cloud Storage SDK is not installed',
      };
    }

    try {
      const [url] = await this.bucket.file(filename).getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresIn * 1000,
      });

      return {
        success: true,
        url: url,
        expiresIn: expiresIn,
      };
    } catch (error) {
      console.error('GCS signed URL error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async copyFile(source, destination) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Google Cloud Storage SDK is not installed',
      };
    }

    try {
      await this.bucket.file(source).copy(this.bucket.file(destination));

      return {
        success: true,
        message: 'File copied successfully',
      };
    } catch (error) {
      console.error('GCS copy error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async backupDatabase(sqlDumpPath, backupName) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Google Cloud Storage SDK is not installed',
      };
    }

    try {
      const destination = `backups/${backupName}-${Date.now()}.sql`;
      const result = await this.uploadFile(sqlDumpPath, destination, {
        contentType: 'application/sql',
      });

      return result;
    } catch (error) {
      console.error('GCS database backup error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async listBackups() {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Google Cloud Storage SDK is not installed',
      };
    }

    try {
      const result = await this.listFiles('backups/', 1000);
      
      if (result.success) {
        result.files = result.files.map((file) => ({
          ...file,
          isBackup: true,
        }));
      }

      return result;
    } catch (error) {
      console.error('GCS list backups error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }
}

module.exports = GoogleCloudStorageService;
