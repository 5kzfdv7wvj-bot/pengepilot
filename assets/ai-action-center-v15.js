// PengePilot v15 global AI action center. Plans first; writes only after explicit confirmation.
(() => {
  const P = window.pp13;
  if (!P || window.__PP15_AI_CENTER__) return;
  window.__PP15_AI_CENTER__ = true;

  let pending = null;
  let busy = false;
  const e = s => typeof esc === 'function' ? esc(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const lines = s => e(s || '').replace(/\n/g, '<br>');

  function shellHtml() {
    return `<button id="pp15Ask" class="pp15ask" type="button" onclick="pp15OpenAI()" aria-label="Spørg PengePilot"><span>✦</span> Spørg PengePilot</button>
      <div id="pp15AiBackdrop" class="pp15ai-backdrop hidden" onclick="if(event.target===this)pp15CloseAI()">
        <section class="pp15ai-sheet" role="dialog" aria-modal="true" aria-labelledby="pp15AiTitle">
          <header class="pp15ai-head"><div><div class="pp14eyebrow">PENGEPILOT AI</div><h2 id="pp15AiTitle">Hvad skal jeg hjælpe med?</h2></div><button class="pp15close" type="button" onclick="pp15CloseAI()" aria-label="Luk">×</button></header>
          <div id="pp15AiLog" class="pp15ai-log"><div class="pp15bubble ai">Jeg kan både forklare din økonomi og foreslå ændringer i PengePilot. Jeg ændrer aldrig noget, før du trykker <b>Udfør</b>.</div></div>
          <div class="pp15chips" id="pp15Chips">
            <button type="button" onclick="pp15UsePrompt('Hvor kan jeg realistisk spare mest lige nu?')">Find besparelser</button>
            <button type="button" onclick="pp15UsePrompt('Jeg skylder [navn] [beløb] kr. Overførsler til personen er afbetaling.')">Registrér gæld</button>
            <button type="button" onclick="pp15UsePrompt('Sæt mit budget for [kategori] til [beløb] kr. om måneden.')">Ret budget</button>
            <button type="button" onclick="pp15UsePrompt('Alle køb hos [butik] skal være kategorien [kategori].')">Lær kategori</button>
          </div>
          <form class="pp15ai-form" onsubmit="pp15SendAI(event)"><textarea id="pp15AiInput" rows="2" maxlength="1800" placeholder="Fx: Jeg skylder Mikkel 8.000 kr. Overførsler til Mikkel er afbetaling."></textarea><button id="pp15AiSend" class="btn" type="submit">Send</button></form>
          <p class="pp15ai-safe">PengePilot kan ændre sine egne data efter din godkendelse. Den kan aldrig overføre rigtige penge eller kontakte en modtager.</p>
        </section>
      </div>`;
  }

  function ensure() {
    if (document.querySelector('#pp15Ask')) return true;
    if (typeof currentUser === 'undefined' || !currentUser || !document.querySelector('#app')) return false;
    const host = document.createElement('div');
    host.id = 'pp15AiHost';
    host.innerHTML = shellHtml();
    document.body.appendChild(host);
    return true;
  }

  function log(html, cls = 'ai') {
    const box = document.querySelector('#pp15AiLog');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `pp15bubble ${cls}`;
    div.innerHTML = html;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  function actionList(plan) {
    if (!plan?.actions?.length) return '';
    return `<div class="pp15plan"><b>Jeg vil ændre:</b>${plan.actions.map(a => `<div class="pp15plan-action"><span>✓</span><div><b>${e(a.label)}</b><small>${e(a.detail)}</small></div></div>`).join('')}${(plan.warnings || []).map(w => `<div class="pp15plan-warning">⚠ ${e(w)}</div>`).join('')}<div class="pp15plan-buttons"><button class="btn" type="button" onclick="pp15ExecuteAI()">Udfør</button><button class="btn ghost" type="button" onclick="pp15EditAI()">Ret</button><button class="btn ghost" type="button" onclick="pp15CancelAI()">Annuller</button></div></div>`;
  }

  function setBusy(on, label = 'Arbejder…') {
    busy = on;
    const btn = document.querySelector('#pp15AiSend');
    const input = document.querySelector('#pp15AiInput');
    if (btn) { btn.disabled = on; btn.textContent = on ? label : 'Send'; }
    if (input) input.disabled = on;
  }

  window.pp15OpenAI = prompt => {
    ensure();
    document.querySelector('#pp15AiBackdrop')?.classList.remove('hidden');
    document.body.classList.add('pp15ai-open');
    const input = document.querySelector('#pp15AiInput');
    if (prompt && input) input.value = prompt;
    setTimeout(() => input?.focus(), 50);
  };
  window.pp15CloseAI = () => {
    document.querySelector('#pp15AiBackdrop')?.classList.add('hidden');
    document.body.classList.remove('pp15ai-open');
  };
  window.pp15UsePrompt = prompt => {
    const input = document.querySelector('#pp15AiInput');
    if (input) { input.value = prompt; input.focus(); }
  };

  window.pp15SendAI = async event => {
    event?.preventDefault();
    if (busy) return;
    const input = document.querySelector('#pp15AiInput');
    const message = input?.value.trim();
    if (!message) return;
    pending = null;
    log(lines(message), 'user');
    input.value = '';
    setBusy(true, 'Tænker…');
    try {
      const status = await P.aiStatus();
      if (!status.configured) {
        log('OpenAI er ikke aktiveret endnu. Når <code>OPENAI_API_KEY</code> ligger som Supabase Edge Function secret, virker handlingscenteret automatisk.');
        return;
      }
      const plan = await window.ppAI.invoke('agent_plan', { message });
      if (plan.mode === 'answer' || !plan.actions?.length) {
        log(`<div>${lines(plan.answer || plan.message || 'Jeg mangler lidt flere oplysninger.')}</div>${(plan.warnings || []).map(w => `<div class="pp15plan-warning">⚠ ${e(w)}</div>`).join('')}`);
        return;
      }
      pending = plan;
      log(`<div>${lines(plan.message || plan.answer || 'Jeg har forstået det sådan:')}</div>${actionList(plan)}`);
    } catch (error) {
      log(`<span class="bad">${e(P.err(error))}</span>`);
    } finally { setBusy(false); }
  };

  window.pp15ExecuteAI = async () => {
    if (busy || !pending?.actions?.length) return;
    setBusy(true, 'Udfører…');
    const plan = pending;
    pending = null;
    try {
      const result = await window.ppAI.invoke('agent_execute', { actions: plan.actions });
      const items = (result.results || []).map(r => `<div class="pp15result ${r.ok ? 'good' : 'bad'}">${r.ok ? '✓' : '✕'} ${e(r.summary)}</div>`).join('');
      log(`<b>${result.failed ? 'Delvist udført' : 'Udført'}</b>${items}`);
      if (typeof render === 'function') await render();
    } catch (error) {
      log(`<span class="bad">${e(P.err(error))}</span>`);
    } finally { setBusy(false); }
  };

  window.pp15EditAI = () => {
    if (!pending) return;
    const input = document.querySelector('#pp15AiInput');
    if (input) { input.value = pending.original_message || ''; input.focus(); }
    pending = null;
    log('Ret beskeden nedenfor og send den igen.', 'ai compact');
  };
  window.pp15CancelAI = () => {
    pending = null;
    log('Handlingen er annulleret. Intet blev ændret.', 'ai compact');
  };

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('#pp15AiBackdrop')?.classList.contains('hidden')) pp15CloseAI();
  });

  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    if (ensure() || tries > 200) clearInterval(timer);
  }, 50);
})();
