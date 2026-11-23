// Minimal Ollama client. Uses structured outputs: passing a JSON schema as
// `format` makes the model return JSON that matches it.
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// CPU inference on a 7B model runs ~5 tokens/s, so one call can take minutes.
// Calls run in the background queue, so a long timeout doesn't block any request.
const TIMEOUT_MS = 15 * 60 * 1000;

export async function chatJSON({ system, user, schema, temperature = 0.2 }) {
  let res;
  try {
    res = await fetch(`${env.OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        stream: false,
        format: schema,
        options: { temperature, num_ctx: 8192 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timed out' : 'is not reachable';
    throw new AppError(`AI service ${reason} (${env.OLLAMA_URL}). Is Ollama running?`, 503);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 404 && text.includes('not found')) {
      throw new AppError(`AI model "${env.OLLAMA_MODEL}" is not installed. Run: ollama pull ${env.OLLAMA_MODEL}`, 503);
    }
    throw new AppError(`AI service error ${res.status}: ${text.slice(0, 200)}`, 502);
  }

  const data = await res.json();
  try {
    return { json: JSON.parse(data.message?.content ?? ''), model: data.model || env.OLLAMA_MODEL };
  } catch {
    throw new AppError('AI returned invalid JSON, please try again', 502);
  }
}
