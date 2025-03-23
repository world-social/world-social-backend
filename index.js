const express = require('express');
const multer = require('multer');
const path = require('path');
const Minio = require('minio');

require('dotenv').config();

const app = express();
const port = 3000;

// Configure the MinIO client
const minioClient = new Minio.Client({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY
});

const bucketName = 'videos';

// Ensure the bucket exists (or create it)
minioClient.bucketExists(bucketName, (err) => {
  if (err) {
    // If it doesn't exist, create the bucket
    minioClient.makeBucket(bucketName, 'us-east-1', (err) => {
      if (err) {
        console.error('Error creating bucket.', err);
      } else {
        console.log('Bucket created successfully.');
      }
    });
  } else {
    console.log('Bucket already exists.');
  }
});

// Configure multer to use memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Endpoint to upload a video
app.post('/upload', upload.single('video'), (req, res) => {
  // Generate a unique filename using timestamp
  const fileName = Date.now() + path.extname(req.file.originalname);
  
  // Upload the video buffer to MinIO
  minioClient.putObject(bucketName, fileName, req.file.buffer, (err, etag) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error uploading file to MinIO' });
    }
    res.json({ message: 'Video uploaded successfully', fileName });
  });
});

// Endpoint to retrieve (stream) a video
app.get('/video/:fileName', (req, res) => {
  const fileName = req.params.fileName;
  
  // Retrieve the video object from MinIO
  minioClient.getObject(bucketName, fileName, (err, dataStream) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error retrieving video from MinIO' });
    }
    
    // Set appropriate headers (adjust MIME type if needed)
    res.setHeader('Content-Type', 'video/mp4');
    
    // Pipe the video stream to the client
    dataStream.pipe(res);
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
