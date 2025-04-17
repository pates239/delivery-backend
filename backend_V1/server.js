// backend/server.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const twilio = require('twilio');
const cors = require('cors');
const app = express();
const upload = multer();

// AWS setup
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.DYNAMO_TABLE;

// Twilio setup
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

app.use(cors());
app.use(express.json());

app.post('/api/deliver', upload.single('image'), async (req, res) => {
  try {
    const { phone, name, orderId } = req.body;
    const file = req.file;

    const key = `delivery-images/${orderId}-${uuidv4()}.jpg`;

    // Upload image to S3
    await s3.upload({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      // ACL: 'public-read'
    }).promise();

    const imageUrl = `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${key}`;

    // Send MMS to customer
    await twilioClient.messages.create({
      body: `Hi ${name}, your Grain & Greens Bowl has been delivered! We hope you enjoy Your Meal! \n -Grain & Greens Team`,
      from: process.env.TWILIO_NUMBER,
      to: phone,
      mediaUrl: [imageUrl]
    });

    // Update DynamoDB
    await dynamodb.put({
      TableName: TABLE_NAME,
      Item: {
        orderId,
        name,
        phone,
        delivered: true,
        timestamp: new Date().toISOString(),
        imageUrl
      }
    }).promise();

    res.status(200).json({ success: true, imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delivery failed' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
