/**
 * Placeholder for script names in the P1-01 command contract that are not yet
 * implemented. It exits non-zero on purpose: a stub must never report a false
 * pass. Each script is replaced by a real command in its owning task.
 */
const scriptName = process.argv[2] ?? "unknown";
const owner = process.argv[3] ?? "a later task";

console.error(
  `[not-configured] "${scriptName}" is not implemented yet. It is delivered by ${owner}. ` +
    `This stub fails deliberately so CI cannot mistake it for a passing check.`,
);
process.exit(1);
