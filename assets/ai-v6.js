// PengePilot AI v6: secure client for the authenticated Supabase Edge Function.

async function pp6Invoke(action, payload = {}) {
  const { data, error } = await sb.functions.invoke('pengepilot-ai', {
    body: { action, ...payload }
  });
  if (error) {
    let message = error.message || 'AI-kaldet fejlede.';
    try {
      if (error.context && typeof error.context.json === 'function') {
        const detail = await error.context.json();
        message = detail?.error || detail?.message || message;
      }
    } catch {}
    if (/404|not found|function/i.test(message)) {
      message = 'PengePilot AI Edge Function er ikke deployet i Supabase endnu.';
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function pp6CategorizeUnknown() {
  const button = document.querySelector('#pp6CategorizeBtn');
  if (button) { button.disabled = true; button.textContent = 'Kategoriserer…'; }
  try {
    // Learned rules and local deterministic rules always get first chance.
    if (typeof pp4CategorizeAll === 'function') await pp4CategorizeAll(false);

    const [tx, cats] = await Promise.all([
      q('transactions', { order: 'transaction_date', limit: 5000 }),
      q('categories', { order: 'sort_order', asc: true })
    ]);
    const otherId = cats.find(c => pp6Norm(c.name) === 'andet')?.id || null;
    const unknown = tx.filter(t => !t.category_id || (otherId && t.category_id === otherId));
    if (!unknown.length) {
      toast('Ingen ukendte transaktioner tilbage');
      return;
    }

    const ids = unknown.slice(0, 200).map(t => t.id);
    let changed = 0, ai = 0, learned = 0, remaining = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const result = await pp6Invoke('categorize', { transaction_ids: ids.slice(i, i + 50) });
      changed += Number(result.changed || 0);
      ai += Number(result.ai || 0);
      learned += Number(result.learned || 0);
      remaining += Number(result.remaining || 0);
    }
    const extra = unknown.length > ids.length ? ` · ${unknown.length - ids.length} afventer næste kørsel` : (remaining ? ` · ${remaining} blev fortsat Andet` : '');
    toast(`Kategorisering færdig · ${changed} ændret (${learned} lærte regler · ${ai} AI)${extra}`);
    await render();
  } catch (error) {
    alert(`AI-kategorisering fejlede: ${error.message}`);
  } finally {
    if (button) { button.disabled = false; button.textContent = 'AI-kategorisér ukendte'; }
  }
}

function pp6Norm(v) {
  return String(v ?? '').toLowerCase().replace(/æ/g,'ae').replace(/ø/g,'o').replace(/å/g,'a').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}

if (typeof renderers !== 'undefined' && renderers.transactions) {
  const pp6TransactionsBase = renderers.transactions;
  renderers.transactions = async function () {
    const base = await pp6TransactionsBase();
    return `<div class="notice"><b>Rigtig AI-kategorisering:</b> PengePilot bruger først dine lærte regler og den lokale kategoriseringsmotor. Kun posteringer, der stadig står som Andet/ukategoriseret, sendes til den sikre Edge Function.<div class="small-actions" style="margin-top:10px"><button id="pp6CategorizeBtn" class="btn" onclick="pp6CategorizeUnknown()">AI-kategorisér ukendte</button></div></div>${base}`;
  };
}

function pp6ChatBubble(text, mine = false, bad = false) {
  const klass = bad ? 'notice bad' : mine ? 'notice' : 'notice good';
  return `<div class="${klass}" style="${mine ? 'margin-left:auto;max-width:82%' : 'max-width:90%'}">${esc(String(text)).replace(/\n/g,'<br>')}</div>`;
}

async function pp6AskFinance(prefill = '') {
  const input = document.querySelector('#pp6ChatInput');
  const box = document.querySelector('#pp6Messages');
  const question = String(prefill || input?.value || '').trim();
  if (!question || !box) return;
  if (input) input.value = '';
  box.insertAdjacentHTML('beforeend', pp6ChatBubble(question, true));
  const waitingId = `pp6wait${Date.now()}`;
  box.insertAdjacentHTML('beforeend', `<div id="${waitingId}" class="notice">PengePilot AI analyserer dine økonomidata…</div>`);
  box.scrollTop = box.scrollHeight;
  try {
    const result = await pp6Invoke('explain', { question });
    document.querySelector(`#${waitingId}`)?.remove();
    box.insertAdjacentHTML('beforeend', pp6ChatBubble(`${result.answer}\n\nModel: ${result.model}`));
  } catch (error) {
    document.querySelector(`#${waitingId}`)?.remove();
    box.insertAdjacentHTML('beforeend', pp6ChatBubble(error.message, false, true));
  }
  box.scrollTop = box.scrollHeight;
}

async function pp6Chat() {
  return `<div class="card"><h2>PengePilot AI</h2><p class="sub">AI'en kører via en autentificeret Supabase Edge Function. Den får et kompakt økonomioverblik fra dine egne RLS-beskyttede data og OpenAI-nøglen ligger kun server-side.</p>
    <div class="toolbar" style="margin-top:12px"><button class="btn ghost" onclick="pp6AskFinance('Hvad bruger jeg flest penge på, og hvorfor?')">Forklar mit forbrug</button><button class="btn ghost" onclick="pp6AskFinance('Hvordan ser mit månedlige råderum ud?')">Mit råderum</button><button class="btn ghost" onclick="pp6AskFinance('Hvilke udgifter skiller sig mest ud?')">Udgifter der skiller sig ud</button></div>
    <div id="pp6Messages" style="min-height:360px;max-height:62vh;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:12px 0"><div class="notice good">Spørg fx: “Hvorfor er mit forbrug højt denne måned?”, “Hvad bruger jeg på takeaway?” eller “Hvor kan jeg realistisk spare 2.000 kr. om måneden?”</div></div>
    <div class="toolbar"><input id="pp6ChatInput" style="flex:1" placeholder="Spørg PengePilot AI…" onkeydown="if(event.key==='Enter')pp6AskFinance()"><button class="btn" onclick="pp6AskFinance()">Send til AI</button></div>
  </div>`;
}

if (typeof renderers !== 'undefined' && renderers.chat) {
  renderers.chat = pp6Chat;
}

async function pp6GenerateSavings() {
  const button = document.querySelector('#pp6SavingsBtn');
  if (button) { button.disabled = true; button.textContent = 'AI analyserer…'; }
  try {
    const result = await pp6Invoke('savings');
    toast(`AI genererede ${result.count || 0} personlige spareforslag`);
    await render();
  } catch (error) {
    alert(`AI-spareanalyse fejlede: ${error.message}`);
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Generér AI-spareforslag'; }
  }
}

if (typeof renderers !== 'undefined' && renderers.savings) {
  const pp6SavingsBase = renderers.savings;
  renderers.savings = async function () {
    const base = await pp6SavingsBase();
    return `<div class="notice"><b>AI-spareanalyse:</b> OpenAI får primært aggregerede kategori-, merchant-, abonnements-, budget- og mål-data — ikke din originale bankfil. Forslagene gemmes som almindelige Penge fundet-forslag, så de kan accepteres eller afvises.<div class="small-actions" style="margin-top:10px"><button id="pp6SavingsBtn" class="btn" onclick="pp6GenerateSavings()">Generér AI-spareforslag</button></div></div>${base}`;
  };
}
