// PengePilot savings v16: fewer, fresher and prioritized actions.
(() => {
  const P = window.pp13;
  if (!P || window.__PP16_SAVINGS__) return;
  window.__PP16_SAVINGS__ = true;

  const tokens = value => new Set(P.n(value).split(' ').filter(x => x.length > 3 && !['spare','reducer','maaned','udgift','forbrug','penge'].includes(x)));
  const overlap = (a, b) => {
    const ka = P.n(a?.evidence?.dedupe_key || ''), kb = P.n(b?.evidence?.dedupe_key || '');
    if (ka && kb && (ka === kb || ka.includes(kb) || kb.includes(ka))) return true;
    const A = tokens(`${a?.title || ''} ${a?.description || ''}`), B = tokens(`${b?.title || ''} ${b?.description || ''}`);
    if (!A.size || !B.size) return false;
    let same = 0; for (const x of A) if (B.has(x)) same++;
    return same / Math.min(A.size, B.size) >= .62;
  };
  const rank = row => Number(row.monthly_saving || 0) * Math.max(.35, Number(row.confidence || .5));
  const unique = rows => {
    const out = [];
    for (const row of [...rows].sort((a, b) => rank(b) - rank(a))) if (!out.some(x => overlap(x, row))) out.push(row);
    return out;
  };

  async function context() {
    const [tx, cats, subs, rows] = await Promise.all([
      q('transactions', { limit: 10000 }), q('categories'), q('subscriptions'), q('savings_opportunities', { limit: 500 })
    ]);
    return { tx, cats, subs, rows, fp: P.fingerprint(tx) };
  }
  const closedMonths = tx => [...new Set(tx.map(t => String(t.transaction_date).slice(0, 7)).filter(m => m && m < P.localMonth()))].sort().slice(-6);

  function localSuggestions(tx, cats, subs, fp) {
    const months = closedMonths(tx); if (!months.length) return [];
    const relevant = tx.filter(t => months.some(m => String(t.transaction_date).startsWith(m)));
    const spend = P.categorySpend(relevant, cats), divisor = months.length, suggestions = [];
    const push = (key, title, description, monthly, confidence = .7) => {
      if (monthly < 30) return;
      suggestions.push({ opportunity_type:'local_v16', title, description, monthly_saving:Math.round(monthly), confidence, status:'open', evidence:{ v16:true, fingerprint:fp, dedupe_key:key, months } });
    };
    for (const [name, total] of Object.entries(spend)) {
      const monthly = total / divisor, n = P.n(name);
      if (n.includes('restaurant')) push('cat:restaurant', 'Skær lidt ned på mad ude', `Du har brugt ca. ${fmt(monthly)}/md. i gennemsnit. Et moderat mål er 20% mindre.`, monthly * .20, .76);
      else if (n === 'shopping') push('cat:shopping', 'Sæt et enkelt loft på shopping', `Gennemsnittet er ca. ${fmt(monthly)}/md. Et loft kan gøre spontane køb mere synlige.`, monthly * .15, .64);
      else if (n.includes('gebyr')) push('cat:fees', 'Fjern gebyrer og renter', `Der er registreret ca. ${fmt(monthly)}/md. i gebyrer/renter.`, monthly * .65, .86);
    }
    const active = subs.filter(s => s.status === 'active'), fixed = active.reduce((sum, s) => sum + P.monthlyAmount(s.amount, s.cadence), 0);
    if (active.length >= 2 && fixed >= 100) push('subs:review', 'Gennemgå dine faste udgifter', `${active.length} aktive faste betalinger koster ca. ${fmt(fixed)}/md.`, Math.min(fixed * .12, 250), .66);
    return unique(suggestions);
  }

  async function replaceLocal(c) {
    const fresh = localSuggestions(c.tx, c.cats, c.subs, c.fp);
    const blockers = c.rows.filter(x => ['accepted','dismissed'].includes(x.status));
    const safe = fresh.filter(x => !blockers.some(b => overlap(x, b)));
    await sb.from('savings_opportunities').delete().in('opportunity_type', ['local_v13','local_v16']).eq('status', 'open');
    if (safe.length) {
      const r = await sb.from('savings_opportunities').insert(safe.map(x => ({ ...x, user_id: currentUser.id })));
      if (r.error) throw r.error;
    }
    return safe.length;
  }

  async function stampAiFingerprint(fp) {
    const { data, error } = await sb.from('savings_opportunities').select('id,evidence').eq('opportunity_type', 'ai_generated').eq('status', 'open');
    if (error) throw error;
    for (const row of data || []) {
      const evidence = { ...(row.evidence || {}), v16:true, fingerprint:fp };
      const update = await sb.from('savings_opportunities').update({ evidence }).eq('id', row.id);
      if (update.error) throw update.error;
    }
  }

  window.pp16RefreshSavings = async () => {
    const button = document.querySelector('#pp16refresh');
    try {
      if (button) { button.disabled = true; button.textContent = 'Analyserer…'; }
      const c = await context();
      const localCount = await replaceLocal(c);
      const status = await P.aiStatus();
      let aiCount = 0, removed = 0;
      if (status.configured && status.agent) {
        const result = await window.ppAI.invoke('savings');
        aiCount = Number(result.count || 0); removed = Number(result.removed_overlap || 0);
        await stampAiFingerprint(c.fp);
      }
      toast(`${localCount + aiCount} aktuelle forslag${removed ? ` · ${removed} overlap fjernet` : ''}`);
      render();
    } catch (error) { alert(P.err(error)); }
    finally { if (button) { button.disabled = false; button.textContent = 'Find nye forslag'; } }
  };

  window.pp16SavingStatus = async (id, status) => {
    try {
      const r = await sb.from('savings_opportunities').update({ status }).eq('id', id);
      if (r.error) throw r.error;
      toast(status === 'accepted' ? 'Forslaget er gemt som valgt' : 'Forslaget skjules fremover');
      render();
    } catch (error) { alert(P.err(error)); }
  };

  async function savings() {
    const c = await context();
    const rows = unique(c.rows);
    const fresh = row => row.status !== 'open' || (
      row.opportunity_type === 'local_v16' ? row.evidence?.fingerprint === c.fp :
      row.opportunity_type === 'local_v13' ? false :
      row.opportunity_type === 'ai_generated' ? row.evidence?.v16 === true && row.evidence?.fingerprint === c.fp : true
    );
    const open = rows.filter(x => x.status === 'open' && fresh(x));
    const stale = rows.filter(x => x.status === 'open' && !fresh(x));
    const history = rows.filter(x => ['accepted','dismissed'].includes(x.status)).slice(0, 40);
    const monthly = open.reduce((sum, x) => sum + Number(x.monthly_saving || 0), 0);
    const best = open[0] || null;
    const ai = await P.aiStatus();

    return `<div class="pp16saving-hero">
      <div><div class="pp16eyebrow">AKTUELT SPAREPOTENTIALE</div><div class="pp16saving-total good">${fmt(monthly)}/md.</div><small>${open.length} konkrete, ikke-overlappende forslag</small></div>
      <button id="pp16refresh" class="btn pp16primary" onclick="pp16RefreshSavings()">Find nye forslag</button>
    </div>
    ${stale.length ? `<div class="notice"><b>Dine data har ændret sig.</b> ${stale.length} gamle forslag er skjult, indtil analysen køres igen.</div>` : ''}
    ${!ai.configured ? '<div class="notice"><b>AI er ikke aktiv.</b> PengePilot bruger stadig den lokale analyse. Når OpenAI er konfigureret, suppleres kun med forslag, der ikke overlapper.</div>' : ''}
    ${best ? `<article class="pp16best-saving"><div><span>Bedste næste handling</span><h2>${esc(best.title)}</h2><p>${esc(best.description || '')}</p></div><div class="pp16best-value"><b class="good">${fmt(best.monthly_saving)}/md.</b><button class="btn" onclick="pp16SavingStatus('${best.id}','accepted')">Jeg gør det</button><button class="pp14link" onclick="pp16SavingStatus('${best.id}','dismissed')">Ikke relevant</button></div></article>` : ''}
    <div class="pp16saving-list">${open.slice(best ? 1 : 0).map(x => `<article class="pp16saving-card"><div><b>${esc(x.title)}</b><p>${esc(x.description || '')}</p><small>${x.opportunity_type === 'ai_generated' ? 'AI + dine data' : 'Dine data'}</small></div><div class="pp16saving-actions"><b class="good">${fmt(x.monthly_saving)}/md.</b><button class="btn ghost" onclick="pp16SavingStatus('${x.id}','accepted')">Jeg gør det</button><button class="pp14link" onclick="pp16SavingStatus('${x.id}','dismissed')">Skjul</button></div></article>`).join('') || (!best ? '<div class="card empty">Ingen aktuelle forslag. Tryk “Find nye forslag”.</div>' : '')}</div>
    ${history.length ? `<details class="pp16history"><summary>Tidligere valg (${history.length})</summary>${history.map(x => `<div class="pp16line"><div><b>${esc(x.title)}</b><small>${P.status(x.status)}</small></div><b>${fmt(x.monthly_saving)}/md.</b></div>`).join('')}</details>` : ''}`;
  }

  P.renderers.savings = savings;
})();
