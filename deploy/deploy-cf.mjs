import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';

const ACCOUNT = process.env.CF_ACCOUNT_ID;
const TOKEN = process.env.CF_API_TOKEN;
const SCRIPT = 'danmu';
const API = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT;
const headers = { Authorization: 'Bearer ' + TOKEN };

const BUILTINS = /^node:|^(assert|async_hooks|buffer|child_process|cluster|console|constants|crypto|dgram|diagnostics_channel|dns|domain|events|fs|http|http2|https|inspector|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|wasi|worker_threads|zlib)(\/.*)?$/;
const nodeExternal = {
  name: 'node-external',
  setup(b) { b.onResolve({ filter: BUILTINS }, (a) => ({ path: a.path, external: true })); }
};

await esbuild.build({
  entryPoints: ['danmu_api/worker.js'],
  bundle: true, format: 'esm', platform: 'neutral', target: 'esnext',
  mainFields: ['browser', 'module', 'main'],
  conditions: ['workerd', 'worker', 'browser'],
  plugins: [nodeExternal],
  outfile: 'bundle.js',
  logLevel: 'warning'
});
console.log('bundle done');

const sRes = await fetch(API + '/workers/scripts/' + SCRIPT + '/settings', { headers });
const sJson = await sRes.json();
if (!sJson.success) { console.error('settings fetch failed', JSON.stringify(sJson.errors)); process.exit(1); }
const bindings = sJson.result.bindings || [];
console.log('bindings carried:', bindings.length);

const meta = { main_module: 'worker.js', compatibility_date: '2026-10-01', compatibility_flags: ['nodejs_compat'], bindings };
const form = new FormData();
form.append('worker.js', new Blob([readFileSync('bundle.js')], { type: 'application/javascript+module' }), 'worker.js');
form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
const uRes = await fetch(API + '/workers/scripts/' + SCRIPT, { method: 'PUT', headers, body: form });
const uJson = await uRes.json();
if (!uJson.success) { console.error('deploy failed', JSON.stringify(uJson.errors)); process.exit(1); }
console.log('deployed ok');
