// In-process background queue for slow AI work.
//
// A 7B model on a CPU generates ~5 tokens/s, so analysis/tailoring takes
// minutes. Instead of holding an HTTP request open that long, the API marks
// the task "queued" and returns 202; this queue runs tasks ONE AT A TIME
// (the CPU is the bottleneck, so parallel runs would only slow each other).
// Clients poll GET /jobs/:id to see ai.<kind>.status.
//
// Single-process only. If the API ever runs as several processes, move this
// to a shared queue (e.g. a Mongo-backed or Redis queue).
import { Job } from '../models/Job.js';

const pending = [];
let busy = false;

export function enqueue(task) {
  pending.push(task);
  void drain();
}

async function drain() {
  if (busy) return;
  busy = true;
  while (pending.length) {
    const task = pending.shift();
    try {
      await task();
    } catch (err) {
      console.error('AI task crashed:', err); // tasks record their own failures; this is a last resort
    }
  }
  busy = false;
}

// Resolves when the queue is empty (used by tests).
export async function idle() {
  while (busy || pending.length) await new Promise((r) => setTimeout(r, 20));
}

// After a restart, tasks that were queued/running in the dead process will never finish.
export async function failInterruptedTasks() {
  for (const kind of ['analyze', 'tailor']) {
    await Job.updateMany(
      { [`ai.${kind}.status`]: { $in: ['queued', 'running'] } },
      { $set: { [`ai.${kind}.status`]: 'failed', [`ai.${kind}.error`]: 'Interrupted by a server restart, please retry', [`ai.${kind}.finishedAt`]: new Date() } }
    );
  }
}
