// PengePilot dashboard v16: one clear financial focus, savings-first and mobile-first.
(() => {
  const P = window.pp13;
  if (!P || window.__PP16_DASHBOARD__) return;
  window.__PP16_DASHBOARD__ = true;

  const freshness = (row, fp) => {
    if (row.status !== 'open') return true;
    if (row.opportunity_type === 'local_v13') return row.evidence?.fingerprint === fp;
    return row.evidence?.v15 === true || row.evidence?.v16 === true;
  };

  async function dashboard() {
    const [tx, cats, accounts, opportunities, budgets, subscriptions, goals, debts, payments, settings] = await Promise.all([
      q('transactions', { order: 'transaction_date', limit: 10000 }),
      q('categories'),
      q('accounts'),
      q('savings_opportunities', { limit: 500 }),
      q('budgets', { limit: 500 }),
      q('subscriptions', { limit: 200 }),
      q('goals', { limit: 100 }),
      q('debts', { limit: 100 }).catch(() => []),
      q('debt_payments', { limit: 500 }).catch(() => []),
      P.settings()
    ]);

    const month = P.localMonth();
    const fp = P.fingerprint(tx);
    const summary = P.summary(tx, cats, month);
    const spend = P.categorySpend(tx, cats, month);
    const balance = accounts.filter(a => !a.is_archived).reduce((sum, a) => sum + P.balance(a, tx, settings), 0);
    const map = P.categoryMap(cats);
    const other = P.categoryId(cats, 'Andet');
    const unclear = tx.filter(t => !t.category_id || t.category_id === other).length;
    const suspicious = tx.filter(t => P.reviewReason(t, map)).length;

    const open = opportunities
      .filter(x => x.status === 'open' && freshness(x, fp))
      .sort((a, b) => Number(b.monthly_saving || 0) * Number(b.confidence || .5) - Number(a.monthly_saving || 0) * Number(a.confidence || .5));
    const monthlySaving = open.reduce((sum, x) => sum + Number(x.monthly_saving || 0), 0);
    const best = open[0] || null;

    const activeSubs = subscriptions.filter(x => x.status === 'active');
    const fixedMonthly = activeSubs.reduce((sum, x) => sum + P.monthlyAmount(x.amount, x.cadence), 0);

    const currentBudgets = budgets.filter(x => String(x.period_start).startsWith(month));
    const overallBudget = currentBudgets.find(x => !x.category_id);
    const budgetLimit = overallBudget ? Number(overallBudget.amount || 0) : currentBudgets.reduce((sum, x) => sum + Number(x.amount || 0), 0);
    const budgetLeft = budgetLimit ? budgetLimit - summary.expenses : null;

    const activeGoals = goals.filter(x => x.status === 'active');
    const goal = activeGoals.sort((a, b) => String(a.target_date || '9999').localeCompare(String(b.target_date || '9999')))[0] || null;
    const goalPct = goal ? Math.min(100, Math.round(Number(goal.current_amount || 0) / Math.max(1, Number(goal.target_amount || 0)) * 100)) : null;

    const debtPaid = id => payments.filter(x => x.debt_id === id).reduce((sum, x) => sum + Number(x.amount || 0), 0);
    const activeDebts = debts.filter(x => x.status === 'active');
    const debtRemaining = activeDebts.reduce((sum, x) => sum + Math.max(0, Number(x.original_amount || 0) - debtPaid(x.id)), 0);

    const biggest = Object.entries(spend).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const qualityIssue = unclear + suspicious;

    const focus = best
      ? `<div class="pp16focus-copy"><div class="pp16eyebrow">NÆSTE BEDSTE HANDLING</div><h2>${esc(best.title)}</h2><p>${esc(best.description || 'Et konkret forslag baseret på dit forbrug.')}</p><div class="pp16focus-value">Op til <b>${fmt(best.monthly_saving)}/md.</b></div></div><a class="btn pp16primary" href="savings.html#suggestions">Se forslaget</a>`
      : `<div class="pp16focus-copy"><div class="pp16eyebrow">NÆSTE BEDSTE HANDLING</div><h2>Find nye besparelser</h2><p>PengePilot kan gennemgå dit aktuelle forbrug og prioritere de mest realistiske muligheder.</p></div><a class="btn pp16primary" href="savings.html#suggestions">Find besparelser</a>`;

    return `
      <section class="pp16focus card">${focus}</section>

      <div class="pp16metric-grid">
        <div class="pp16metric"><span>Sparepotentiale</span><b class="good">${fmt(monthlySaving)}/md.</b><small>Aktuelle, åbne forslag</small></div>
        <div class="pp16metric"><span>Forbrug i ${esc(P.monthLabel(month))}</span><b>${fmt(summary.expenses)}</b><small>${summary.unknown ? `${summary.unknown} ukategoriserede påvirker overblikket` : 'Efter refunderinger'}</small></div>
        <div class="pp16metric"><span>Samlet saldo</span><b class="${balance < 0 ? 'bad' : ''}">${fmt(balance)}</b><small>${accounts.filter(a => !a.is_archived).length} aktive konti</small></div>
      </div>

      ${qualityIssue ? `<div class="notice pp16quality"><div><b>${qualityIssue} postering${qualityIssue === 1 ? '' : 'er'} bør gennemgås</b><small>Bedre kategorier giver bedre spareforslag.</small></div><a class="btn ghost" href="transactions.html#transactions">Gennemgå</a></div>` : ''}

      <div class="pp16home-grid">
        <section class="card pp16compact-card">
          <div class="pp16section-head"><div><div class="pp16eyebrow">DIN PLAN</div><h2>Det vigtigste lige nu</h2></div><a href="savings.html#plan" class="pp14link">Åbn plan</a></div>
          ${budgetLimit ? `<div class="pp16line"><div><b>Budget</b><small>${fmt(summary.expenses)} brugt af ${fmt(budgetLimit)}</small></div><b class="${budgetLeft >= 0 ? 'good' : 'bad'}">${fmt(budgetLeft)} tilbage</b></div>` : `<div class="pp16line"><div><b>Budget</b><small>Ingen samlet ramme denne måned</small></div><a href="savings.html#plan" class="pp14link">Opret</a></div>`}
          <div class="pp16line"><div><b>Faste udgifter</b><small>${activeSubs.length} aktive</small></div><b>${fmt(fixedMonthly)}/md.</b></div>
          ${debtRemaining > 0 ? `<div class="pp16line"><div><b>Gæld til personer</b><small>${activeDebts.length} aktive</small></div><b>${fmt(debtRemaining)}</b></div>` : ''}
          ${goal ? `<div class="pp16line"><div><b>${esc(goal.name)}</b><small>${goalPct}% af ${fmt(goal.target_amount)}</small></div><b>${fmt(goal.current_amount)}</b></div>` : ''}
        </section>

        <section class="card pp16compact-card">
          <div class="pp16section-head"><div><div class="pp16eyebrow">FORBRUG</div><h2>Største områder</h2></div><a href="transactions.html" class="pp14link">Se alle</a></div>
          ${biggest.length ? biggest.map(([name, value], i) => `<div class="pp16spend-row"><span>${i + 1}</span><div><b>${esc(name)}</b><small>${summary.expenses ? Math.round(value / summary.expenses * 100) : 0}% af månedens forbrug</small></div><b>${fmt(value)}</b></div>`).join('') : '<div class="empty">Ingen udgifter denne måned.</div>'}
        </section>
      </div>`;
  }

  P.renderers.dashboard = dashboard;
})();
