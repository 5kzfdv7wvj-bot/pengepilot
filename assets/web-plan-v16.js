// PengePilot plan v16: simple budgets, goals and fixed costs with fewer controls.
(() => {
  const P = window.pp13;
  if (!P || window.__PP16_PLAN__) return;
  window.__PP16_PLAN__ = true;
  const S = P.state;
  S.budgetMonth ||= P.localMonth();

  const avg = values => values.length ? values.reduce((s, v) => s + Number(v || 0), 0) / values.length : 0;
  const median = values => {
    const a = values.map(Number).sort((x, y) => x - y);
    return a.length ? (a.length % 2 ? a[a.length >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : 0;
  };

  function spendByCategory(tx, cats, month) {
    const map = P.categoryMap(cats), out = {};
    for (const t of tx) {
      if (!String(t.transaction_date).startsWith(month)) continue;
      const kind = P.kind(t, map), amount = Number(t.amount || 0), id = t.category_id || 'unknown';
      if (kind === 'income' || kind === 'transfer') continue;
      out[id] = (out[id] || 0) + (kind === 'expense' ? -amount : Math.max(0, -amount));
    }
    for (const key of Object.keys(out)) out[key] = Math.max(0, out[key]);
    return out;
  }

  function effectiveBudget(row, all, tx, cats, month) {
    let amount = Number(row.amount || 0), rollover = 0;
    if (row.rollover) {
      const previous = P.shiftMonth(month, -1);
      const prev = all.find(x => String(x.period_start).startsWith(previous) && (x.category_id || null) === (row.category_id || null));
      if (prev) {
        const spend = spendByCategory(tx, cats, previous);
        const used = row.category_id ? (spend[row.category_id] || 0) : Object.values(spend).reduce((s, v) => s + v, 0);
        rollover = Math.max(0, Number(prev.amount || 0) - used);
        amount += rollover;
      }
    }
    return { amount, rollover };
  }

  async function budget() {
    const [all, tx, cats] = await Promise.all([
      q('budgets', { order: 'period_start' }),
      q('transactions', { limit: 10000 }),
      q('categories', { order: 'sort_order', asc: true })
    ]);
    S.budgets = all;
    const month = S.budgetMonth || P.localMonth();
    const rows = all.filter(x => String(x.period_start).startsWith(month));
    const spend = spendByCategory(tx, cats, month);
    const totalSpent = Object.values(spend).reduce((s, v) => s + v, 0);
    const effective = new Map(rows.map(x => [x.id, effectiveBudget(x, all, tx, cats, month)]));
    const overall = rows.find(x => !x.category_id) || null;
    const categoryRows = rows.filter(x => x.category_id);
    const overallLimit = overall ? effective.get(overall.id).amount : categoryRows.reduce((sum, x) => sum + effective.get(x.id).amount, 0);
    const left = overallLimit ? overallLimit - totalSpent : null;

    return `<div class="pp16monthbar pp16budget-month">
      <button class="pp16iconbtn" onclick="pp16BudgetMonth(-1)" aria-label="Forrige måned">←</button>
      <div><b>${esc(P.monthLabel(month))}</b><small>${overall ? 'Samlet budget aktivt' : categoryRows.length ? 'Kategoribudgetter' : 'Intet budget endnu'}</small></div>
      <button class="pp16iconbtn" onclick="pp16BudgetMonth(1)" aria-label="Næste måned">→</button>
    </div>
    ${overallLimit ? `<div class="pp16budget-hero"><div><span>Tilbage i budget</span><b class="${left >= 0 ? 'good' : 'bad'}">${fmt(left)}</b><small>${fmt(totalSpent)} brugt af ${fmt(overallLimit)}</small></div><div class="pp13progress"><span style="width:${Math.min(100, Math.max(0, totalSpent / Math.max(1, overallLimit) * 100))}%"></span></div></div>` : `<div class="pp16empty-action"><div><b>Start enkelt</b><p>Sæt én samlet ramme for måneden. Tilføj kun kategoribudgetter, hvis du faktisk har brug for dem.</p></div><button class="btn" onclick="pp16BudgetForm('',true)">Sæt månedsbudget</button></div>`}
    <div class="pp16section-head"><div><h3>Budgetrammer</h3><small>Samlet budget er hovedrammen. Kategorier er valgfrie delgrænser.</small></div><button class="btn ghost" onclick="pp16BudgetForm()">+ Kategori</button></div>
    <div class="pp16simple-list">
      ${overall ? renderBudgetRow(overall, cats, spend, effective.get(overall.id), totalSpent, true) : ''}
      ${categoryRows.map(row => renderBudgetRow(row, cats, spend, effective.get(row.id), totalSpent, false)).join('')}
      ${!rows.length ? '<div class="empty">Ingen budgetrammer denne måned.</div>' : ''}
    </div>
    <div class="pp16actions-row"><button class="pp14link" onclick="pp16CopyBudget()">Kopiér forrige måned</button></div><div id="modal"></div>`;
  }

  function renderBudgetRow(row, cats, spend, effective, totalSpent, overall) {
    const name = overall ? 'Samlet månedsbudget' : (cats.find(c => c.id === row.category_id)?.name || 'Ukendt kategori');
    const used = overall ? totalSpent : (spend[row.category_id] || 0);
    const pct = effective.amount ? Math.round(used / effective.amount * 100) : 0;
    return `<div class="pp16plan-row"><div><b>${esc(name)}</b><small>${fmt(used)} af ${fmt(effective.amount)}${effective.rollover ? ` · ${fmt(effective.rollover)} overført` : ''}</small><div class="pp13progress"><span style="width:${Math.min(100, Math.max(0, pct))}%"></span></div></div><div class="pp16row-actions"><b class="${pct <= 100 ? '' : 'bad'}">${pct}%</b><button class="pp14link" onclick="pp16BudgetForm('${row.id}')">Redigér</button><button class="pp14link pp13danger" onclick="pp16BudgetDelete('${row.id}')">Slet</button></div></div>`;
  }

  window.pp16BudgetMonth = delta => { S.budgetMonth = P.shiftMonth(S.budgetMonth || P.localMonth(), delta); render(); };
  window.pp16BudgetForm = async (id = '', overall = false) => {
    const cats = await q('categories', { order: 'sort_order', asc: true });
    const row = (S.budgets || []).find(x => x.id === id) || {};
    const forceOverall = overall || (id && !row.category_id);
    document.querySelector('#modal').innerHTML = `<div class="modal"><div class="modal-card"><h2>${id ? 'Redigér budget' : forceOverall ? 'Månedsbudget' : 'Kategoribudget'}</h2><form onsubmit="pp16BudgetSave(event,'${id}')">
      <div class="field"><label>Måned</label><input id="p16bm" type="month" value="${String(row.period_start || S.budgetMonth || P.localMonth()).slice(0, 7)}" required></div>
      <div class="field"><label>Type</label><select id="p16bc" ${forceOverall ? 'disabled' : ''}><option value="">Samlet månedsbudget</option>${cats.filter(c => c.category_type === 'expense' && !c.is_archived).map(c => `<option value="${c.id}" ${c.id === row.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Beløb</label><input id="p16ba" type="number" min="1" step="0.01" required value="${row.amount ?? ''}" placeholder="5000"></div>
      <label class="pp16checkline"><input id="p16br" type="checkbox" ${row.rollover ? 'checked' : ''}> Overfør ubrugt beløb fra samme ramme i forrige måned</label>
      <div class="small-actions"><button class="btn">Gem</button><button type="button" class="btn ghost" onclick="document.querySelector('#modal').innerHTML=''">Annuller</button></div>
    </form></div></div>`;
  };
  window.pp16BudgetSave = async (event, id) => {
    event.preventDefault();
    try {
      const month = document.querySelector('#p16bm').value;
      const amount = Number(document.querySelector('#p16ba').value);
      const category = document.querySelector('#p16bc').disabled ? null : (document.querySelector('#p16bc').value || null);
      if (!month || !Number.isFinite(amount) || amount <= 0) throw new Error('Indtast et positivt budgetbeløb.');
      const duplicate = (S.budgets || []).find(x => x.id !== id && String(x.period_start).startsWith(month) && (x.category_id || null) === category);
      if (duplicate) throw new Error(category ? 'Der findes allerede et budget for denne kategori i måneden.' : 'Der findes allerede et samlet månedsbudget.');
      const payload = { user_id: currentUser.id, period_start: `${month}-01`, category_id: category, amount, rollover: document.querySelector('#p16br').checked };
      const result = id ? await sb.from('budgets').update(payload).eq('id', id) : await sb.from('budgets').insert(payload);
      if (result.error) throw result.error;
      document.querySelector('#modal').innerHTML = '';
      toast('Budget gemt');
      render();
    } catch (error) { alert(P.err(error)); }
  };
  window.pp16BudgetDelete = async id => {
    if (!confirm('Slet denne budgetramme?')) return;
    const result = await sb.from('budgets').delete().eq('id', id);
    if (result.error) return alert(P.err(result.error));
    toast('Budget slettet'); render();
  };
  window.pp16CopyBudget = async () => {
    try {
      const all = await q('budgets');
      const to = S.budgetMonth || P.localMonth(), from = P.shiftMonth(to, -1);
      const source = all.filter(x => String(x.period_start).startsWith(from));
      const existing = new Set(all.filter(x => String(x.period_start).startsWith(to)).map(x => x.category_id || 'all'));
      const rows = source.filter(x => !existing.has(x.category_id || 'all')).map(x => ({ user_id: currentUser.id, period_start: `${to}-01`, category_id: x.category_id, amount: x.amount, rollover: x.rollover }));
      if (!source.length) return alert('Der er intet budget i forrige måned.');
      if (!rows.length) return alert('Budgettet er allerede kopieret.');
      const result = await sb.from('budgets').insert(rows);
      if (result.error) throw result.error;
      toast(`${rows.length} budgetrammer kopieret`); render();
    } catch (error) { alert(P.err(error)); }
  };

  function subscriptionCandidates(tx, subscriptions) {
    const groups = {};
    for (const t of tx) {
      if (Number(t.amount) >= 0) continue;
      const raw = t.merchant || t.description || '', key = P.n(raw);
      if (!key || /(mobilepay|mobile pay|mob pay|overforsel|overførsel|kontant)/.test(key)) continue;
      (groups[key] ||= []).push(t);
    }
    const out = [];
    for (const [key, rows] of Object.entries(groups)) {
      if (rows.length < 3 || subscriptions.some(s => P.n(s.merchant_pattern || s.name) === key)) continue;
      rows.sort((a, b) => String(a.transaction_date).localeCompare(String(b.transaction_date)));
      const gaps = rows.slice(1).map((x, i) => Math.abs((new Date(x.transaction_date) - new Date(rows[i].transaction_date)) / 86400000));
      const mid = median(gaps);
      const cadence = mid >= 25 && mid <= 36 ? 'monthly' : mid >= 80 && mid <= 100 ? 'quarterly' : mid >= 330 && mid <= 400 ? 'yearly' : mid >= 6 && mid <= 8 ? 'weekly' : null;
      const values = rows.map(x => Math.abs(Number(x.amount))), mean = avg(values);
      const stable = mean > 0 && Math.max(...values.map(x => Math.abs(x - mean) / mean)) <= .12;
      if (cadence && stable) out.push({ key, name: rows.at(-1).merchant || rows.at(-1).description, amount: mean, cadence, category_id: rows.at(-1).category_id, last: rows.at(-1).transaction_date, next: P.nextDate(rows.at(-1).transaction_date, cadence), count: rows.length });
    }
    return out.sort((a, b) => P.monthlyAmount(b.amount, b.cadence) - P.monthlyAmount(a.amount, a.cadence));
  }

  async function subscriptions() {
    const [subs, tx] = await Promise.all([q('subscriptions', { order: 'name', asc: true }), q('transactions', { limit: 10000 })]);
    S.subscriptions = subs;
    S.subscriptionCandidates = subscriptionCandidates(tx, subs);
    const active = subs.filter(x => x.status === 'active');
    const monthly = active.reduce((sum, x) => sum + P.monthlyAmount(x.amount, x.cadence), 0);
    return `<div class="pp16fixed-hero"><div><span>Faste udgifter</span><b>${fmt(monthly)}/md.</b><small>${active.length} aktive betalinger</small></div><button class="btn" onclick="pp16SubscriptionForm()">+ Fast udgift</button></div>
      ${S.subscriptionCandidates.length ? `<div class="notice pp16candidate"><div><b>${S.subscriptionCandidates.length} mulige faste betalinger fundet</b><small>Godkend kun dem, der reelt er tilbagevendende.</small></div></div><div class="pp16simple-list">${S.subscriptionCandidates.slice(0, 5).map((c, i) => `<div class="pp16plan-row"><div><b>${esc(c.name)}</b><small>${c.count} lignende · ca. ${fmt(c.amount)} · ${P.cadence(c.cadence)}</small></div><button class="btn ghost" onclick="pp16ApproveSubscription(${i})">Godkend</button></div>`).join('')}</div>` : ''}
      <div class="pp16section-head"><div><h3>Aktive</h3><small>Sorterede efter månedlig omkostning.</small></div></div>
      <div class="pp16simple-list">${[...active].sort((a, b) => P.monthlyAmount(b.amount, b.cadence) - P.monthlyAmount(a.amount, a.cadence)).map(s => `<div class="pp16plan-row"><div><b>${esc(s.name)}</b><small>${P.cadence(s.cadence)}${s.next_payment_date ? ` · næste ${P.dateLabel(s.next_payment_date)}` : ''}</small></div><div class="pp16row-actions"><b>${fmt(P.monthlyAmount(s.amount, s.cadence))}/md.</b><button class="pp14link" onclick="pp16SubscriptionForm('${s.id}')">Redigér</button></div></div>`).join('') || '<div class="empty">Ingen aktive faste udgifter.</div>'}</div>
      ${subs.some(x => x.status !== 'active') ? `<details class="pp16history"><summary>Pausede og opsagte (${subs.filter(x => x.status !== 'active').length})</summary>${subs.filter(x => x.status !== 'active').map(s => `<div class="pp16line"><span>${esc(s.name)} · ${P.status(s.status)}</span><button class="pp14link" onclick="pp16SubscriptionForm('${s.id}')">Redigér</button></div>`).join('')}</details>` : ''}<div id="modal"></div>`;
  }

  window.pp16ApproveSubscription = async index => {
    try {
      const c = S.subscriptionCandidates[index]; if (!c) return;
      const r = await sb.from('subscriptions').insert({ user_id: currentUser.id, name: c.name, merchant_pattern: c.name, amount: Math.round(c.amount * 100) / 100, cadence: c.cadence, category_id: c.category_id, next_payment_date: c.next, status: 'active', source: 'detected', last_seen: c.last });
      if (r.error) throw r.error; toast('Fast udgift godkendt'); render();
    } catch (error) { alert(P.err(error)); }
  };
  window.pp16SubscriptionForm = id => {
    const s = (S.subscriptions || []).find(x => x.id === id) || {};
    document.querySelector('#modal').innerHTML = `<div class="modal"><div class="modal-card"><h2>${id ? 'Redigér fast udgift' : 'Ny fast udgift'}</h2><form onsubmit="pp16SaveSubscription(event,'${id || ''}')">
      <div class="field"><label>Navn</label><input id="p16sn" required value="${esc(s.name || '')}" placeholder="Netflix"></div>
      <div class="field"><label>Beløb pr. betaling</label><input id="p16sa" type="number" min="0.01" step="0.01" required value="${s.amount ?? ''}"></div>
      <div class="field"><label>Frekvens</label><select id="p16sc"><option value="weekly" ${s.cadence === 'weekly' ? 'selected' : ''}>Ugentlig</option><option value="monthly" ${!s.cadence || s.cadence === 'monthly' ? 'selected' : ''}>Månedlig</option><option value="quarterly" ${s.cadence === 'quarterly' ? 'selected' : ''}>Kvartalsvis</option><option value="yearly" ${s.cadence === 'yearly' ? 'selected' : ''}>Årlig</option></select></div>
      <div class="field"><label>Næste betaling</label><input id="p16sd" type="date" value="${s.next_payment_date || ''}"></div>
      <div class="field"><label>Status</label><select id="p16ss"><option value="active" ${s.status !== 'paused' && s.status !== 'cancelled' ? 'selected' : ''}>Aktiv</option><option value="paused" ${s.status === 'paused' ? 'selected' : ''}>Pauset</option><option value="cancelled" ${s.status === 'cancelled' ? 'selected' : ''}>Opsagt</option></select></div>
      <div class="small-actions"><button class="btn">Gem</button>${id ? `<button type="button" class="btn ghost pp13danger" onclick="pp16DeleteSubscription('${id}')">Slet</button>` : ''}<button type="button" class="btn ghost" onclick="document.querySelector('#modal').innerHTML=''">Annuller</button></div>
    </form></div></div>`;
  };
  window.pp16SaveSubscription = async (event, id) => {
    event.preventDefault(); try {
      const payload = { user_id: currentUser.id, name: document.querySelector('#p16sn').value.trim(), amount: Number(document.querySelector('#p16sa').value), cadence: document.querySelector('#p16sc').value, next_payment_date: document.querySelector('#p16sd').value || null, status: document.querySelector('#p16ss').value, source: 'manual' };
      if (!payload.name || !Number.isFinite(payload.amount) || payload.amount <= 0) throw new Error('Udfyld navn og et positivt beløb.');
      if (!id) payload.merchant_pattern = payload.name;
      const r = id ? await sb.from('subscriptions').update(payload).eq('id', id) : await sb.from('subscriptions').insert(payload);
      if (r.error) throw r.error; document.querySelector('#modal').innerHTML = ''; toast('Fast udgift gemt'); render();
    } catch (error) { alert(P.err(error)); }
  };
  window.pp16DeleteSubscription = async id => {
    if (!confirm('Slet denne faste udgift?')) return;
    const r = await sb.from('subscriptions').delete().eq('id', id); if (r.error) return alert(P.err(r.error));
    document.querySelector('#modal').innerHTML = ''; toast('Fast udgift slettet'); render();
  };

  async function bills() {
    const rows = await q('bills', { order: 'due_date', asc: true });
    S.bills = rows;
    const today = P.localDate(), end = P.addDays(today, 45);
    const upcoming = rows.filter(x => x.status === 'expected' && x.due_date >= today && x.due_date <= end).slice(0, 10);
    const total = upcoming.reduce((sum, x) => sum + Number(x.amount || 0), 0);
    return `<div class="pp16section-head"><div><h3>Næste 45 dage</h3><small>${upcoming.length} kommende betaling${upcoming.length === 1 ? '' : 'er'} · ${fmt(total)}</small></div><button class="btn ghost" onclick="pp16GenerateBills()">Opdatér</button></div>
      <div class="pp16simple-list">${upcoming.map(b => `<div class="pp16plan-row"><div><b>${esc(b.name)}</b><small>${P.dateLabel(b.due_date)} · ${P.cadence(b.cadence)}</small></div><div class="pp16row-actions"><b>${fmt(b.amount)}</b><button class="pp14link" onclick="pp16BillStatus('${b.id}','paid')">Betalt</button><button class="pp14link" onclick="pp16BillForm('${b.id}')">Redigér</button></div></div>`).join('') || '<div class="empty">Ingen kommende regninger de næste 45 dage.</div>'}</div>
      <div class="pp16actions-row"><button class="pp14link" onclick="pp16BillForm()">+ Manuel regning</button></div><div id="modal"></div>`;
  }

  window.pp16GenerateBills = async () => {
    try {
      const [subs, bills] = await Promise.all([q('subscriptions'), q('bills')]);
      const end = P.addMonths(P.localDate(), 6), keys = new Set(bills.map(b => `${P.n(b.name)}|${b.due_date}`)), add = [];
      for (const s of subs.filter(x => x.status === 'active' && x.next_payment_date)) {
        let date = s.next_payment_date, guard = 0;
        while (date && date <= end && guard++ < 30) {
          const key = `${P.n(s.name)}|${date}`;
          if (!keys.has(key)) { add.push({ user_id: currentUser.id, name:s.name, amount:s.amount, due_date:date, cadence:s.cadence, category_id:s.category_id, status:'expected', source:'detected' }); keys.add(key); }
          date = P.nextDate(date, s.cadence);
        }
      }
      if (add.length) { const r = await sb.from('bills').insert(add); if (r.error) throw r.error; }
      toast(add.length ? `${add.length} kommende betalinger tilføjet` : 'Kommende betalinger er opdateret'); render();
    } catch (error) { alert(P.err(error)); }
  };
  window.pp16BillStatus = async (id, status) => { try { const r = await sb.from('bills').update({ status }).eq('id', id); if (r.error) throw r.error; toast('Regning opdateret'); render(); } catch (error) { alert(P.err(error)); } };
  window.pp16BillForm = id => {
    const b = (S.bills || []).find(x => x.id === id) || {};
    document.querySelector('#modal').innerHTML = `<div class="modal"><div class="modal-card"><h2>${id ? 'Redigér regning' : 'Ny regning'}</h2><form onsubmit="pp16SaveBill(event,'${id || ''}')">
      <div class="field"><label>Navn</label><input id="p16bn" required value="${esc(b.name || '')}"></div><div class="field"><label>Beløb</label><input id="p16ba2" type="number" min="0.01" step="0.01" required value="${b.amount ?? ''}"></div><div class="field"><label>Dato</label><input id="p16bd" type="date" required value="${b.due_date || P.localDate()}"></div>
      <div class="small-actions"><button class="btn">Gem</button>${id ? `<button type="button" class="btn ghost pp13danger" onclick="pp16DeleteBill('${id}')">Slet</button>` : ''}<button type="button" class="btn ghost" onclick="document.querySelector('#modal').innerHTML=''">Annuller</button></div>
    </form></div></div>`;
  };
  window.pp16SaveBill = async (event, id) => { event.preventDefault(); try { const payload = { user_id:currentUser.id, name:document.querySelector('#p16bn').value.trim(), amount:Number(document.querySelector('#p16ba2').value), due_date:document.querySelector('#p16bd').value, cadence:'one_time', status:'expected', source:'manual' }; if (!payload.name || !Number.isFinite(payload.amount) || payload.amount <= 0) throw new Error('Udfyld navn og beløb.'); const r = id ? await sb.from('bills').update(payload).eq('id', id) : await sb.from('bills').insert(payload); if (r.error) throw r.error; document.querySelector('#modal').innerHTML=''; toast('Regning gemt'); render(); } catch (error) { alert(P.err(error)); } };
  window.pp16DeleteBill = async id => { if (!confirm('Slet regningen?')) return; const r = await sb.from('bills').delete().eq('id', id); if (r.error) return alert(P.err(r.error)); document.querySelector('#modal').innerHTML=''; toast('Regning slettet'); render(); };

  async function goals() {
    const rows = await q('goals', { order: 'created_at', asc: false });
    S.goals = rows;
    const active = rows.filter(x => x.status === 'active');
    return `<div class="pp16section-head"><div><h3>Opsparingsmål</h3><small>Hold kun mål, du faktisk arbejder mod.</small></div><button class="btn" onclick="pp16GoalForm()">+ Mål</button></div><div class="pp16goal-grid">${active.map(g => {
      const target = Number(g.target_amount || 0), current = Number(g.current_amount || 0), pct = Math.min(100, Math.round(current / Math.max(1, target) * 100));
      return `<article class="pp16goal"><div class="pp16goal-top"><div><b>${esc(g.name)}</b><small>${g.target_date ? `Mål ${P.dateLabel(g.target_date)}` : 'Ingen slutdato'}</small></div><b>${pct}%</b></div><div class="pp13progress"><span style="width:${pct}%"></span></div><div class="pp16goal-values"><span>${fmt(current)} sparet</span><span>${fmt(Math.max(0, target - current))} tilbage</span></div><div class="pp16goal-actions"><button class="btn ghost" onclick="pp16GoalAdd('${g.id}')">+ Fremdrift</button><button class="pp14link" onclick="pp16GoalForm('${g.id}')">Redigér</button></div></article>`;
    }).join('') || '<div class="empty">Ingen aktive mål. Et konkret mål gør besparelser lettere at holde fast i.</div>'}</div>${rows.some(x => x.status !== 'active') ? `<details class="pp16history"><summary>Afsluttede mål (${rows.filter(x => x.status !== 'active').length})</summary>${rows.filter(x => x.status !== 'active').map(g => `<div class="pp16line"><span>${esc(g.name)} · ${P.status(g.status)}</span><b>${fmt(g.current_amount)}</b></div>`).join('')}</details>` : ''}<div id="modal"></div>`;
  }

  window.pp16GoalForm = id => {
    const g = (S.goals || []).find(x => x.id === id) || {};
    document.querySelector('#modal').innerHTML = `<div class="modal"><div class="modal-card"><h2>${id ? 'Redigér mål' : 'Nyt opsparingsmål'}</h2><form onsubmit="pp16SaveGoal(event,'${id || ''}')">
      <div class="field"><label>Navn</label><input id="p16gn" required value="${esc(g.name || '')}" placeholder="Ferie"></div><div class="field"><label>Målbeløb</label><input id="p16gt" type="number" min="1" step="0.01" required value="${g.target_amount ?? ''}"></div><div class="field"><label>Allerede sparet</label><input id="p16gc" type="number" min="0" step="0.01" value="${g.current_amount ?? 0}"></div><div class="field"><label>Månedlig plan</label><input id="p16gm" type="number" min="0" step="0.01" value="${g.monthly_contribution ?? 0}"></div><div class="field"><label>Måldato</label><input id="p16gd" type="date" value="${g.target_date || ''}"></div>
      <div class="small-actions"><button class="btn">Gem</button>${id ? `<button type="button" class="btn ghost pp13danger" onclick="pp16DeleteGoal('${id}')">Slet</button>` : ''}<button type="button" class="btn ghost" onclick="document.querySelector('#modal').innerHTML=''">Annuller</button></div>
    </form></div></div>`;
  };
  window.pp16SaveGoal = async (event, id) => { event.preventDefault(); try { const target = Number(document.querySelector('#p16gt').value), current = Number(document.querySelector('#p16gc').value || 0); if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(current) || current < 0) throw new Error('Kontrollér målbeløb og opsparet beløb.'); const payload = { user_id:currentUser.id, name:document.querySelector('#p16gn').value.trim(), target_amount:target, current_amount:current, monthly_contribution:Number(document.querySelector('#p16gm').value || 0), target_date:document.querySelector('#p16gd').value || null, status:current >= target ? 'completed' : 'active' }; if (!payload.name) throw new Error('Skriv et navn til målet.'); const r = id ? await sb.from('goals').update(payload).eq('id', id) : await sb.from('goals').insert(payload); if (r.error) throw r.error; document.querySelector('#modal').innerHTML=''; toast('Mål gemt'); render(); } catch (error) { alert(P.err(error)); } };
  window.pp16GoalAdd = id => { const g = (S.goals || []).find(x => x.id === id); if (!g) return; const value = prompt(`Hvor meget vil du lægge til “${g.name}”?`, '500'); if (value === null) return; const amount = Number(String(value).replace(',', '.')); if (!Number.isFinite(amount) || amount <= 0) return alert('Indtast et positivt beløb.'); const next = Number(g.current_amount || 0) + amount; sb.from('goals').update({ current_amount:next, status:next >= Number(g.target_amount || 0) ? 'completed' : 'active' }).eq('id', id).then(({ error }) => { if (error) alert(P.err(error)); else { toast('Fremdrift gemt'); render(); } }); };
  window.pp16DeleteGoal = async id => { if (!confirm('Slet dette mål?')) return; const r = await sb.from('goals').delete().eq('id', id); if (r.error) return alert(P.err(r.error)); document.querySelector('#modal').innerHTML=''; toast('Mål slettet'); render(); };

  P.renderers.budget = budget;
  P.renderers.subscriptions = subscriptions;
  P.renderers.bills = bills;
  P.renderers.goals = goals;
})();
