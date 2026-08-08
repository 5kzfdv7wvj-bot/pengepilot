import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
  for (const name of fs.readdirSync(absolute)) if (/\.(?:js|mjs)$/.test(name)) syntaxFiles.push(path.join(absolute, name));
}
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding:'utf8' });
  if (result.status !== 0) fail.push(`Syntaxfejl i ${path.relative(root, file)}: ${(result.stderr || result.stdout).trim()}`);
}

const configPath = path.join(root, 'assets/config.js');
if (fs.existsSync(configPath)) {
  const config = fs.readFileSync(configPath, 'utf8');
  const retired = ['polish-core-v7.js','polish-finance-v7.js','polish-overview-v7.js','polish-local-v7.js','simplify-v10.js','ai-runtime-v8.js','store-runtime-v12.js','web-boot-v13.js','web-boot-v14.js','web-analysis-v13.js','web-chat-v13.js'];
  for (const file of retired) if (config.includes(file)) fail.push(`config.js loader stadig koblet til udfaset/afprioriteret runtime: ${file}`);
  for (const required of ['web-core-v13.js','web-economy-v13.js','web-budget-v13.js','web-fixed-v13.js','web-savings-v13.js','web-dashboard-v13.js','web-settings-v13.js','web-economy-v14.js','web-dashboard-v14.js','mobile-v14.css','debts-v15.js','web-boot-v15.js','ai-action-center-v15.js','ai-action-center-v15.css','ai-runtime-v13.js','import-fix-v13.js']) if (!config.includes(required)) fail.push(`config.js loader mangler ${required}`);
}

for (const required of ['assets/mobile-v14.css','assets/web-economy-v14.js','assets/web-dashboard-v14.js','assets/debts-v15.js','assets/web-boot-v15.js','assets/ai-action-center-v15.js','assets/ai-action-center-v15.css','supabase/functions/pengepilot-ai/index.ts','supabase/migrations/20260808204500_ai_action_center.sql']) {
  if (!fs.existsSync(path.join(root, required))) fail.push(`Mangler v15-fil: ${required}`);
}

const boot15 = path.join(root, 'assets/web-boot-v15.js');
if (fs.existsSync(boot15)) {
  const content = fs.readFileSync(boot15, 'utf8');
  for (const label of ['Overblik','Forbrug','Spar penge','Indstillinger']) if (!content.includes(label)) fail.push(`v15-navigation mangler: ${label}`);
  if (!content.includes("['debts', 'Gæld']")) fail.push('Spar penge mangler Gæld-fanen.');
  for (const retiredLabel of ["'Plan'","'Indsigter'"]) if (content.includes(retiredLabel)) fail.push(`v15-navigation indeholder fortsat hovedpunkt ${retiredLabel}`);
}

const agentPath = path.join(root, 'assets/ai-action-center-v15.js');
if (fs.existsSync(agentPath)) {
  const content = fs.readFileSync(agentPath, 'utf8');
  for (const required of ['agent_plan','agent_execute','confirmed: true','Udfør','Ret','Annuller']) if (!content.includes(required)) fail.push(`AI-handlingscenter mangler ${required}`);
}

const edgePath = path.join(root, 'supabase/functions/pengepilot-ai/index.ts');
if (fs.existsSync(edgePath)) {
  const content = fs.readFileSync(edgePath, 'utf8');
  for (const required of ['agent_plan','agent_execute','create_debt','set_budget','set_balance_anchor']) if (!content.includes(required)) fail.push(`Edge Function mangler ${required}`);
  if (/service[_-]?role/i.test(content)) fail.push('AI Edge Function må ikke bruge service-role-nøgle.');
  const temp = path.join(os.tmpdir(), `pengepilot-edge-${process.pid}.mjs`);
  fs.writeFileSync(temp, content);
  const result = spawnSync(process.execPath, ['--check', temp], { encoding:'utf8' });
  fs.rmSync(temp, { force:true });
  if (result.status !== 0) fail.push(`Syntaxfejl i AI Edge Function: ${(result.stderr || result.stdout).trim()}`);
}

const migrationPath = path.join(root, 'supabase/migrations/20260808204500_ai_action_center.sql');
if (fs.existsSync(migrationPath)) {
  const content = fs.readFileSync(migrationPath, 'utf8');
  for (const required of ['create table if not exists public.debts','create table if not exists public.debt_payments','enable row level security','sync_debt_payments','transactions_match_debt_payment']) if (!content.toLowerCase().includes(required.toLowerCase())) fail.push(`Gældsmigration mangler ${required}`);
}

if (fail.length) {
  console.error(`Web audit fejlede med ${fail.length} problem(er):`);
  for (const item of fail) console.error(`- ${item}`);
  process.exit(1);
}
console.log(`Web audit OK: ${htmlFiles.length} HTML-sider, ${syntaxFiles.length} JS/MJS-filer, AI Edge Function, mobile v15 AI/debt runtime og lokale referencer valideret.`);
