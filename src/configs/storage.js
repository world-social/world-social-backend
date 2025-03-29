const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Client: MinioClient } = require('minio');
const logger = require('../utils/logger');
const config = require('./video-service-config');

class StorageAdapter {
  constructor() {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'validation') {
      this.client = new S3Client({
        region: config.region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      this.isS3 = true;
      this.bucketName = config.bucketName;
    } else {
      this.client = new MinioClient({
        endPoint: process.env.MINIO_ENDPOINT,
        port: parseInt(process.env.MINIO_PORT),
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY,
        secretKey: process.env.MINIO_SECRET_KEY
      });
      this.isS3 = false;
      this.bucketName = config.bucketName;
    }
  }

  async uploadFile(bucketName, objectName, fileBuffer) {
    try {
      if (this.isS3) {
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: objectName,
          Body: fileBuffer,
        });
        await this.client.send(command);
      } else {
        await this.client.putObject(bucketName, objectName, fileBuffer);
      }
      logger.info(`Successfully uploaded ${objectName} to ${bucketName}`);
    } catch (error) {
      logger.error(`Error uploading file: ${error.message}`);
      throw error;
    }
  }

  async getFile(bucketName, objectName) {
    try {
      if (this.isS3) {
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: objectName,
        });
        const response = await this.client.send(command);
        return response.Body;
      } else {
        return await this.client.getObject(bucketName, objectName);
      }
    } catch (error) {
      logger.error(`Error getting file: ${error.message}`);
      throw error;
    }
  }

  async deleteFile(bucketName, objectName) {
    try {
      if (this.isS3) {
        const command = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: objectName,
        });
        await this.client.send(command);
      } else {
        await this.client.removeObject(bucketName, objectName);
      }
      logger.info(`Successfully deleted ${objectName} from ${bucketName}`);
    } catch (error) {
      logger.error(`Error deleting file: ${error.message}`);
      throw error;
    }
  }

  async ensureBucketExists(bucketName) {
    try {
      if (this.isS3) {
        // For S3, we assume the bucket exists as it should be created manually
        logger.info(`Using existing S3 bucket: ${bucketName}`);
        return;
      } else {
        const exists = await this.client.bucketExists(bucketName);
        if (!exists) {
          await this.client.makeBucket(bucketName);
          logger.info(`Created MinIO bucket: ${bucketName}`);
        } else {
          logger.info(`Using existing MinIO bucket: ${bucketName}`);
        }
      }
    } catch (error) {
      logger.error(`Error ensuring bucket exists: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new StorageAdapter(); 