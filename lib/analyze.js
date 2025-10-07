const MAX_OUTPUT_TOKENS = 600;
const TEMPERATURE = 0.7;

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

async function analyzeSubmission({ imageData, studentLevel, apiKey }) {
  if (!imageData || typeof imageData !== 'string') {
    return {
      statusCode: 400,
      body: { error: 'Image data is required.' }
    };
  }

  if (!apiKey) {
    return {
      statusCode: 500,
      body: {
        error: 'Server is not configured with an OpenAI API key. Add it to the environment as OPENAI_API_KEY.'
      }
    };
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

  try {
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
        max_output_tokens: MAX_OUTPUT_TOKENS,
        temperature: TEMPERATURE
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        statusCode: response.status,
        body: {
          error: 'OpenAI request failed.',
          details: errorBody
        }
      };
    }

    const data = await response.json();
    const text = extractResponseText(data);

    if (!text) {
      return {
        statusCode: 502,
        body: {
          error: 'Unable to understand the response from the AI service.'
        }
      };
    }

    return {
      statusCode: 200,
      body: { message: text }
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        error: 'Unexpected server error.',
        details: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

module.exports = {
  analyzeSubmission
};
