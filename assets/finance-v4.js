// PengePilot finance v4: smart categorization + correctable account balance.
const pp4Norm = v => String(v||'').toLowerCase().replace(/æ/g,'ae').replace(/ø/g,'o').replace(/å/g,'a').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const pp4Cat = (cats,name) => cats.find(c=>pp4Norm(c.name)===pp4Norm(name))?.id || null;

function pp4SmartCategoryId(tx,categories,rules=[]) {
  const learned=rules.find(r=>r.enabled&&ruleMatches(r,tx));
  if(learned?.category_id) return learned.category_id;
  const s=pp4Norm(`${tx.merchant||''} ${tx.description||''}`), has=(...w)=>w.some(x=>s.includes(pp4Norm(x)));
  if(has('egen konto','egne konti','intern overførsel','intern overfoersel','overførsel til opsparing','opsparingskonto')) return pp4Cat(categories,'Opsparing');
  if(has('løn','loen','salary','payroll','wage','nettoløn','arbejdsgiver','feriepenge','dagpenge','pension','folkepension','barselsdagpenge','børnepenge')) return pp4Cat(categories,'Indkomst');
  if(has('husleje','realkredit','boliglån','mortgage','ejerforening','boligafgift','fjernvarme','norlys','andel energi','ewii')) return pp4Cat(categories,'Bolig');
  if(has('netto','rema 1000','føtex','foetex','bilka','lidl','meny','superbrugsen','brugsen','coop 365','365discount','nemlig.com')) return pp4Cat(categories,'Dagligvarer');
  if(has('wolt','just eat','mcdonald','burger king','restaurant','cafe','café','espresso house','starbucks','pizza','sushi','takeaway')) return pp4Cat(categories,'Restaurant & takeaway');
  if(has('dsb','rejsekort','metro','movia','circle k','shell','q8','uno-x','clever','easypark','apcoa','brobizz','benzin','diesel')) return pp4Cat(categories,'Transport');
  if(has('netflix','spotify','viaplay','tv2 play','tv 2 play','disney','hbo','max.com','mofibo','storytel','icloud','apple.com/bill','youtube premium','amazon prime','microsoft 365')) return pp4Cat(categories,'Abonnementer');
  if(has('tryg','topdanmark','alm brand','alm. brand','if forsikring','gjensidige','codan','forsikring')) return pp4Cat(categories,'Forsikring');
  if(has('apotek','læge','laege','tandlæge','tandlaege','hospital','fysioterapi','kiropraktor')) return pp4Cat(categories,'Sundhed');
  if(has('zalando','boozt','h&m','hm.com','magasin','elgiganten','power.dk','ikea','jysk','amazon','temu','shein','matas')) return pp4Cat(categories,'Shopping');
  if(has('fitness','puregym','sats','biograf','steam','playstation','xbox','tivoli','zoo','museum','padel','golf')) return pp4Cat(categories,'Fritid');
  if(has('sas ','norwegian','ryanair','easyjet','booking.com','airbnb','hotel','hotels.com','expedia','sunweb','spies','tui ','lufthavn')) return pp4Cat(categories,'Rejser');
  if(has('daginstitution','børnehave','boernehave','vuggestue','sfo','skole','kids-world','babysam')) return pp4Cat(categories,'Børn');
  if(has('gebyr','fee','rente','interest','overtræksrente','kortgebyr','bankgebyr')) return pp4Cat(categories,'Gebyrer & renter');
  if(Number(tx.amount)>0) return pp4Cat(categories,'Indkomst');
  return pp4Cat(categories,'Andet');
}

fallbackCategoryId = (tx,categories) => pp4SmartCategoryId(tx,categories,[]);

async function pp4CategorizeAll(force=false){
  const [tx,cats,rules]=await Promise.all([q('transactions',{order:'transaction_date',limit:10000}),q('categories',{order:'sort_order',asc:true}),q('category_rules',{order:'priority',asc:true})]);
  const cmap=categoryMap(cats), groups=new Map();
  for(const row of tx){const current=cmap[row.category_id];if(!force&&row.category_id&&current?.name!=='Andet')continue;const id=pp4SmartCategoryId(row,cats,rules);if(!id||id===row.category_id)continue;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row.id);}
  let changed=0;
  for(const [id,ids] of groups) for(let i=0;i<ids.length;i+=100){const chunk=ids.slice(i,i+100);const{error}=await sb.from('transactions').update({category_id:id}).in('id',chunk);if(error)throw error;changed+=chunk.length;}
  return changed;
}

async function pp4EnsureMigration(){
  const{data:p}=await sb.from('profiles').select('settings').eq('id',currentUser.id).single();const settings=p?.settings||{};if(Number(settings.categorization_version||0)>=4)return;
  await pp4CategorizeAll(true);await sb.from('profiles').update({settings:{...settings,categorization_version:4}}).eq('id',currentUser.id);
}

async function pp4RunCategorization(){try{const n=await pp4CategorizeAll(true);toast(n?`Kategorisering opdaterede ${n} transaktioner`:'Alle transaktioner er allerede kategoriseret');await render();}catch(e){alert(`Kategorisering fejlede: ${e.message}`);}}

changeCategory = async function(id,categoryId){
  const{data:tx,error:rerr}=await sb.from('transactions').select('merchant,description').eq('id',id).single();if(rerr)return alert(rerr.message);
  const{error}=await sb.from('transactions').update({category_id:categoryId||null}).eq('id',id);if(error)return alert(error.message);
  const pattern=String(tx?.merchant||tx?.description||'').trim();
  if(categoryId&&pattern){const{data:existing}=await sb.from('category_rules').select('id').eq('match_field','merchant').eq('match_type','exact').ilike('match_value',pattern).limit(1);if(existing?.[0])await sb.from('category_rules').update({category_id:categoryId,enabled:true,priority:1}).eq('id',existing[0].id);else{const{error:re}=await sb.from('category_rules').insert({user_id:currentUser.id,name:`Lært: ${pattern.slice(0,60)}`,match_field:'merchant',match_type:'exact',match_value:pattern,category_id:categoryId,priority:1,enabled:true});if(re&&re.code!=='23505')console.warn(re);}}
  toast('Kategori gemt · PengePilot husker valget');
};

async function pp4Transactions(){
  await pp4EnsureMigration();
  const[tx,cats]=await Promise.all([q('transactions',{order:'transaction_date',limit:5000}),q('categories',{order:'sort_order',asc:true})]);
  const options=`<option value="">Ukategoriseret</option>${cats.filter(c=>!c.is_archived).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}`;
  return `<div class="toolbar"><input id="search" placeholder="Søg…" oninput="filterRows()"><select id="categoryFilter" onchange="filterRows()"><option value="">Alle kategorier</option>${cats.map(c=>`<option>${esc(c.name)}</option>`).join('')}</select><button class="btn" onclick="pp4RunCategorization()">Kategorisér alle</button><a class="btn ghost" href="import.html">Importér bankfil</a></div><div class="notice"><b>Smart kategorisering:</b> nye importer kategoriseres automatisk. Når du retter en kategori manuelt, gemmes valget som en regel til næste gang.</div><div class="card"><table><thead><tr><th>Dato</th><th>Beskrivelse</th><th>Kategori</th><th>Beløb</th></tr></thead><tbody id="txbody">${tx.map(t=>{const select=options.replace(`value="${t.category_id||''}"`,`value="${t.category_id||''}" selected`);return`<tr><td>${esc(t.transaction_date)}</td><td>${esc(t.merchant||t.description)}</td><td><select onchange="changeCategory('${t.id}',this.value)">${select}</select></td><td class="${Number(t.amount)<0?'bad':'good'}">${fmt(t.amount)}</td></tr>`;}).join('')}</tbody></table>${tx.length?'':'<div class="empty">Ingen transaktioner endnu.</div>'}</div>`;
}

async function pp4Accounts(){
  const[accounts,tx]=await Promise.all([q('accounts',{order:'created_at'}),q('transactions',{limit:10000})]);const sums={};tx.forEach(t=>sums[t.account_id]=(sums[t.account_id]||0)+Number(t.amount));
  return `<div class="notice"><b>Kontosaldo:</b> Et transaktionsudtog indeholder ikke altid bankens aktuelle saldo. Brug “Ret saldo” én gang, hvis bankfilen kun indeholder bevægelser; derefter beregner PengePilot saldoen videre fra dine posteringer.</div><div class="toolbar"><button class="btn" onclick="showAccountForm()">+ Tilføj konto</button></div><div class="grid g3">${accounts.map(a=>{const balance=Number(a.opening_balance||0)+Number(sums[a.id]||0);return`<div class="card" style="opacity:${a.is_archived?'.6':'1'}"><span class="tag ${a.is_archived?'amber':'green'}">${a.is_archived?'Arkiveret':esc(a.account_type)}</span><div class="kpi">${fmt(balance)}</div><h3>${esc(a.name)}</h3><div class="sub">Beregnet saldo · ${esc(a.bank_name||'Ingen bank angivet')}</div><div class="small-actions" style="margin-top:12px"><button class="btn" onclick="pp4ShowBalance('${a.id}',${balance})">Ret saldo</button><button class="btn ghost" onclick="toggleAccount('${a.id}',${!a.is_archived})">${a.is_archived?'Genaktivér':'Arkivér'}</button></div></div>`;}).join('')||'<div class="card empty">Ingen konti endnu.</div>'}</div><div id="modal"></div>`;
}

function pp4ShowBalance(id,balance){document.querySelector('#modal').innerHTML=`<div class="modal"><div class="modal-card"><h2>Ret aktuel saldo</h2><p class="sub">Indtast præcis den saldo banken viser. Dine transaktioner ændres ikke.</p><form onsubmit="pp4SaveBalance(event,'${id}')"><div class="field"><label>Aktuel saldo</label><input id="pp4Balance" type="number" step="0.01" required value="${Number(balance).toFixed(2)}"></div><div class="small-actions"><button class="btn">Gem saldo</button><button type="button" class="btn ghost" onclick="document.querySelector('#modal').innerHTML=''">Annuller</button></div></form></div></div>`;}
async function pp4SaveBalance(e,id){e.preventDefault();const desired=Number(document.querySelector('#pp4Balance').value),{data:rows,error}=await sb.from('transactions').select('amount').eq('account_id',id);if(error)return alert(error.message);const movement=(rows||[]).reduce((s,r)=>s+Number(r.amount||0),0),{error:ue}=await sb.from('accounts').update({opening_balance:desired-movement}).eq('id',id);if(ue)return alert(ue.message);toast('Saldo er rettet');await render();}

const pp4Dashboard=renderers.dashboard;renderers.dashboard=async()=>{await pp4EnsureMigration();return pp4Dashboard();};
renderers.transactions=pp4Transactions;renderers.accounts=pp4Accounts;
