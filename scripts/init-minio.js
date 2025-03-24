const { Client } = require('minio');
require('dotenv').config();

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY
});

async function initializeBucket() {
  try {
    const bucketName = process.env.MINIO_BUCKET;
    const exists = await minioClient.bucketExists(bucketName);
    
    if (!exists) {
      console.log(`Creating bucket: ${bucketName}`);
      await minioClient.makeBucket(bucketName);
      console.log(`Bucket ${bucketName} created successfully`);
    } else {
      console.log(`Bucket ${bucketName} already exists`);
    }

    // Set bucket policy to allow public read access
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucketName}/*`]
        }
      ]
    };

    await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
    console.log('Bucket policy set to allow public read access');

  } catch (error) {
    console.error('Error initializing MinIO bucket:', error);
    process.exit(1);
  }
}

initializeBucket(); 