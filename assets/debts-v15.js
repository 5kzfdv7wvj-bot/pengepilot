// PengePilot v15 debt tracking: manual fallback + automatic transaction matching.
(() => {
  const P = window.pp13;
  if (!P || window.__PP15_DEBTS__) return;
  window.__PP15_DEBTS__ = true;
  const S = P.state;

  async function debtData() {
    const [d, p] = await Promise.all([
      sb.from('debts').select('*').order('created_at', { ascending: false }),
      sb.from('debt_payments').select('*').order('payment_date', { ascending: false })
    ]);
    if (d.error) throw d.error;
    if (p.error) throw p.error;
    S.debts = d.data || [];
    S.debtPayments = p.data || [];
    return { debts: S.debts, payments: S.debtPayments };
  }

  const paidFor = (id, payments) => payments.filter(x => x.debt_id === id).reduce((s, x) => s + Number(x.amount || 0), 0);
  const pct = (paid, original) => Math.max(0, Math.min(100, Math.round(paid / Math.max(1, Number(original || 0)) * 100)));

  async function debtsRenderer() {
    let data;
    try {
      data = await debtData();
    } catch (error) {
      const message = String(error?.message || '');
      if (/relation .*debts.* does not exist|schema cache|could not find the table/i.test(message)) {
        return '<div class="notice"><b>Gældsfunktionen er klar i koden, men databasen mangler migrationen.</b> Anvend Supabase-migrationen for at aktivere gæld og afdrag.</div>';
      }
      throw error;
    }

    const { debts, payments } = data;
    const active = debts.filter(d => d.status !== 'cancelled');
    const totalOriginal = active.reduce((s, d) => s + Number(d.original_amount || 0), 0);
    const totalPaid = active.reduce((s, d) => s + paidFor(d.id, payments), 0);
    const remaining = Math.max(0, totalOriginal - totalPaid);

    return `<div class="pp15debt-head">
      <div><div class="pp14eyebrow">GÆLD TIL PERSONER</div><div class="pp15debt-total">${fmt(remaining)}</div><div class="sub">Restgæld efter registrerede og matchede afdrag</div></div>
      <button class="btn" onclick="pp15DebtForm()">+ Tilføj gæld</button>
    </div>
    <div class="pp15debt-summary">
      <div><span>Oprindeligt</span><b>${fmt(totalOriginal)}</b></div>
      <div><span>Afdrag</span><b class="good">${fmt(totalPaid)}</b></div>
      <div><span>Aktive</span><b>${active.filter(d => d.status === 'active').length}</b></div>
    </div>
    <div class="pp15debt-list">${debts.map(d => {
      const rows = payments.filter(x => x.debt_id === d.id);
      const paid = paidFor(d.id, payments);
      const left = Math.max(0, Number(d.original_amount || 0) - paid);
      const progress = pct(paid, d.original_amount);
      return `<article class="pp15debt ${d.status === 'cancelled' ? 'pp13muted' : ''}">
        <div class="pp15debt-row"><div><h3>${esc(d.person_name)}</h3><div class="sub">Matcher “${esc(d.match_text)}” i bankoverførsler · ${P.status(d.status)}</div></div><b>${fmt(left)} tilbage</b></div>
        <div class="pp13progress"><span style="width:${progress}%"></span></div>
        <div class="pp15debt-meta"><span>${fmt(paid)} afdraget</span><span>${rows.length} betaling${rows.length === 1 ? '' : 'er'}</span><span>${progress}%</span></div>
        ${d.note ? `<p class="sub">${esc(d.note)}</p>` : ''}
        ${rows.length ? `<details><summary>Seneste afdrag</summary>${rows.slice(0, 5).map(r => `<div class="pp15payment"><span>${P.dateLabel(r.payment_date)} · ${r.source === 'transaction' ? 'bank' : 'manuel'}</span><b>${fmt(r.amount)}</b></div>`).join('')}</details>` : ''}
        <div class="pp15debt-actions">
          ${d.status !== 'cancelled' ? `<button class="btn ghost" onclick="pp15DebtPaymentForm('${d.id}')">+ Afdrag</button><button class="btn ghost" onclick="pp15SyncDebt('${d.id}')">Find bankafdrag</button>` : ''}
          <button class="btn ghost" onclick="pp15DebtForm('${d.id}')">Redigér</button>
          ${d.status === 'active' ? `<button class="pp14link pp13danger" onclick="pp15DebtStatus('${d.id}','cancelled')">Luk gæld</button>` : d.status === 'cancelled' ? `<button class="pp14link" onclick="pp15DebtStatus('${d.id}','active')">Genåbn</button>` : ''}
        </div>
      </article>`;
    }).join('') || '<div class="card empty">Ingen gæld registreret. Du kan fx skrive til PengePilot: “Jeg skylder Mikkel 8.000 kr.”</div>'}</div><div id="modal"></div>`;
  }

  window.pp15DebtForm = id => {
    const d = (S.debts || []).find(x => x.id === id) || {};
    document.querySelector('#modal').innerHTML = `<div class="modal"><div class="modal-card"><h2>${id ? 'Redigér gæld' : 'Ny gæld'}</h2>
      <form onsubmit="pp15SaveDebt(event,'${id || ''}')">
        <div class="field"><label>Person</label><input id="pp15dp" required value="${esc(d.person_name || '')}" placeholder="Mikkel"></div>
        <div class="field"><label>Oprindeligt beløb</label><input id="pp15da" type="number" min="0.01" step="0.01" required value="${d.original_amount ?? ''}"></div>
        <div class="field"><label>Tekst der matcher bankoverførsler</label><input id="pp15dm" required minlength="3" value="${esc(d.match_text || d.person_name || '')}" placeholder="Mikkel"><small>Kun negative bankposteringer med denne tekst kan blive afdrag. Ved tvetydige matches sker der ingen automatisk kobling.</small></div>
        <div class="field"><label>Note</label><input id="pp15dn" value="${esc(d.note || '')}" placeholder="Valgfrit"></div>
        <div class="small-actions"><button class="btn">Gem</button><button type="button" class="btn ghost" onclick="document.querySelector('#modal').innerHTML=''">Annuller</button></div>
      </form></div></div>`;
  };

  window.pp15SaveDebt = async (event, id) => {
    event.preventDefault();
    try {
      const person = document.querySelector('#pp15dp').value.trim();
      const amount = Number(document.querySelector('#pp15da').value);
      const matchText = document.querySelector('#pp15dm').value.trim();
      if (!person || !Number.isFinite(amount) || amount <= 0 || matchText.length < 3) throw new Error('Udfyld person, beløb og mindst 3 tegn som matchtekst.');
      const payload = { person_name: person, original_amount: amount, match_text: matchText, note: document.querySelector('#pp15dn').value.trim() || null };
      let debtId = id;
      if (id) {
        const r = await sb.from('debts').update(payload).eq('id', id).select('id').single();
        if (r.error) throw r.error;
      } else {
        const r = await sb.from('debts').insert({ ...payload, user_id: currentUser.id, status: 'active' }).select('id').single();
        if (r.error) throw r.error;
        debtId = r.data.id;
      }
      const sync = await sb.rpc('sync_debt_payments', { p_debt_id: debtId });
      if (sync.error) throw sync.error;
      document.querySelector('#modal').innerHTML = '';
      toast(`${id ? 'Gæld opdateret' : 'Gæld oprettet'} · ${Number(sync.data || 0)} bankafdrag matchet`);
      await render();
    } catch (error) { alert(P.err(error)); }
  };

  window.pp15DebtPaymentForm = id => {
    const d = (S.debts || []).find(x => x.id === id);
    document.querySelector('#modal').innerHTML = `<div class="modal"><div class="modal-card"><h2>Registrér afdrag · ${esc(d?.person_name || '')}</h2>
      <form onsubmit="pp15SaveDebtPayment(event,'${id}')">
        <div class="field"><label>Beløb</label><input id="pp15pa" type="number" min="0.01" step="0.01" required></div>
        <div class="field"><label>Dato</label><input id="pp15pd" type="date" value="${P.localDate()}" required></div>
        <div class="field"><label>Note</label><input id="pp15pn" placeholder="Fx kontant"></div>
        <div class="small-actions"><button class="btn">Gem afdrag</button><button type="button" class="btn ghost" onclick="document.querySelector('#modal').innerHTML=''">Annuller</button></div>
      </form></div></div>`;
  };

  window.pp15SaveDebtPayment = async (event, debtId) => {
    event.preventDefault();
    try {
      const amount = Number(document.querySelector('#pp15pa').value);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Indtast et positivt afdragsbeløb.');
      const r = await sb.from('debt_payments').insert({ user_id: currentUser.id, debt_id: debtId, amount, payment_date: document.querySelector('#pp15pd').value, source: 'manual', note: document.querySelector('#pp15pn').value.trim() || null });
      if (r.error) throw r.error;
      document.querySelector('#modal').innerHTML = '';
      toast('Afdrag registreret');
      await render();
    } catch (error) { alert(P.err(error)); }
  };

  window.pp15SyncDebt = async id => {
    try {
      const r = await sb.rpc('sync_debt_payments', { p_debt_id: id });
      if (r.error) throw r.error;
      toast(`${Number(r.data || 0)} nye bankafdrag fundet`);
      await render();
    } catch (error) { alert(P.err(error)); }
  };

  window.pp15DebtStatus = async (id, status) => {
    if (status === 'cancelled' && !confirm('Luk gælden? Historikken bevares, men nye bankoverførsler matches ikke automatisk.')) return;
    try {
      const r = await sb.from('debts').update({ status }).eq('id', id);
      if (r.error) throw r.error;
      toast(status === 'cancelled' ? 'Gæld lukket' : 'Gæld genåbnet');
      await render();
    } catch (error) { alert(P.err(error)); }
  };

  P.renderers.debts = debtsRenderer;
})();
