const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const faceapi = require('@vladmandic/face-api');
const canvas = require('canvas');
const { createCanvas, Image } = canvas;
faceapi.env.monkeyPatch({ Canvas: canvas.Canvas, Image: canvas.Image });

// Load face-api models
const loadModels = async () => {
  await faceapi.nets.ssdMobilenetv1.loadFromDisk('./models');
  await faceapi.nets.faceLandmark68Net.loadFromDisk('./models');
};

// Function to process a single image
const processImage = async (name, url) => {
  try {
    // Download the image
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');

    // Load the image
    const img = await canvas.loadImage(buffer);
    const detection = await faceapi.detectSingleFace(img).withFaceLandmarks();

    if (detection) {
      const { x, y, width, height } = detection.detection.box;
      
      // Calculate an expanded crop area (2.5 times the face size)
      const expandFactor = 2.5;
      const expandedSize = Math.floor(Math.max(width, height) * expandFactor);
      
      // Calculate the center of the face
      const centerX = x + width / 2;
      const centerY = y + height / 2;

      // Calculate the new crop area
      let left = Math.round(centerX - expandedSize / 2);
      let top = Math.round(centerY - expandedSize / 2);
      
      // Adjust if the crop area goes outside the image boundaries
      const imageWidth = img.width;
      const imageHeight = img.height;
      
      // Ensure left and top are not negative
      left = Math.max(0, left);
      top = Math.max(0, top);

      // Ensure right and bottom don't exceed image dimensions
      const right = Math.min(imageWidth, left + expandedSize);
      const bottom = Math.min(imageHeight, top + expandedSize);

      // Recalculate width and height
      const cropWidth = right - left;
      const cropHeight = bottom - top;

      // Ensure the crop area is square
      const cropSize = Math.min(cropWidth, cropHeight);

      // Adjust left and top to center the square crop
      left = left + Math.floor((cropWidth - cropSize) / 2);
      top = top + Math.floor((cropHeight - cropSize) / 2);

      // Crop the image
      const croppedBuffer = await sharp(buffer)
        .extract({ left, top, width: cropSize, height: cropSize })
        .toBuffer();

      // Generate filename
      const nameParts = name.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];
      let middlePart = '';
      
      if (nameParts.length > 2) {
        middlePart = nameParts.slice(1, -1).map(part => part[0]).join('_') + '_';
      }
      
      const filename = `${firstName}_${lastName}-Crop-${cropSize}x${cropSize}.jpg`;

      // Save the image
      fs.writeFileSync(path.join(__dirname, 'output', filename), croppedBuffer);
      console.log(`Processed: ${filename}`);
    } else {
      console.log(`No face detected for ${name}`);
    }
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.error(`Error processing ${name}: Access forbidden (403). The image might be protected or the URL might be incorrect.`);
    } else {
      console.error(`Error processing ${name}: ${error.message}`);
    }
  }
};

// Main function
const main = async () => {
  try {
    // Load face-api models
    await loadModels();

    // Read and parse the JSON file
    const jsonData = JSON.parse(fs.readFileSync('input.json', 'utf-8'));

    // Create output directory if it doesn't exist
    if (!fs.existsSync('output')) {
      fs.mkdirSync('output');
    }

    // Process each entry in the JSON file
    for (const entry of jsonData) {
      await processImage(entry.name, entry.url);
    }

    console.log('Processing complete.');
  } catch (error) {
    console.error('An error occurred:', error);
  }
};

main();