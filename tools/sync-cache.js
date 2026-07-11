const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'assets', 'js', 'config.js');
const outPath = path.join(root, 'assets', 'data', 'cache.json');

function readGasUrl() {
  const text = fs.readFileSync(configPath, 'utf8');
  const match = text.match(/GAS_URL\s*:\s*['"]([^'"]+)['"]/);
  if (!match || !match[1]) {
    throw new Error('GAS_URL not found in assets/js/config.js');
  }
  return match[1];
}

async function main() {
  const gasUrl = readGasUrl();
  const url = new URL(gasUrl);
  url.searchParams.set('action', 'all');
  url.searchParams.set('fresh', '1');
  url.searchParams.set('_ts', String(Date.now()));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GAS request failed: ${response.status} ${response.statusText}`);
  }
  const result = await response.json();
  if (!result || !result.ok || !result.data) {
    throw new Error(`GAS returned an invalid payload: ${JSON.stringify(result).slice(0, 500)}`);
  }
  delete result.data.members;

  const payload = {
    ok: true,
    mode: 'local-json',
    savedAt: new Date().toISOString(),
    source: 'gas',
    data: result.data
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
