#!/usr/bin/env node
// Fails if the frontend build (dist/) contains the eBird API key or any
// reference to the eBird token header / env variable. Run after `ng build`.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');

if (!existsSync(dist)) {
  console.error('check:secrets: dist/ not found. Run `ng build` first.');
  process.exit(1);
}

const needles = ['X-eBirdApiToken', 'EBIRD_API_KEY', 'api.ebird.org'];
const secrets = new Set();
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  const match = readFileSync(envFile, 'utf8').match(/^\s*EBIRD_API_KEY\s*=\s*"?([^"\r\n#]+)"?/m);
  const key = match?.[1]?.trim();
  if (key && key !== 'your-ebird-api-key-here') secrets.add(key);
}
if (process.env.EBIRD_API_KEY) secrets.add(process.env.EBIRD_API_KEY);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
})(dist);

const hits = [];
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1);
  for (const needle of needles) if (content.includes(needle)) hits.push(`${rel} contains ${JSON.stringify(needle)}`);
  for (const secret of secrets) if (content.includes(secret)) hits.push(`${rel} contains the eBird API key`);
}

if (hits.length) {
  console.error('check:secrets FAILED:\n  ' + hits.join('\n  '));
  process.exit(1);
}
console.log(`check:secrets OK — scanned ${files.length} build files, no eBird key or token header found.`);
