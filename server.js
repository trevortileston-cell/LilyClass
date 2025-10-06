const http = require('http');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const dotenvPath = path.join(__dirname, '.env');
if (fs.existsSync(dotenvPath)) {
  const envContent = fs.readFileSync(dotenvPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      return;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  });
}

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=UTF-8'
};

const MAX_BODY_SIZE = 10 * 1024 * 1024;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(payload));
}

function extractResponseText(data) {
  if (!data) {
    return '';
  }

  if (typeof data.output_text === 'string' && data.output_text.trim().length > 0) {
    return data.output_text.trim();
  }

  if (Array.isArray(data.output)) {
    return data.output
      .map((item) => {
        if (!item || !Array.isArray(item.content)) {
          return '';
        }
        return item.content
          .map((piece) => (typeof piece.text === 'string' ? piece.text : ''))
          .join('');
      })
      .join('')
      .trim();
  }

  if (Array.isArray(data.choices)) {
    return data.choices
      .map((choice) => {
        if (!choice || !Array.isArray(choice.message?.content)) {
          return '';
        }
        return choice.message.content
          .map((piece) => (typeof piece.text === 'string' ? piece.text : ''))
          .join('');
      })
      .join('')
      .trim();
  }

  return '';
}

async function handleAnalyze(req, res) {
  let rawBody = '';
  let bodySize = 0;

  req.on('data', (chunk) => {
    bodySize += chunk.length;
    if (bodySize > MAX_BODY_SIZE) {
      rawBody = '';
      req.connection.destroy();
    } else {
      rawBody += chunk;
    }
  });

  req.on('end', async () => {
    try {
      if (!rawBody) {
        sendJson(res, 400, { error: 'No request body received.' });
        return;
      }

      const payload = JSON.parse(rawBody);
      const { imageData, studentLevel } = payload || {};

      if (!imageData || typeof imageData !== 'string') {
        sendJson(res, 400, { error: 'Image data is required.' });
        return;
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        sendJson(res, 500, {
          error: 'Server is not configured with an OpenAI API key. Add it to the .env file as OPENAI_API_KEY.'
        });
        return;
      }

      const base64Image = imageData.includes(',') ? imageData.split(',')[1] : imageData;
      const levelText = typeof studentLevel === 'string' && studentLevel.trim()
        ? `The student identifies their current comfort level as: ${studentLevel.trim()}.`
        : 'The student did not specify their comfort level.';

      const tutoringPrompt = [
        'A child has taken a photo of their current school work. You are a warm, encouraging tutor named Lily. ',
        'Study the image, infer the topic, and craft a short explanation to celebrate what they have done well. ',
        'Then create three increasingly advanced follow-up questions or mini challenges that build on the same concept. ',
        'For each question, give a brief hint that nudges deeper thinking without giving away the answer. ',
        'Keep the tone positive, curious, and age-appropriate. ',
        levelText
      ].join('');

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          input: [
            {
              role: 'system',
              content: [
                {
                  type: 'text',
                  text: 'You are Lily, a friendly learning companion helping children explore advanced ideas step-by-step.'
                }
              ]
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: tutoringPrompt },
                { type: 'input_image', image_base64: base64Image }
              ]
            }
          ],
          max_output_tokens: 600,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        sendJson(res, response.status, {
          error: 'OpenAI request failed.',
          details: errorBody
        });
        return;
      }

      const data = await response.json();
      const text = extractResponseText(data);

      if (!text) {
        sendJson(res, 502, {
          error: 'Unable to understand the response from the AI service.'
        });
        return;
      }

      sendJson(res, 200, { message: text });
    } catch (error) {
      sendJson(res, 500, {
        error: 'Unexpected server error.',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

function serveStatic(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.join(__dirname, 'public', pathname);

  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('Access denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/analyze') {
    handleAnalyze(req, res);
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`LilyClass server running at http://localhost:${PORT}`);
});
