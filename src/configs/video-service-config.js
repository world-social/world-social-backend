const config = {
  bucketName: process.env.AWS_BUCKET_NAME || 'socialworldworldcoin',
  region: process.env.AWS_REGION || 'us-east-2',
  maxVideoSize: parseInt(process.env.MAX_VIDEO_SIZE) || 5242880, // 5MB default
  videoRetentionDays: parseInt(process.env.VIDEO_RETENTION_DAYS) || 7,
  getBaseUrl: () => {
    const bucketName = process.env.AWS_BUCKET_NAME || 'socialworldworldcoin';
    const region = process.env.AWS_REGION || 'us-east-2';
    return `https://${bucketName}.s3.${region}.amazonaws.com`;
  }
};

module.exports = config; 