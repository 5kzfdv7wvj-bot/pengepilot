// PengePilot dashboard v14: savings-first overview.
(() => {
  const P = window.pp13;
  if (!P) return;

  async function dashboard() {
    const [tx, cats, acc, opportunities, budgets, settings] = await Promise.all([
      q('transactions', { order: 'transaction_date', limit: 10000 }),
      q('categories'),
      q('accounts'),
      q('savings_opportunities', { limit: 500 }),
      q('budgets', { limit: 500 }),
      P.settings()
    ]);

    const month = P.localMonth();
    const summary = P.summary(tx, cats, month);
    const spend = P.categorySpend(tx, cats, month);
    const balance = acc.filter(a => !a.is_archived).reduce((sum, a) => sum + P.balance(a, tx, settings), 0);
    const fp = P.fingerprint(tx);
    const open = opportunities.filter(x => {
      if (x.status !== 'open') return false;
      const evidenceFp = x.evidence?.fingerprint;
      return !evidenceFp || evidenceFp === fp;
    });
    const monthlySaving = open.reduce((sum, x) => sum + Number(x.monthly_saving || 0), 0);
    const top = [...open].sort((a, b) => Number(b.monthly_saving || 0) - Number(a.monthly_saving || 0)).slice(0, 3);
    const biggest = Object.entries(spend).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const monthBudgets = budgets.filter(b => String(b.period_start).startsWith(month));
    const totalBudget = monthBudgets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const budgetLeft = totalBudget ? totalBudget - summary.expenses : null;

    return `
      <section class="pp14hero card">
        <div class="pp14hero-copy">
          <div class="pp14eyebrow">DIT SPAREPOTENTIALE</div>
          <div class="pp14saving-number good">${fmt(monthlySaving)}</div>
          <div class="sub">muligt pr. måned ud fra dine aktuelle forslag</div>
        </div>
        <a class="btn pp14primary" href="savings.html">Se hvor du kan spare</a>
      </section>

      <div class="pp14kpis">
        <div class="pp14kpi"><span>Brugt denne måned</span><b class="bad">${fmt(summary.expenses)}</b></div>
        <div class="pp14kpi"><span>Samlet saldo</span><b class="${balance < 0 ? 'bad' : ''}">${fmt(balance)}</b></div>
        <div class="pp14kpi"><span>${totalBudget ? 'Tilbage i budget' : 'Månedsnetto'}</span><b class="${totalBudget ? (budgetLeft >= 0 ? 'good' : 'bad') : (summary.net >= 0 ? 'good' : 'bad')}">${fmt(totalBudget ? budgetLeft : summary.net)}</b></div>
      </div>

      <div class="grid g2 pp14overview-grid">
        <section class="card">
          <div class="pp14section-title"><div><h2>Bedste besparelser</h2><p class="sub">Fokus på få, konkrete handlinger.</p></div><a class="pp14link" href="savings.html">Se alle</a></div>
          ${top.length ? top.map(x => `<div class="pp14saving-row"><div><b>${esc(x.title)}</b><small>${esc(x.description || '')}</small></div><b class="good">${fmt(x.monthly_saving)}/md.</b></div>`).join('') : '<div class="empty">Ingen aktuelle forslag endnu. Åbn “Spar penge” og opdatér forslagene.</div>'}
        </section>
        <section class="card">
          <div class="pp14section-title"><div><h2>Hvor pengene går</h2><p class="sub">Største udgiftsområder denne måned.</p></div><a class="pp14link" href="transactions.html">Se forbrug</a></div>
          ${biggest.length ? biggest.map(([name, value]) => `<div class="row"><b>${esc(name)}</b><b>${fmt(value)}</b></div>`).join('') : '<div class="empty">Ingen udgifter denne måned.</div>'}
        </section>
      </div>`;
  }

  P.renderers.dashboard = dashboard;
})();
