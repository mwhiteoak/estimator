// Anthropic SDK client + document-block helper. Key/model come from config.js
// so they stay server-side; the browser never sees them.
import Anthropic from '@anthropic-ai/sdk';
import { readConfig } from './config.js';

export function getClient() {
  const { apiKey } = readConfig();
  if (!apiKey) {
    const err = new Error('No Anthropic API key configured. Add one in Settings.');
    err.code = 'NO_API_KEY';
    throw err;
  }
  return new Anthropic({ apiKey });
}

// Build a base64 PDF document content block. `cache` marks it for prompt
// caching so a retry of the same upload is cheaper/faster.
export function pdfBlock(base64, title, cache = false) {
  return {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    ...(title ? { title } : {}),
    ...(cache ? { cache_control: { type: 'ephemeral' } } : {}),
  };
}

// Build a base64 image content block — used for the digitizer, where the
// client renders one plan page to a canvas at a known pixel scale and we ask
// Claude for pixel coordinates on that exact image (not a length reading).
export function imageBlock(base64, mediaType = 'image/png') {
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: base64 },
  };
}

// Stream a single extraction call. Calls onText(chunk) as text arrives so the
// caller can surface live progress. Returns the full concatenated text.
// `model` / `maxTokens` are per-call so a long energy report can use a faster
// model than the geometry pass.
export async function streamExtraction({ content, model, maxTokens = 16000, onText }) {
  const client = getClient();
  const { model: defaultModel } = readConfig();

  const stream = client.messages.stream({
    model: model || defaultModel,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content }],
  });

  if (onText) stream.on('text', (t) => onText(t));

  const final = await stream.finalMessage();
  return {
    text: final.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n'),
    usage: final.usage,
  };
}
