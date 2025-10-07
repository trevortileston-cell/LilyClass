const { analyzeSubmission } = require('../lib/analyze');

const MAX_BODY_SIZE = 10 * 1024 * 1024;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=UTF-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(payload));
}

function handleOptions(res) {
  res.statusCode = 204;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end();
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let rawBody = '';
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error('Payload too large'));
        return;
      }
      rawBody += chunk;
    });

    req.on('end', () => resolve(rawBody));
    req.on('error', (err) => reject(err));
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    handleOptions(res);
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const rawBody = await readRequestBody(req);
    if (!rawBody) {
      sendJson(res, 400, { error: 'No request body received.' });
      return;
    }

    const payload = JSON.parse(rawBody);
    const { imageData, studentLevel } = payload || {};
    const apiKey = process.env.OPENAI_API_KEY;

    const result = await analyzeSubmission({ imageData, studentLevel, apiKey });
    sendJson(res, result.statusCode, result.body);
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(res, 400, { error: 'Invalid JSON payload.' });
      return;
    }

    if (error.message === 'Payload too large') {
      sendJson(res, 413, { error: 'Payload too large.' });
      return;
    }

    sendJson(res, 500, {
      error: 'Unexpected server error.',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
