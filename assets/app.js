const sb = window.ppSupabase;
const page = document.body.dataset.page || 'dashboard';
let currentUser = null;
let parsedImport = [];
let parsedImportFile = null;
let parsedImportMeta = null;
let chatCache = null;

const routes = [
  ['dashboard','Overblik','index.html'],
  ['accounts','Konti','accounts.html'],
  ['transactions','Transaktioner','transactions.html'],
  ['import','Importér','import.html'],
  ['budget','Budget','budget.html'],
  ['subscriptions','Abonnementer','subscriptions.html'],
  ['bills','Regninger','bills.html'],
  ['goals','Mål','goals.html'],
  ['savings','Penge fundet','savings.html'],
  ['forecast','Prognose','forecast.html'],
  ['health','Sundhedsscore','health.html'],
  ['chat','AI-assistent','chat.html'],
  ['reports','Rapporter','reports.html'],
  ['settings','Indstillinger','settings.html']
];

const titles = {
  dashboard:['Overblik','Dit økonomiske cockpit'],
  accounts:['Konti','Dine egne konti'],
  transactions:['Transaktioner','Dine importerede posteringer'],
  import:['Importér bankudtog','CSV til din private database'],
  budget:['Budget','Plan og forbrug'],
  subscriptions:['Abonnementer','Gentagne betalinger'],
  bills:['Regninger','Kommende betalinger'],
  goals:['Mål','Opsparing og fremdrift'],
  savings:['Penge fundet','Forslag baseret på dine data'],
  forecast:['Prognose','Fremskrivning fra dine egne tal'],
  health:['Sundhedsscore','En transparent prototype-score'],
  chat:['AI-assistent','Spørg til dine egne økonomidata'],
  reports:['Rapporter','Månedsudvikling'],
  settings:['Indstillinger','Profil og datasikkerhed']
};

const fmt = n => new Intl.NumberFormat('da-DK', {
  style:'currency', currency:'DKK', maximumFractionDigits:0
}).format(Number(n || 0));

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[m]));

const isoMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const normalizeMerchant = s => String(s || '').toLowerCase().replace(/\s+/g,' ').trim();

function toast(text) {
  const e = document.querySelector('#toast');
  if (!e) return;
  e.textContent = text;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 1800);
}

function shell(user) {
  document.querySelector('#app').innerHTML = `
    <div class="app">
      <aside class="side">
        <div class="brand">
          <div class="logo">P</div>
          <div><b>PengePilot</b><small>${esc(user.email)}</small></div>
          <button class="btn mobile" onclick="document.querySelector('.side').classList.toggle('open')">Menu</button>
        </div>
        <nav class="menu">
          ${routes.map(([id,label,url]) => `<a class="${id===page?'on':''}" href="${url}">${label}</a>`).join('')}
        </nav>
        <div class="sidebox">
          <b>Rigtige brugerdata</b><br>
          Data læses via Supabase og beskyttes med Row Level Security.<br><br>
          <button class="btn ghost" onclick="logout()">Log ud</button>
        </div>
      </aside>
      <main class="main">
        <header class="top">
          <div><h1>${titles[page][0]}</h1><p>${titles[page][1]}</p></div>
          <span class="badge">● SUPABASE CONNECTED</span>
        </header>
        <div id="content" class="loading">Henter dine data…</div>
      </main>
    </div>
    <div class="toast" id="toast"></div>`;
}

async function logout() {
  await sb.auth.signOut();
  location.replace('login.html');
}

async function guard() {
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) {
    location.replace('login.html');
    return null;
  }
  return data.user;
}

const q = async (table, opts = {}) => {
  let x = sb.from(table).select(opts.select || '*');
  if (opts.eq) for (const [k,v] of Object.entries(opts.eq)) x = x.eq(k,v);
  if (opts.order) x = x.order(opts.order, { ascending: opts.asc ?? false });
  if (opts.limit) x = x.limit(opts.limit);
  const { data, error } = await x;
  if (error) throw error;
  return data || [];
};

function kpi(title, value, note, cls='') {
  return `<div class="card"><h3>${esc(title)}</h3><div class="sub">${esc(note)}</div><div class="kpi ${cls}">${value}</div></div>`;
}

function categoryMap(categories) {
  return Object.fromEntries(categories.map(c => [c.id, c]));
}

function isTransfer(tx, cmap) {
  return Boolean(tx.category_id && cmap[tx.category_id]?.category_type === 'transfer');
}

function flowSummary(tx, categories, month = null) {
  const cmap = categoryMap(categories);
  const rows = month ? tx.filter(t => String(t.transaction_date).startsWith(month)) : tx;
  const relevant = rows.filter(t => !isTransfer(t, cmap));
  const income = relevant.filter(t => Number(t.amount) > 0).reduce((a,t) => a + Number(t.amount), 0);
  const expenses = Math.abs(relevant.filter(t => Number(t.amount) < 0).reduce((a,t) => a + Number(t.amount), 0));
  return { income, expenses, net: income - expenses, rows: relevant, cmap };
}

async function dashboard() {
  const [tx, accounts, goals, categories] = await Promise.all([
    q('transactions',{order:'transaction_date',limit:1000}),
    q('accounts'), q('goals'), q('categories')
  ]);
  const month = isoMonth();
  const { income, expenses, net, rows, cmap } = flowSummary(tx, categories, month);
  const activeAccounts = accounts.filter(a => !a.is_archived);
  const groups = {};
  rows.filter(t => Number(t.amount) < 0).forEach(t => {
    const name = cmap[t.category_id]?.name || 'Ukategoriseret';
    groups[name] = (groups[name] || 0) + Math.abs(Number(t.amount));
  });
  const top = Object.entries(groups).sort((a,b) => b[1]-a[1]).slice(0,4);
  const groupRows = top.length
    ? top.map(([name,value]) => `<div class="row"><div><b>${esc(name)}</b><small>Denne måned</small></div><b>${fmt(value)}</b></div>`).join('')
    : '<div class="empty">Importer et bankudtog for at se kategorier.</div>';
  return `
    <div class="hero"><h2>Din økonomi denne måned</h2><div class="big">${fmt(net)}</div><p>Netto efter registrerede indtægter og udgifter. Overførsler mellem egne konti tælles ikke med.</p></div>
    <div class="grid g4">
      ${kpi('Indtægter',fmt(income),'Denne måned','good')}
      ${kpi('Udgifter',fmt(expenses),'Denne måned','bad')}
      ${kpi('Konti',activeAccounts.length,'Aktive konti')}
      ${kpi('Opsparingsmål',goals.length,'Registrerede mål')}
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Seneste transaktioner</h2>${tx.slice(0,8).map(t => `<div class="row"><div><b>${esc(t.merchant||t.description)}</b><small>${esc(t.transaction_date)}</small></div><b class="${Number(t.amount)<0?'bad':'good'}">${fmt(t.amount)}</b></div>`).join('') || '<div class="empty">Ingen transaktioner endnu.</div>'}</div>
      <div class="card"><h2>Største udgiftsgrupper</h2>${groupRows}</div>
    </div>`;
}

async function accounts() {
  const [accounts, tx] = await Promise.all([q('accounts',{order:'created_at'}), q('transactions',{limit:5000})]);
  const byAccount = {};
  tx.forEach(t => byAccount[t.account_id] = (byAccount[t.account_id] || 0) + Number(t.amount));
  return `
    <div class="toolbar"><button class="btn" onclick="showAccountForm()">+ Tilføj konto</button></div>
    <div class="grid g3">${accounts.map(a => {
      const balance = Number(a.opening_balance || 0) + Number(byAccount[a.id] || 0);
      return `<div class="card" style="opacity:${a.is_archived ? '.6' : '1'}">
        <span class="tag ${a.is_archived?'amber':'green'}">${a.is_archived?'Arkiveret':esc(a.account_type)}</span>
        <div class="kpi">${fmt(balance)}</div><h3>${esc(a.name)}</h3>
        <div class="sub">${esc(a.bank_name||'Ingen bank angivet')} · startsaldo ${fmt(a.opening_balance)}</div>
        <div class="small-actions" style="margin-top:12px"><button class="btn ghost" onclick="toggleAccount('${a.id}',${!a.is_archived})">${a.is_archived?'Genaktivér':'Arkivér'}</button></div>
      </div>`;
    }).join('') || '<div class="card empty">Ingen konti endnu.</div>'}</div><div id="modal"></div>`;
}

function showAccountForm() {
  document.querySelector('#modal').innerHTML = `<div class="modal"><div class="modal-card"><h2>Ny konto</h2><form onsubmit="saveAccount(event)">
    <div class="field"><label>Navn</label><input id="aName" required placeholder="NemKonto"></div>
    <div class="field"><label>Bank</label><input id="aBank" placeholder="Danske Bank"></div>
    <div class="field"><label>Type</label><select id="aType"><option value="checking">Lønkonto</option><option value="budget">Budgetkonto</option><option value="savings">Opsparing</option><option value="credit">Kredit</option><option value="cash">Kontant</option><option value="other">Andet</option></select></div>
    <div class="field"><label>Startsaldo</label><input id="aBalance" type="number" step="0.01" value="0"></div>
    <div class="small-actions"><button class="btn">Gem</button><button type="button" class="btn ghost" onclick="document.querySelector('#modal').innerHTML=''">Annuller</button></div>
  </form></div></div>`;
}

async function saveAccount(e) {
  e.preventDefault();
  const payload = {
    user_id: currentUser.id,
    name: document.querySelector('#aName').value.trim(),
    bank_name: document.querySelector('#aBank').value.trim() || null,
    account_type: document.querySelector('#aType').value,
    opening_balance: Number(document.querySelector('#aBalance').value || 0),
    opening_balance_date: new Date().toISOString().slice(0,10)
  };
  const { error } = await sb.from('accounts').insert(payload);
  if (error) return alert(error.message);
  toast('Konto gemt');
  await render();
}

async function toggleAccount(id, archived) {
  const { error } = await sb.from('accounts').update({is_archived:archived}).eq('id',id);
  if (error) return alert(error.message);
  toast(archived ? 'Konto arkiveret' : 'Konto genaktiveret');
  await render();
}

async function transactions() {
  const [tx, cats] = await Promise.all([
    q('transactions',{order:'transaction_date',limit:2000}),
    q('categories',{order:'sort_order',asc:true})
  ]);
  const options = `<option value="">Ukategoriseret</option>${cats.filter(c=>!c.is_archived).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}`;
  return `<div class="toolbar"><input id="search" placeholder="Søg…" oninput="filterRows()"><select id="categoryFilter" onchange="filterRows()"><option value="">Alle kategorier</option>${cats.map(c=>`<option>${esc(c.name)}</option>`).join('')}</select><a class="btn" href="import.html">Importér CSV</a></div>
  <div class="card"><table><thead><tr><th>Dato</th><th>Beskrivelse</th><th>Kategori</th><th>Beløb</th></tr></thead><tbody id="txbody">${tx.map(t => {
    const select = options.replace(`value="${t.category_id||''}"`, `value="${t.category_id||''}" selected`);
    return `<tr><td>${esc(t.transaction_date)}</td><td>${esc(t.merchant||t.description)}</td><td><select onchange="changeCategory('${t.id}',this.value)">${select}</select></td><td class="${Number(t.amount)<0?'bad':'good'}">${fmt(t.amount)}</td></tr>`;
  }).join('')}</tbody></table>${tx.length?'':'<div class="empty">Ingen transaktioner endnu.</div>'}</div>`;
}

function filterRows() {
  const s = (document.querySelector('#search')?.value || '').toLowerCase();
  const c = document.querySelector('#categoryFilter')?.value || '';
  document.querySelectorAll('#txbody tr').forEach(r => {
    const text = r.textContent.toLowerCase();
    const selected = r.querySelector('select')?.selectedOptions?.[0]?.textContent || '';
    r.style.display = text.includes(s) && (!c || selected === c) ? '' : 'none';
  });
}

async function changeCategory(id, categoryId) {
  const { error } = await sb.from('transactions').update({category_id:categoryId || null}).eq('id',id);
  if (error) return alert(error.message);
  toast('Kategori gemt');
}

async function importPage() {
  const accounts = (await q('accounts')).filter(a=>!a.is_archived);
  if (!accounts.length) return `<div class="card empty"><h2>Du mangler en aktiv konto</h2><p>Opret først en konto, og kom derefter tilbage til importen.</p><a class="btn" href="accounts.html">Opret konto</a></div>`;
  return `<div class="card"><h2>Importér CSV</h2><p class="sub">CSV skal som minimum have kolonner for dato, tekst/beskrivelse og beløb. PengePilot forsøger automatisk at kategorisere posteringerne før import.</p>
    <div class="field"><label>Konto</label><select id="importAccount">${accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
    <div class="filebox"><input id="csvFile" type="file" accept=".csv,text/csv"><p class="sub">Bankfilen behandles i browseren. Originalfilen gemmes ikke i Supabase.</p><button class="btn" onclick="previewCsv()">Læs CSV</button></div><div id="preview"></div>
  </div>`;
}

function detectDelimiter(text) {
  const first = text.split(/\r?\n/,1)[0] || '';
  const counts = { ';':0, ',':0, '\t':0 };
  for (const d of Object.keys(counts)) counts[d] = first.split(d).length - 1;
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i=0;i<text.length;i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i+1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some(v=>v!=='')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(v=>v!=='')) rows.push(row); }
  if (!rows.length) return { rows:[], delimiter };
  const header = rows[0].map(h => h.toLowerCase().replace(/^\ufeff/,'').trim());
  return { delimiter, rows: rows.slice(1).map(values => {
    const obj = {}; header.forEach((h,i)=>obj[h]=values[i] ?? ''); return obj;
  })};
}

function findCol(row, names) {
  return Object.keys(row).find(k => names.some(n => k.includes(n)));
}

function parseAmount(v) {
  if (v == null) return NaN;
  let s = String(v).replace(/\u00a0/g,' ').trim().replace(/\s/g,'').replace(/dkk|kr\.?/ig,'');
  let negative = /^\(.*\)$/.test(s) || /-$/.test(s);
  s = s.replace(/[()]/g,'').replace(/-$/,'');
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g,'').replace(',','.');
    else s = s.replace(/,/g,'');
  } else if (s.includes(',')) s = s.replace(/\./g,'').replace(',','.');
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -Math.abs(n) : n) : NaN;
}

function parseDate(v) {
  const s = String(v || '').trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  const dm = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (dm) {
    const y = dm[3].length === 2 ? '20'+dm[3] : dm[3];
    return `${y}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function ruleMatches(rule, tx) {
  const source = normalizeMerchant(rule.match_field === 'merchant' ? tx.merchant : tx.description);
  const needle = normalizeMerchant(rule.match_value);
  try {
    if (rule.match_type === 'exact') return source === needle;
    if (rule.match_type === 'starts_with') return source.startsWith(needle);
    if (rule.match_type === 'regex') return new RegExp(rule.match_value,'i').test(source);
    return source.includes(needle);
  } catch { return false; }
}

function fallbackCategoryId(tx, categories) {
  const s = normalizeMerchant(`${tx.merchant} ${tx.description}`);
  const byName = name => categories.find(c=>c.name.toLowerCase()===name.toLowerCase())?.id || null;
  const rules = [
    [['løn','salary','salary payment'], 'Indkomst'],
    [['netflix','spotify','viaplay','mofibo','icloud','hbo','disney'], 'Abonnementer'],
    [['wolt','just eat','justeat','restaurant','cafe','café','burger','pizza'], 'Restaurant & takeaway'],
    [['netto','rema','føtex','foetex','bilka','lidl','coop','superbrugsen','meny'], 'Dagligvarer'],
    [['circle k','shell','q8','uno-x','dsb','rejsekort','metro','parking','parkering'], 'Transport'],
    [['tryg','topdanmark','alm. brand','if forsikring','forsikring'], 'Forsikring'],
    [['zalando','elgiganten','power.dk','ikea','magasin'], 'Shopping']
  ];
  for (const [words,name] of rules) if (words.some(w=>s.includes(w))) return byName(name);
  return tx.amount > 0 ? byName('Indkomst') : null;
}

async function previewCsv() {
  const f = document.querySelector('#csvFile')?.files?.[0];
  if (!f) return alert('Vælg en CSV-fil først.');
  const text = await f.text();
  const parsed = parseCsv(text);
  if (!parsed.rows.length) return alert('Ingen rækker fundet.');
  const sample = parsed.rows[0];
  const dateCol = findCol(sample,['dato','date','bogfør','valør']);
  const descCol = findCol(sample,['tekst','beskrivelse','description','merchant','modtager','postering']);
  const amountCol = findCol(sample,['beløb','amount','saldoændring','difference']);
  if (!dateCol || !descCol || !amountCol) return alert('Kunne ikke genkende kolonner for dato, beskrivelse og beløb.');

  const [categories, rules] = await Promise.all([
    q('categories',{order:'sort_order',asc:true}),
    q('category_rules',{order:'priority',asc:true})
  ]);
  const cmap = categoryMap(categories);
  const occurrences = {};
  const mapped = [];
  for (const row of parsed.rows) {
    const tx = {
      transaction_date: parseDate(row[dateCol]),
      description: String(row[descCol] || '').trim(),
      merchant: String(row[descCol] || '').trim(),
      amount: parseAmount(row[amountCol])
    };
    if (!tx.transaction_date || !tx.description || !Number.isFinite(tx.amount)) continue;
    const matched = rules.find(r=>r.enabled && ruleMatches(r,tx));
    tx.category_id = matched?.category_id || fallbackCategoryId(tx,categories);
    const base = `${tx.transaction_date}|${normalizeMerchant(tx.description)}|${Number(tx.amount).toFixed(2)}`;
    occurrences[base] = (occurrences[base] || 0) + 1;
    tx.source_hash = await sha256(`${base}|${occurrences[base]}`);
    mapped.push(tx);
  }
  parsedImport = mapped;
  parsedImportFile = { name:f.name, hash:await sha256(text) };
  parsedImportMeta = { delimiter:parsed.delimiter, columns:{date:dateCol,description:descCol,amount:amountCol} };
  const preview = document.querySelector('#preview');
  if (!mapped.length) return preview.innerHTML = '<div class="notice bad">Ingen gyldige transaktioner blev fundet i filen.</div>';
  preview.innerHTML = `<h3 style="margin-top:20px">Preview · ${mapped.length} rækker</h3>
    <div class="card"><table><thead><tr><th>Dato</th><th>Tekst</th><th>Kategori</th><th>Beløb</th></tr></thead><tbody>${mapped.slice(0,12).map(r=>`<tr><td>${r.transaction_date}</td><td>${esc(r.description)}</td><td>${esc(cmap[r.category_id]?.name||'Ukategoriseret')}</td><td>${fmt(r.amount)}</td></tr>`).join('')}</tbody></table></div>
    <button id="commitImportBtn" class="btn" onclick="commitImport()">Importér ${mapped.length} transaktioner</button>`;
}

async function commitImport() {
  if (!parsedImport.length || !parsedImportFile) return;
  const account_id = document.querySelector('#importAccount')?.value;
  if (!account_id) return alert('Opret en konto først.');
  const button = document.querySelector('#commitImportBtn');
  if (button) { button.disabled = true; button.textContent = 'Importerer…'; }

  const { data:imp, error:ierr } = await sb.from('imports').insert({
    user_id:currentUser.id,
    account_id,
    source_type:'csv',
    original_filename:parsedImportFile.name,
    file_hash:parsedImportFile.hash,
    status:'processing',
    row_count:parsedImport.length,
    metadata:{client:'github-pages', ...parsedImportMeta}
  }).select().single();

  if (ierr) {
    if (button) { button.disabled = false; button.textContent = `Importér ${parsedImport.length} transaktioner`; }
    if (ierr.code === '23505') return alert('Denne fil ser allerede ud til at være importeret til den valgte konto.');
    return alert(ierr.message);
  }

  try {
    let inserted = 0, skipped = 0;
    for (let i=0;i<parsedImport.length;i+=250) {
      const chunk = parsedImport.slice(i,i+250);
      const hashes = chunk.map(r=>r.source_hash);
      const { data:existing, error:eerr } = await sb.from('transactions').select('source_hash').eq('account_id',account_id).in('source_hash',hashes);
      if (eerr) throw eerr;
      const found = new Set((existing||[]).map(x=>x.source_hash));
      const fresh = chunk.filter(r=>!found.has(r.source_hash));
      skipped += chunk.length - fresh.length;
      if (!fresh.length) continue;
      const payload = fresh.map(r=>({...r,user_id:currentUser.id,account_id,import_id:imp.id,is_manual:false}));
      const { error } = await sb.from('transactions').insert(payload);
      if (error) throw error;
      inserted += fresh.length;
    }
    await sb.from('imports').update({
      status:'completed', imported_at:new Date().toISOString(), row_count:inserted,
      metadata:{client:'github-pages', ...parsedImportMeta, skipped_duplicates:skipped, parsed_rows:parsedImport.length}
    }).eq('id',imp.id);
    toast(`Import færdig · ${inserted} nye${skipped?` · ${skipped} dubletter sprunget over`:''}`);
    setTimeout(()=>location.href='transactions.html',900);
  } catch (error) {
    await sb.from('transactions').delete().eq('import_id',imp.id);
    await sb.from('imports').update({status:'failed',metadata:{client:'github-pages',...parsedImportMeta,error:error.message}}).eq('id',imp.id);
    if (button) { button.disabled = false; button.textContent = `Importér ${parsedImport.length} transaktioner`; }
    alert(`Importen fejlede: ${error.message}`);
  }
}

async function budget() {
  const [budgets,tx,cats] = await Promise.all([q('budgets',{order:'period_start'}),q('transactions',{limit:5000}),q('categories',{order:'sort_order',asc:true})]);
  const month = isoMonth();
  const { expenses } = flowSummary(tx,cats,month);
  const monthBudgets = budgets.filter(b=>String(b.period_start).startsWith(month));
  const plan = monthBudgets.reduce((a,b)=>a+Number(b.amount),0);
  return `<div class="toolbar"><button class="btn" onclick="showBudgetForm()">+ Budgetlinje</button></div>
    <div class="grid g3">${kpi('Planlagt',fmt(plan),'Denne måned')}${kpi('Brugt',fmt(expenses),'Fra transaktioner','bad')}${kpi('Tilbage',fmt(Math.max(0,plan-expenses)),'Råderum','good')}</div>
    <div class="card" style="margin-top:16px"><h2>Budgetlinjer</h2>${monthBudgets.map(b=>`<div class="row"><div><b>${esc(cats.find(c=>c.id===b.category_id)?.name||'Samlet budget')}</b><small>${esc(b.period_start)}</small></div><b>${fmt(b.amount)}</b></div>`).join('')||'<div class="empty">Ingen budgetter denne måned.</div>'}</div><div id="modal"></div>`;
}

async function showBudgetForm() {
  const cats = (await q('categories',{order:'sort_order',asc:true})).filter(c=>c.category_type==='expense'&&!c.is_archived);
  document.querySelector('#modal').innerHTML = `<div class="modal"><div class="modal-card"><h2>Ny budgetlinje</h2><form onsubmit="saveBudget(event)">
    <div class="field"><label>Måned</label><input id="bMonth" type="month" value="${isoMonth()}" required></div>
    <div class="field"><label>Kategori</label><select id="bCategory"><option value="">Samlet budget</option>${cats.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Beløb</label><input id="bAmount" type="number" min="0" step="0.01" required></div>
    <div class="small-actions"><button class="btn">Gem</button><button type="button" class="btn ghost" onclick="document.querySelector('#modal').innerHTML=''">Annuller</button></div>
  </form></div></div>`;
}

async function saveBudget(e) {
  e.preventDefault();
  const payload = {user_id:currentUser.id,period_start:`${document.querySelector('#bMonth').value}-01`,category_id:document.querySelector('#bCategory').value||null,amount:Number(document.querySelector('#bAmount').value)};
  const { error } = await sb.from('budgets').insert(payload);
  if (error) return alert(error.code==='23505'?'Der findes allerede en budgetlinje for denne kategori og måned.':error.message);
  toast('Budget gemt');
  await render();
}

async function subscriptions() {
  const data = await q('subscriptions',{order:'amount'});
  return listPage(data,'Ingen abonnementer fundet endnu.',x=>`<div class="row"><div><b>${esc(x.name)}</b><small>${esc(x.cadence)} · ${esc(x.status)}</small></div><b>${fmt(x.amount)}</b></div>`);
}

async function bills() {
  const data = await q('bills',{order:'due_date',asc:true});
  return listPage(data,'Ingen kommende regninger endnu.',x=>`<div class="row"><div><b>${esc(x.name)}</b><small>${esc(x.due_date)} · ${esc(x.status)}</small></div><b>${fmt(x.amount)}</b></div>`);
}

async function goals() {
  const data = await q('goals',{order:'created_at'});
  return `<div class="toolbar"><button class="btn" onclick="showGoalForm()">+ Nyt mål</button></div><div class="grid g3">${data.map(g=>{
    const pct=Math.min(100,Math.round(Number(g.current_amount||0)/Number(g.target_amount||1)*100));
    return `<div class="card"><span class="tag green">${esc(g.status)}</span><div class="kpi">${fmt(g.current_amount)}</div><h3>${esc(g.name)}</h3><div class="sub">Mål: ${fmt(g.target_amount)} · ${pct}%</div></div>`;
  }).join('')||'<div class="card empty">Ingen mål endnu.</div>'}</div><div id="modal"></div>`;
}

function showGoalForm() {
  document.querySelector('#modal').innerHTML=`<div class="modal"><div class="modal-card"><h2>Nyt mål</h2><form onsubmit="saveGoal(event)">
    <div class="field"><label>Navn</label><input id="gName" required></div>
    <div class="field"><label>Målbeløb</label><input id="gTarget" required type="number" min="1"></div>
    <div class="field"><label>Allerede sparet</label><input id="gCurrent" type="number" min="0" value="0"></div>
    <div class="field"><label>Månedlig opsparing</label><input id="gMonthly" type="number" min="0" value="0"></div>
    <div class="small-actions"><button class="btn">Gem</button><button type="button" class="btn ghost" onclick="document.querySelector('#modal').innerHTML=''">Annuller</button></div>
  </form></div></div>`;
}

async function saveGoal(e) {
  e.preventDefault();
  const { error } = await sb.from('goals').insert({
    user_id:currentUser.id,name:document.querySelector('#gName').value.trim(),
    target_amount:Number(document.querySelector('#gTarget').value),
    current_amount:Number(document.querySelector('#gCurrent').value||0),
    monthly_contribution:Number(document.querySelector('#gMonthly').value||0)
  });
  if (error) return alert(error.message);
  toast('Mål gemt');
  await render();
}

async function savings() {
  const data = await q('savings_opportunities',{order:'monthly_saving'});
  return listPage(data,'Ingen spareforslag endnu. Forslag kan senere genereres fra dine transaktioner.',x=>`<div class="row"><div><b>${esc(x.title)}</b><small>${esc(x.description||x.opportunity_type)}</small></div><b class="good">${fmt(x.monthly_saving)}/md.</b></div>`);
}

async function forecast() {
  const [tx,cats] = await Promise.all([q('transactions',{order:'transaction_date',limit:5000}),q('categories')]);
  const cmap = categoryMap(cats), months = {};
  tx.filter(t=>!isTransfer(t,cmap)).forEach(t=>{const m=String(t.transaction_date).slice(0,7);months[m]??={i:0,o:0};const a=Number(t.amount);a>=0?months[m].i+=a:months[m].o+=Math.abs(a)});
  const current = isoMonth();
  let vals = Object.entries(months).filter(([m])=>m!==current).map(([,v])=>v);
  if (!vals.length) vals = Object.values(months);
  const avg = vals.length ? vals.reduce((a,v)=>a+(v.i-v.o),0)/vals.length : 0;
  const labels=['+1 md.','+2 mdr.','+3 mdr.','+4 mdr.','+5 mdr.','+6 mdr.'];
  return `<div class="hero"><h2>Forventet månedligt netto</h2><div class="big">${fmt(avg)}</div><p>Baseret på registrerede måneders gennemsnit. Overførsler mellem egne konti ignoreres. Det er en simpel prototypefremskrivning – ikke finansiel rådgivning.</p></div><div class="grid g3">${labels.map((l,i)=>kpi(l,fmt(avg*(i+1)),'Akkumuleret ved uændret gennemsnit',avg>=0?'good':'bad')).join('')}</div>`;
}

async function health() {
  const [tx,goals,accounts,cats] = await Promise.all([q('transactions',{limit:5000}),q('goals'),q('accounts'),q('categories')]);
  const cmap=categoryMap(cats), relevant=tx.filter(t=>!isTransfer(t,cmap));
  const months=new Set(relevant.map(t=>String(t.transaction_date).slice(0,7))).size, noData=relevant.length===0;
  let score=40; score+=Math.min(20,accounts.filter(a=>!a.is_archived).length*5); score+=Math.min(15,months*3); score+=Math.min(15,goals.length*5);
  const negatives=relevant.filter(t=>Number(t.amount)<0).length, positives=relevant.filter(t=>Number(t.amount)>0).length; if(positives)score+=10; score=Math.min(100,score);
  return `<div class="grid g2"><div class="card"><h2>Økonomisk sundhedsscore</h2><div class="kpi">${noData?'—':score+'/100'}</div><p class="sub">Scoren er en transparent prototypeindikator baseret på datadækning, konti, indtægter og mål – ikke en kreditvurdering.</p></div><div class="card"><h2>Datagrundlag</h2><div class="row"><div><b>Transaktioner</b></div><b>${relevant.length}</b></div><div class="row"><div><b>Måneder med data</b></div><b>${months}</b></div><div class="row"><div><b>Konti</b></div><b>${accounts.filter(a=>!a.is_archived).length}</b></div><div class="row"><div><b>Opsparingsmål</b></div><b>${goals.length}</b></div><div class="row"><div><b>Indtægtsposteringer</b></div><b>${positives}</b></div><div class="row"><div><b>Udgiftsposteringer</b></div><b>${negatives}</b></div></div></div>`;
}

async function chat() {
  const [tx,cats]=await Promise.all([q('transactions',{order:'transaction_date',limit:5000}),q('categories')]);
  chatCache={tx,cats};
  return `<div class="card"><p class="sub">Denne version svarer lokalt ud fra dine Supabase-data. Ingen hemmelig AI-nøgle ligger i browseren.</p><div id="messages" style="min-height:360px;display:flex;flex-direction:column;gap:10px;padding:12px 0"><div class="notice">Prøv fx: “Hvad har jeg brugt denne måned?”, “Hvor mange transaktioner har jeg?” eller “Hvad er mit netto?”</div></div><div class="toolbar"><input id="chatInput" style="flex:1" placeholder="Spørg din økonomi…" onkeydown="if(event.key==='Enter')askData()"><button class="btn" onclick="askData()">Send</button></div></div>`;
}

function askData() {
  const input=document.querySelector('#chatInput'),box=document.querySelector('#messages');
  const text=input.value.trim(); if(!text)return;
  box.insertAdjacentHTML('beforeend',`<div class="notice" style="margin-left:auto">${esc(text)}</div>`); input.value='';
  const data=chatCache||{tx:[],cats:[]}, summary=flowSummary(data.tx,data.cats,isoMonth()), s=text.toLowerCase();
  let ans=s.includes('hvor mange')?`Du har ${data.tx.length} transaktioner i databasen.`:
    s.includes('netto')?`Dit registrerede netto denne måned er ${fmt(summary.net)}.`:
    s.includes('brugt')||s.includes('udgift')?`Du har registreret ${fmt(summary.expenses)} i udgifter denne måned.`:
    s.includes('indtægt')?`Du har registreret ${fmt(summary.income)} i indtægter denne måned.`:
    'Jeg kan i denne version svare på transaktionstal, månedens indtægter, udgifter og netto.';
  box.insertAdjacentHTML('beforeend',`<div class="notice good">${ans}</div>`);
}

async function reports() {
  const [tx,cats]=await Promise.all([q('transactions',{order:'transaction_date',limit:5000}),q('categories')]);
  const cmap=categoryMap(cats), months={};
  tx.filter(t=>!isTransfer(t,cmap)).forEach(t=>{const m=String(t.transaction_date).slice(0,7);months[m]??={in:0,out:0};const a=Number(t.amount);if(a>=0)months[m].in+=a;else months[m].out+=Math.abs(a)});
  const rows=Object.entries(months).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,12);
  return `<div class="card"><h2>Månedsoversigt</h2><table><thead><tr><th>Måned</th><th>Indtægt</th><th>Udgift</th><th>Netto</th></tr></thead><tbody>${rows.map(([m,v])=>`<tr><td>${m}</td><td class="good">${fmt(v.in)}</td><td class="bad">${fmt(v.out)}</td><td>${fmt(v.in-v.out)}</td></tr>`).join('')}</tbody></table>${rows.length?'':'<div class="empty">Ingen data endnu.</div>'}</div>`;
}

async function settings() {
  const [{data:{user}},{data:profile,error}] = await Promise.all([sb.auth.getUser(),sb.from('profiles').select('*').single()]);
  if (error) throw error;
  return `<div class="grid g2"><div class="card"><h2>Profil</h2><div class="field"><label>Navn</label><input id="profileName" value="${esc(profile?.full_name||'')}"></div><div class="field"><label>Email</label><input value="${esc(user.email)}" disabled></div><button class="btn" onclick="saveProfile()">Gem profil</button></div><div class="card"><h2>Datasikkerhed</h2><p class="sub">Din browser bruger kun Supabase publishable key. RLS begrænser økonomitabellerne til din bruger.</p><button class="btn ghost" onclick="logout()">Log ud</button></div></div>`;
}

async function saveProfile() {
  const { error }=await sb.from('profiles').update({full_name:document.querySelector('#profileName').value.trim()}).eq('id',currentUser.id);
  if(error)return alert(error.message); toast('Profil gemt');
}

function listPage(data,empty,renderer) { return `<div class="card">${data.map(renderer).join('')||`<div class="empty">${esc(empty)}</div>`}</div>`; }

const renderers={dashboard,accounts,transactions,import:importPage,budget,subscriptions,bills,goals,savings,forecast,health,chat,reports,settings};

async function render() {
  const content=document.querySelector('#content');
  try { content.innerHTML=await renderers[page](); }
  catch(e) { console.error(e); content.innerHTML=`<div class="notice bad"><b>Kunne ikke hente data:</b> ${esc(e.message)}</div>`; }
}

(async()=>{
  currentUser=await guard();
  if(!currentUser)return;
  sb.auth.onAuthStateChange((event)=>{ if(event==='SIGNED_OUT') location.replace('login.html'); });
  shell(currentUser);
  await render();
})();
