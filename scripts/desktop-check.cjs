// Self-test for the desktop app. Launches it twice against a throwaway profile:
//   1) write a marker into IndexedDB, 2) restart and check the marker is still there.
// Usage: node scripts/desktop-check.cjs [path-to-School Manager Pro.exe]
// Without an argument it runs the local Electron against dist/ (run `npm run build` first).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const exe = process.argv[2];
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smp-check-'));

function launch(phase) {
  const cmd = exe || require('electron');
  const args = exe ? [] : [root];
  const env = { ...process.env, SMP_SMOKE: '1', SMP_SMOKE_PHASE: phase, SMP_USERDATA: profile };
  delete env.ELECTRON_RUN_AS_NODE; // even an empty value makes Electron start as plain Node
  const res = spawnSync(cmd, args, {
    env,
    encoding: 'utf8',
    timeout: 60000,
  });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  const lines = out.split(/\r?\n/).filter((l) => /SMOKE|USERDATA|renderer error/.test(l));
  console.log(`[${phase}] exit ${res.status}`);
  lines.forEach((l) => console.log('  ' + l));
  return res.status === 0;
}

let ok = false;
try {
  ok = launch('write') && launch('read');
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
}
console.log(ok ? 'DESKTOP CHECK PASSED' : 'DESKTOP CHECK FAILED');
process.exit(ok ? 0 : 1);
