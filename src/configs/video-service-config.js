const config = {
  bucketName: process.env.AWS_BUCKET_NAME || 'socialworldworldcoin',
  region: process.env.AWS_REGION || 'us-east-2',
  maxVideoSize: parseInt(process.env.MAX_VIDEO_SIZE) || 100 * 1024 * 1024, // 100MB
  videoRetentionDays: parseInt(process.env.VIDEO_RETENTION_DAYS) || 30,
  getBaseUrl: () => {
    const region = process.env.AWS_REGION || 'us-east-2';
    const bucketName = process.env.AWS_BUCKET_NAME || 'socialworldworldcoin';
    return `https://${bucketName}.s3.${region}.amazonaws.com`;
  }
};

module.exports = config; 