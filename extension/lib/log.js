// The extension's only writer to the shell's journal. Every message is
// printed at most once per session, so a failing sprite or a bad pack can't
// flood the log however often the code that reports it runs.

const seen = new Set();

/** Logs a warning (prefixed `Critter:`) the first time this exact message is seen. */
export function warn(message) {
  if (seen.has(message)) return;
  seen.add(message);
  console.warn(`Critter: ${message}`);
}

/** Forgets what was logged (when the extension is disabled). */
export function resetLog() {
  seen.clear();
}
