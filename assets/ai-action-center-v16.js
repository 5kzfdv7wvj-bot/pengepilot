// PengePilot v16 AI action center: concise coaching, explicit plans, confirmed writes only.
(() => {
  const P = window.pp13;
  if (!P || window.__PP16_AI_CENTER__) return;
  window.__PP16_AI_CENTER__ = true;

  let pending = null, busy = false;
  const e = s => typeof esc === 'function' ? esc(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const lines = s => e(s || '').replace(/\n/g, '<br>');

  function html() {
    return `<button id="pp16Ask" class="pp16ask" type="button" onclick="pp16OpenAI()" aria-label="Spørg PengePilot"><span>✦</span><span>Spørg PengePilot</span></button>
      <div id="pp16AiBackdrop" class="pp16ai-backdrop hidden" onclick="if(event.target===this)pp16CloseAI()">
        <section class="pp16ai-sheet" role="dialog" aria-modal="true" aria-labelledby="pp16AiTitle">
          <header class="pp16ai-head"><div><div class="pp16eyebrow">PENGEPILOT AI</div><h2 id="pp16AiTitle">Hvad vil du have hjælp til?</h2></div><div class="pp16ai-head-actions"><button class="pp14link" onclick="pp16ClearAI()">Ny chat</button><button class="pp16close" onclick="pp16CloseAI()" aria-label="Luk">×</button></div></header>
          <div id="pp16AiLog" class="pp16ai-log"><div class="pp16bubble ai">Spørg om din økonomi eller bed mig ændre noget i PengePilot. Hvis noget skal ændres, viser jeg altid planen først.</div></div>
          <div class="pp16chips">
            <button onclick="pp16UsePrompt('Hvad er den bedste konkrete besparelse for mig lige nu?')">Bedste besparelse</button>
            <button onclick="pp16UsePrompt('Forklar mit forbrug denne måned og hvad der skiller sig ud.')">Forklar forbrug</button>
            <button onclick="pp16UsePrompt('Jeg skylder [navn] [beløb] kr. Overførsler til personen er afbetaling.')">Registrér gæld</button>
            <button onclick="pp16UsePrompt('Sæt mit budget for [kategori] til [beløb] kr. om måneden.')">Ret budget</button>
          </div>
          <form class="pp16ai-form" onsubmit="pp16SendAI(event)"><textarea id="pp16AiInput" rows="2" maxlength="1800" placeholder="Skriv som du ville sige det…"></textarea><button id="pp16AiSend" class="btn pp16primary" type="submit">Send</button></form>
          <p class="pp16ai-safe">Ændringer kræver dit tryk på <b>Udfør</b>. PengePilot kan ikke overføre penge eller kontakte andre.</p>
        </section>
      </div>`;
  }
  function ensure() {
    if (document.querySelector('#pp16Ask')) return true;
    if (typeof currentUser === 'undefined' || !currentUser || !document.querySelector('#app')) return false;
    document.querySelector('#pp15AiHost')?.remove();
    const host = document.createElement('div'); host.id = 'pp16AiHost'; host.innerHTML = html(); document.body.appendChild(host); return true;
  }
  function log(content, cls = 'ai') {
    const box = document.querySelector('#pp16AiLog'); if (!box) return;
    const div = document.createElement('div'); div.className = `pp16bubble ${cls}`; div.innerHTML = content; box.appendChild(div); box.scrollTop = box.scrollHeight; return div;
  }
  function setBusy(on, text = 'Arbejder…') {
    busy = on; const btn = document.querySelector('#pp16AiSend'), input = document.querySelector('#pp16AiInput');
    if (btn) { btn.disabled = on; btn.textContent = on ? text : 'Send'; } if (input) input.disabled = on;
  }
  function planHtml(plan) {
    return `<div class="pp16plan"><b>Jeg foreslår:</b>${(plan.actions || []).map(a => `<div class="pp16plan-action"><span>✓</span><div><b>${e(a.label)}</b><small>${e(a.detail)}</small></div></div>`).join('')}${(plan.warnings || []).map(w => `<div class="pp16plan-warning">⚠ ${e(w)}</div>`).join('')}<div class="pp16plan-buttons"><button class="btn" onclick="pp16ExecuteAI()">Udfør</button><button class="btn ghost" onclick="pp16EditAI()">Ret</button><button class="btn ghost" onclick="pp16CancelAI()">Annuller</button></div></div>`;
  }
  function linksFor(actions = []) {
    const types = new Set(actions.map(x => x.type)); const links = [];
    if ([...types].some(x => ['set_budget','upsert_goal','update_subscription','update_bill','create_debt','update_debt','add_debt_payment'].includes(x))) links.push('<a href="savings.html" class="pp14link">Se Spar penge</a>');
    if ([...types].some(x => ['create_category_rule','recategorize','mark_transfer','set_balance_anchor'].includes(x))) links.push('<a href="transactions.html" class="pp14link">Se Forbrug</a>');
    return links.length ? `<div class="pp16result-links">${links.join('')}</div>` : '';
  }

  window.pp16OpenAI = prompt => { ensure(); document.querySelector('#pp16AiBackdrop')?.classList.remove('hidden'); document.body.classList.add('pp16ai-open'); const input = document.querySelector('#pp16AiInput'); if (prompt && input) input.value = prompt; setTimeout(() => input?.focus(), 60); };
  window.pp16CloseAI = () => { document.querySelector('#pp16AiBackdrop')?.classList.add('hidden'); document.body.classList.remove('pp16ai-open'); };
  window.pp16UsePrompt = prompt => { const input = document.querySelector('#pp16AiInput'); if (input) { input.value = prompt; input.focus(); } };
  window.pp16ClearAI = () => { pending = null; const logBox = document.querySelector('#pp16AiLog'); if (logBox) logBox.innerHTML = '<div class="pp16bubble ai">Ny samtale. Hvad vil du have hjælp til?</div>'; };

  window.pp16SendAI = async event => {
    event?.preventDefault(); if (busy) return;
    const input = document.querySelector('#pp16AiInput'), message = input?.value.trim(); if (!message) return;
    pending = null; log(lines(message), 'user'); input.value = ''; setBusy(true, 'Tænker…');
    try {
      const status = await P.aiStatus();
      if (!status.configured) return log('AI er ikke konfigureret endnu. De øvrige PengePilot-funktioner virker stadig uden AI.');
      if (!status.agent) return log('AI-backenden er online, men handlingscenteret er ikke på den nyeste version endnu.');
      const plan = await window.ppAI.invoke('agent_plan', { message });
      if (plan.mode === 'answer' || !plan.actions?.length) return log(`<div>${lines(plan.answer || plan.message || 'Jeg mangler lidt mere information.')}</div>${(plan.warnings || []).map(w => `<div class="pp16plan-warning">⚠ ${e(w)}</div>`).join('')}`);
      pending = plan; log(`<div>${lines(plan.message || 'Jeg har forstået det sådan:')}</div>${planHtml(plan)}`);
    } catch (error) { log(`<span class="bad">${e(P.err(error))}</span>`); }
    finally { setBusy(false); }
  };
  window.pp16ExecuteAI = async () => {
    if (busy || !pending?.actions?.length) return;
    const plan = pending; pending = null; setBusy(true, 'Udfører…');
    try {
      const result = await window.ppAI.invoke('agent_execute', { actions:plan.actions, confirmed:true });
      const items = (result.results || []).map(r => `<div class="pp16result ${r.ok ? 'good' : 'bad'}">${r.ok ? '✓' : '✕'} ${e(r.summary)}</div>`).join('');
      log(`<b>${result.failed ? 'Nogle handlinger kunne ikke gennemføres' : 'Færdig'}</b>${items}${linksFor(plan.actions)}`);
      if (typeof render === 'function') await render();
    } catch (error) { log(`<span class="bad">${e(P.err(error))}</span>`); }
    finally { setBusy(false); }
  };
  window.pp16EditAI = () => { if (!pending) return; const input = document.querySelector('#pp16AiInput'); if (input) { input.value = pending.original_message || ''; input.focus(); } pending = null; log('Ret beskeden og send den igen.', 'ai compact'); };
  window.pp16CancelAI = () => { pending = null; log('Annulleret. Intet blev ændret.', 'ai compact'); };

  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.querySelector('#pp16AiBackdrop')?.classList.contains('hidden')) pp16CloseAI(); });
  let tries = 0; const timer = setInterval(() => { tries++; if (ensure() || tries > 200) clearInterval(timer); }, 50);
})();
