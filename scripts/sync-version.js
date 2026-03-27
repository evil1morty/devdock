#!/usr/bin/env node
// Syncs the version from package.json (single source of truth)
// into tauri.conf.json and Cargo.toml.
// Usage: node scripts/sync-version.js

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

// Update tauri.conf.json
const tauriConfPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = version;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

// Update Cargo.toml
const cargoPath = path.join(root, 'src-tauri', 'Cargo.toml');
let cargo = fs.readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version\s*=\s*".*"/m, `version = "${version}"`);
fs.writeFileSync(cargoPath, cargo);

console.log(`Synced version ${version} to tauri.conf.json and Cargo.toml`);
