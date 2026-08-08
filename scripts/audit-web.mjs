import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const fail = [];
const requiredPages = [
  'index.html','transactions.html','import.html','budget.html','savings.html','reports.html','settings.html',
  'login.html','signup.html','forgot-password.html','reset-password.html','auth-callback.html'
];
for (const file of requiredPages) if (!fs.existsSync(path.join(root, file))) fail.push(`Mangler side: ${file}`);

const htmlFiles = fs.readdirSync(root).filter(f => f.endsWith('.html'));
const localRef = /(?:src|href)=["']([^"']+)["']/gi;
for (const file of htmlFiles) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of content.matchAll(localRef)) {
    const raw = match[1];
    if (!raw || raw.startsWith('#') || /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(raw)) continue;
    const clean = raw.split('#')[0].split('?')[0];
    if (!clean) continue;
    const target = path.join(root, clean.replace(/^\//, ''));
    if (!fs.existsSync(target)) fail.push(`${file}: lokal reference findes ikke: ${raw}`);
  }
}

const syntaxFiles = [];
for (const dir of ['assets','scripts']) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) continue;
  for (const name of fs.readdirSync(absolute)) {
    if (/\.(?:js|mjs)$/.test(name)) syntaxFiles.push(path.join(absolute, name));
  }
}
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding:'utf8' });
  if (result.status !== 0) fail.push(`Syntaxfejl i ${path.relative(root, file)}: ${(result.stderr || result.stdout).trim()}`);
}

const configPath = path.join(root, 'assets/config.js');
if (fs.existsSync(configPath)) {
  const config = fs.readFileSync(configPath, 'utf8');
  const retired = ['polish-core-v7.js','polish-finance-v7.js','polish-overview-v7.js','polish-local-v7.js','simplify-v10.js','ai-runtime-v8.js','store-runtime-v12.js','web-boot-v13.js','web-analysis-v13.js','web-chat-v13.js'];
  for (const file of retired) if (config.includes(file)) fail.push(`config.js loader stadig koblet til udfaset/afprioriteret runtime: ${file}`);
  for (const required of ['web-core-v13.js','web-economy-v13.js','web-budget-v13.js','web-fixed-v13.js','web-savings-v13.js','web-dashboard-v13.js','web-settings-v13.js','web-economy-v14.js','web-dashboard-v14.js','web-boot-v14.js','mobile-v14.css','ai-runtime-v13.js','import-fix-v13.js']) if (!config.includes(required)) fail.push(`config.js loader mangler ${required}`);
}

for (const required of ['assets/mobile-v14.css','assets/web-economy-v14.js','assets/web-dashboard-v14.js','assets/web-boot-v14.js']) {
  if (!fs.existsSync(path.join(root, required))) fail.push(`Mangler v14-fil: ${required}`);
}

const boot14 = path.join(root, 'assets/web-boot-v14.js');
if (fs.existsSync(boot14)) {
  const content = fs.readFileSync(boot14, 'utf8');
  for (const label of ['Overblik','Forbrug','Spar penge','Indstillinger']) if (!content.includes(label)) fail.push(`v14-navigation mangler: ${label}`);
  for (const retiredLabel of ["'Plan'","'Indsigter'"]) if (content.includes(retiredLabel)) fail.push(`v14-navigation indeholder fortsat hovedpunkt ${retiredLabel}`);
}

if (fail.length) {
  console.error(`Web audit fejlede med ${fail.length} problem(er):`);
  for (const item of fail) console.error(`- ${item}`);
  process.exit(1);
}
console.log(`Web audit OK: ${htmlFiles.length} HTML-sider, ${syntaxFiles.length} JS/MJS-filer, mobile v14 assets og lokale referencer valideret.`);
