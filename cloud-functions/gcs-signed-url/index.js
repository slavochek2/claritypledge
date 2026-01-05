const { Storage } = require('@google-cloud/storage');
const functions = require('@google-cloud/functions-framework');

const storage = new Storage();
const BUCKET_NAME = 'claritypledge-ml-training';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Cloud Function to generate signed upload URLs for ML training data.
 *
 * Request body:
 * {
 *   sessionCode: string,
 *   fileName: string,      // e.g., "slava.webm" or "events.json"
 *   contentType: string    // e.g., "audio/webm" or "application/json"
 * }
 *
 * Response:
 * {
 *   uploadUrl: string,     // Signed URL valid for 15 minutes
 *   filePath: string       // Path in bucket: sessions/{sessionCode}/{fileName}
 * }
 */
functions.http('getSignedUrl', async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.set(corsHeaders);
    res.status(204).send('');
    return;
  }

  res.set(corsHeaders);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { sessionCode, fileName, contentType } = req.body;

    // Validate required fields
    if (!sessionCode || !fileName || !contentType) {
      res.status(400).json({
        error: 'Missing required fields: sessionCode, fileName, contentType'
      });
      return;
    }

    // Sanitize inputs to prevent path traversal
    const safeSessionCode = sessionCode.replace(/[^a-zA-Z0-9-_]/g, '');
    const safeFileName = fileName.replace(/[^a-zA-Z0-9-_.]/g, '');

    if (!safeSessionCode || !safeFileName) {
      res.status(400).json({ error: 'Invalid sessionCode or fileName' });
      return;
    }

    const filePath = `sessions/${safeSessionCode}/${safeFileName}`;
    const file = storage.bucket(BUCKET_NAME).file(filePath);

    // Generate signed URL valid for 15 minutes
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: contentType,
    });

    console.log(`Generated signed URL for: ${filePath}`);

    res.status(200).json({
      uploadUrl: signedUrl,
      filePath: filePath,
    });

  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});
