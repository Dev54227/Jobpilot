// Reads and validates environment variables once at startup.
// Fails fast with a clear message instead of crashing later at runtime.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ALLOW_REGISTRATION: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  OLLAMA_URL: z.string().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('qwen2.5:7b'),
  // Built dashboard to serve from the API (empty = don't serve, e.g. in tests)
  // (a relative path is resolved from the server/ folder, whatever the cwd)
  WEB_DIST: z
    .string()
    .default('')
    .transform((p) => (p ? resolve(SERVER_ROOT, p) : '')),
  SOFFICE_PATH: z
    .string()
    .default(process.platform === 'win32' ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe' : 'soffice'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
