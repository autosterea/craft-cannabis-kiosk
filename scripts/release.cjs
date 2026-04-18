#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const TAG = `v${VERSION}`;
const HYPHENATED = `Craft-Cannabis-Kiosk-Setup-${VERSION}.exe`;
const SPACED = `Craft Cannabis Kiosk Setup ${VERSION}.exe`;

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function fail(msg) {
  console.error(`\nRELEASE FAILED: ${msg}\n`);
  process.exit(1);
}

const notes = process.env.RELEASE_NOTES || process.argv.slice(2).join(' ') || `Release ${TAG}`;

console.log(`\n=== Craft Kiosk Release ${TAG} ===\n`);

if (!fs.existsSync(path.join(RELEASE_DIR, SPACED))) {
  console.log('Installer missing — running electron:build first');
  run('npm run electron:build');
}
if (!fs.existsSync(path.join(RELEASE_DIR, SPACED))) {
  fail(`electron:build did not produce "${SPACED}"`);
}
if (!fs.existsSync(path.join(RELEASE_DIR, 'latest.yml'))) {
  fail('release/latest.yml missing — did electron-builder run?');
}

const latestYml = fs.readFileSync(path.join(RELEASE_DIR, 'latest.yml'), 'utf8');
if (!latestYml.includes(HYPHENATED)) {
  fail(`latest.yml does not reference "${HYPHENATED}" — found:\n${latestYml}`);
}
console.log(`latest.yml references "${HYPHENATED}" ✓`);

const hyphenPath = path.join(RELEASE_DIR, HYPHENATED);
fs.copyFileSync(path.join(RELEASE_DIR, SPACED), hyphenPath);
console.log(`Copied to hyphenated name: ${HYPHENATED}`);

let releaseExists = false;
try {
  runCapture(`gh release view ${TAG}`);
  releaseExists = true;
} catch (_) {}

if (!releaseExists) {
  console.log(`Creating release ${TAG}...`);
  const notesFile = path.join(RELEASE_DIR, `_notes-${TAG}.md`);
  fs.writeFileSync(notesFile, notes);
  run(`gh release create ${TAG} --title "${TAG}" --notes-file "${notesFile}"`);
  fs.unlinkSync(notesFile);
} else {
  console.log(`Release ${TAG} already exists — re-uploading assets`);
}

console.log('Uploading hyphenated EXE + latest.yml...');
run(`gh release upload ${TAG} "${hyphenPath}" "${path.join(RELEASE_DIR, 'latest.yml')}" --clobber`);

console.log('\nRunning post-release verification...');
const verify = spawnSync(process.execPath, [path.join(__dirname, 'verify-release.cjs'), TAG], {
  stdio: 'inherit',
  cwd: ROOT,
});
if (verify.status !== 0) fail('verify-release.cjs failed — release is broken, fix before announcing');

console.log(`\n✓ Release ${TAG} published and verified`);
console.log(`  https://github.com/${pkg.build.publish.owner}/${pkg.build.publish.repo}/releases/tag/${TAG}\n`);
