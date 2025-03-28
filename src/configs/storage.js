const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Client: MinioClient } = require('minio');
const logger = require('../utils/logger');

class StorageAdapter {
  constructor() {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'validation') {
      this.client = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      this.isS3 = true;
      this.bucketName = process.env.AWS_BUCKET_NAME || 'worldsocial-videos';
    } else {
      this.client = new MinioClient({
        endPoint: process.env.MINIO_ENDPOINT,
        port: parseInt(process.env.MINIO_PORT),
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY,
        secretKey: process.env.MINIO_SECRET_KEY
      });
      this.isS3 = false;
      this.bucketName = process.env.MINIO_BUCKET || 'worldsocial-videos';
    }
  }

  async uploadFile(objectName, fileBuffer) {
    try {
      if (this.isS3) {
        const command = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: objectName,
          Body: fileBuffer,
        });
        await this.client.send(command);
      } else {
        await this.client.putObject(this.bucketName, objectName, fileBuffer);
      }
      logger.info(`Successfully uploaded ${objectName} to ${this.bucketName}`);
    } catch (error) {
      logger.error(`Error uploading file: ${error.message}`);
      throw error;
    }
  }

  async getFile(objectName) {
    try {
      if (this.isS3) {
        const command = new GetObjectCommand({
          Bucket: this.bucketName,
          Key: objectName,
        });
        const response = await this.client.send(command);
        return response.Body;
      } else {
        return await this.client.getObject(this.bucketName, objectName);
      }
    } catch (error) {
      logger.error(`Error getting file: ${error.message}`);
      throw error;
    }
  }

  async deleteFile(objectName) {
    try {
      if (this.isS3) {
        const command = new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: objectName,
        });
        await this.client.send(command);
      } else {
        await this.client.removeObject(this.bucketName, objectName);
      }
      logger.info(`Successfully deleted ${objectName} from ${this.bucketName}`);
    } catch (error) {
      logger.error(`Error deleting file: ${error.message}`);
      throw error;
    }
  }

  async ensureBucketExists() {
    try {
      if (this.isS3) {
        // For S3, we assume the bucket exists as it should be created manually
        logger.info(`Using existing S3 bucket: ${this.bucketName}`);
        return;
      } else {
        const exists = await this.client.bucketExists(this.bucketName);
        if (!exists) {
          await this.client.makeBucket(this.bucketName);
          logger.info(`Created MinIO bucket: ${this.bucketName}`);
        } else {
          logger.info(`Using existing MinIO bucket: ${this.bucketName}`);
        }
      }
    } catch (error) {
      logger.error(`Error ensuring bucket exists: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new StorageAdapter(); 