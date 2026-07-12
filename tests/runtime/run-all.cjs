#!/usr/bin/env node
/* Runs every runtime test suite in this folder against the built dist/.
 * Used as the pre-release gate by scripts/release.cjs — a failing suite blocks the release.
 * Run standalone: npm run build && npm run test:runtime
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const suites = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.cjs'))
  .sort();

if (!suites.length) {
  console.error('FATAL: no *.test.cjs suites found in tests/runtime/ — the release gate would be a no-op.');
  process.exit(1);
}

let failed = 0;
for (const suite of suites) {
  console.log(`\n########## ${suite} ##########`);
  const r = spawnSync(process.execPath, [path.join(__dirname, suite)], { stdio: 'inherit' });
  if (r.status !== 0) {
    failed++;
    console.error(`\n>>> ${suite} FAILED (exit ${r.status})`);
  }
}

console.log(`\n========== runtime tests: ${suites.length - failed}/${suites.length} suites passed ==========`);
process.exit(failed ? 1 : 0);
