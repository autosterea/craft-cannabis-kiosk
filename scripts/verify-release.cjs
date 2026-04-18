#!/usr/bin/env node
/* eslint-disable no-console */
const https = require('https');
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const OWNER = pkg.build.publish.owner;
const REPO = pkg.build.publish.repo;

const tag = process.argv[2] || `v${pkg.version}`;

function headStatus(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return headStatus(res.headers.location).then(resolve);
      }
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(0));
    req.end();
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  const base = `https://github.com/${OWNER}/${REPO}/releases/download/${tag}`;
  console.log(`Verifying ${tag} at ${base}`);

  let yml;
  try {
    yml = await fetchText(`${base}/latest.yml`);
  } catch (e) {
    console.error(`FAIL: cannot fetch latest.yml — ${e.message}`);
    process.exit(1);
  }

  const urlMatch = yml.match(/^\s*-?\s*url:\s*(.+)$/m);
  const pathMatch = yml.match(/^path:\s*(.+)$/m);
  if (!urlMatch) {
    console.error('FAIL: latest.yml has no url: line\n' + yml);
    process.exit(1);
  }

  const assetName = urlMatch[1].trim();
  const pathName = pathMatch ? pathMatch[1].trim() : assetName;
  console.log(`  latest.yml url:  ${assetName}`);
  console.log(`  latest.yml path: ${pathName}`);

  const assetUrl = `${base}/${assetName}`;
  const status = await headStatus(assetUrl);
  console.log(`  HEAD ${assetUrl} → ${status}`);

  if (status !== 200) {
    console.error(`\nFAIL: auto-updater WILL NOT WORK — ${assetName} returns ${status}`);
    console.error('      Re-upload the installer with the hyphenated filename.');
    process.exit(1);
  }

  if (pathName !== assetName) {
    console.error(`FAIL: path "${pathName}" differs from url "${assetName}" in latest.yml`);
    process.exit(1);
  }

  console.log(`\n✓ ${tag} auto-updater OK`);
})();
