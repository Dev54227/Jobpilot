// Converts a .docx buffer to PDF with headless LibreOffice.
//
// LibreOffice builds a settings profile on first start (~15-20s). We keep ONE
// profile folder and reuse it, so later conversions take a few seconds. A
// LibreOffice profile can't be used by two processes at once, so conversions
// are queued and run one at a time.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const run = promisify(execFile);
const PROFILE_DIR = join(tmpdir(), 'jobpilot-lo-profile');

let queue = Promise.resolve();

export function docxToPdf(docxBuffer) {
  const task = queue.then(() => convert(docxBuffer));
  queue = task.catch(() => {}); // one failure must not block the queue
  return task;
}

async function convert(docxBuffer) {
  const dir = await mkdtemp(join(tmpdir(), 'jobpilot-'));
  try {
    await mkdir(PROFILE_DIR, { recursive: true });
    const input = join(dir, 'resume.docx');
    await writeFile(input, docxBuffer);
    await run(
      env.SOFFICE_PATH,
      [`-env:UserInstallation=${pathToFileURL(PROFILE_DIR).href}`, '--headless', '--convert-to', 'pdf', '--outdir', dir, input],
      { timeout: 90000, windowsHide: true }
    );
    return await readFile(join(dir, 'resume.pdf'));
  } catch (err) {
    // ENOENT while spawning = soffice missing (a missing output file is a different failure)
    if (err.code === 'ENOENT' && err.syscall?.startsWith('spawn')) {
      throw new AppError(`LibreOffice not found at "${env.SOFFICE_PATH}". Set SOFFICE_PATH.`, 503);
    }
    // keep the real cause in the server log; the client only gets a short message
    console.error('docxToPdf failed:', err.code ?? '', err.signal ?? '', err.message, String(err.stderr || '').slice(0, 500));
    throw new AppError('PDF conversion failed', 500);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
