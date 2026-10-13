const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

let alreadyLoaded = false;
let loadedPaths = [];

function getCandidateEnvPaths() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'server', '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];

  return [...new Set(candidates)];
}

function loadEnv() {
  if (alreadyLoaded) {
    return loadedPaths;
  }

  loadedPaths = [];

  for (const candidate of getCandidateEnvPaths()) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    dotenv.config({ path: candidate, override: false });
    loadedPaths.push(candidate);
  }

  if (loadedPaths.length === 0) {
    dotenv.config();
  }

  alreadyLoaded = true;
  return loadedPaths;
}

module.exports = {
  loadEnv,
  getCandidateEnvPaths,
};
