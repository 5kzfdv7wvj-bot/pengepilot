// PengePilot v10: stable simplified navigation with a dedicated savings page.
(() => {
  const legacyTargets = {
    accounts: 'transactions.html#accounts',
    subscriptions: 'budget.html#fixed',
    bills: 'budget.html#fixed',
    goals: 'budget.html#goals',
    forecast: 'reports.html#analysis',
    health: 'reports.html#analysis',
    chat: 'reports.html#chat'
  };

  if (typeof page !== 'undefined' && legacyTargets[page]) {
    const target = legacyTargets[page];
    if (!location.pathname.endsWith(target.split('#')[0])) {
      location.replace(target);
      return;
    }
  }

  const state = { installed: false, installing: false, base: null };
  const defs = {
    economy: {
      tabs: [['transactions', 'Transaktioner'], ['accounts', 'Konti'], ['import', 'Importér']],
      defaultTab: 'transactions'
    },
    plan: {
      tabs: [['budget', 'Budget'], ['fixed', 'Faste betalinger'], ['goals', 'Mål']],
      defaultTab: 'budget'
    },
    insights: {
      tabs: [['analysis', 'Analyse'], ['chat', 'Spørg AI']],
      defaultTab: 'analysis'
    }
  };

  function groupForPage() {
    if (page === 'transactions') return 'economy';
    if (page === 'budget') return 'plan';
    if (page === 'reports') return 'insights';
    return null;
  }

  function tabFor(group) {
    const def = defs[group];
    const raw = location.hash.replace(/^#/, '');
    return def.tabs.some(([id]) => id === raw) ? raw : def.defaultTab;
  }

  function tabBar(group) {
    const active = tabFor(group);
    return `<div class="pp10tabs" role="tablist">${defs[group].tabs.map(([id, label]) => `<button class="pp10tab ${active === id ? 'on' : ''}" type="button" onclick="pp10Tab('${group}','${id}')">${esc(label)}</button>`).join('')}</div>`;
  }

  window.pp10Tab = function (group, tab) {
    const def = defs[group];
    if (!def || !def.tabs.some(([id]) => id === tab)) return;
    if (group === 'economy' && tab === 'import') {
      location.href = 'import.html';
      return;
    }
    if (location.hash !== `#${tab}`) history.pushState(null, '', `#${tab}`);
    render();
  };

  function rewriteLinks(html) {
    return String(html)
      .replace(/href="accounts\.html"/g, 'href="transactions.html#accounts"')
      .replace(/href="subscriptions\.html"/g, 'href="budget.html#fixed"')
      .replace(/href="bills\.html"/g, 'href="budget.html#fixed"')
      .replace(/href="goals\.html"/g, 'href="budget.html#goals"')
      .replace(/href="forecast\.html"/g, 'href="reports.html#analysis"')
      .replace(/href="health\.html"/g, 'href="reports.html#analysis"')
      .replace(/href="chat\.html"/g, 'href="reports.html#chat"');
  }

  async function economyHub() {
    const tab = tabFor('economy');
    if (tab === 'import') {
      location.href = 'import.html';
      return '<div class="loading">Åbner import…</div>';
    }
    const fn = tab === 'accounts' ? state.base.accounts : state.base.transactions;
    return `${tabBar('economy')}<div class="pp10hub">${rewriteLinks(await fn())}</div>`;
  }

  async function planHub() {
    const tab = tabFor('plan');
    let html = '';
    if (tab === 'fixed') {
      const [subscriptionsHtml, billsHtml] = await Promise.all([state.base.subscriptions(), state.base.bills()]);
      const clean = value => String(value).replace(/<div id="modal"><\/div>/g, '');
      html = `<section class="pp10section"><div class="pp10section-title"><h2>Abonnementer</h2><p>Gentagne betalinger og tjenester.</p></div>${clean(subscriptionsHtml)}</section><section class="pp10section"><div class="pp10section-title"><h2>Regninger</h2><p>Kommende og betalte regninger.</p></div>${clean(billsHtml)}</section><div id="modal"></div>`;
    } else if (tab === 'goals') {
      html = await state.base.goals();
    } else {
      html = await state.base.budget();
    }
    return `${tabBar('plan')}<div class="pp10hub">${rewriteLinks(html)}</div>`;
  }

  async function analysisPanel() {
    const [forecastHtml, healthHtml, reportsHtml] = await Promise.all([
      state.base.forecast(), state.base.health(), state.base.reports()
    ]);
    return `<section class="pp10section"><div class="pp10section-title"><h2>Prognose</h2><p>Forventet udvikling ud fra dine registrerede tal.</p></div>${forecastHtml}</section><section class="pp10section"><div class="pp10section-title"><h2>Økonomisk sundhed</h2><p>Din status, buffer og budgetdisciplin.</p></div>${healthHtml}</section><section class="pp10section"><div class="pp10section-title"><h2>Rapporter</h2><p>Historik, månedsudvikling og eksport.</p></div>${reportsHtml}</section>`;
  }

  async function insightsHub() {
    const tab = tabFor('insights');
    const html = tab === 'chat' ? await state.base.chat() : await analysisPanel();
    return `${tabBar('insights')}<div class="pp10hub">${rewriteLinks(html)}</div>`;
  }

  function savingTokens(value) {
    const stop = new Set(['og','eller','for','med','din','dit','dine','paa','til','fra','om','en','et','af','pr','md','maaned','maanedlig','spar','spare','besparelse','reducer','reduktion']);
    return new Set(String(value || '').toLowerCase().replace(/æ/g,'ae').replace(/ø/g,'o').replace(/å/g,'a').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(w => w.length > 2 && !stop.has(w)));
  }

  function savingOverlap(a, b) {
    const key = row => String(row?.evidence?.dedupe_key || row?.title || '').toLowerCase().replace(/[^a-z0-9æøå]+/gi,' ').trim();
    const ka = key(a), kb = key(b);
    if (ka && kb && (ka === kb || ((ka.includes(kb) || kb.includes(ka)) && Math.min(ka.length, kb.length) >= 5))) return true;
    const similarity = (x, y) => {
      const A = savingTokens(x), B = savingTokens(y);
      if (!A.size || !B.size) return 0;
      let shared = 0;
      for (const word of A) if (B.has(word)) shared++;
      return shared / Math.min(A.size, B.size);
    };
    return similarity(a?.title, b?.title) >= 0.66 || similarity(`${a?.title || ''} ${a?.description || ''}`, `${b?.title || ''} ${b?.description || ''}`) >= 0.72;
  }

  async function dedupeSavings() {
    try {
      const rows = await q('savings_opportunities', { limit: 500 });
      const blockers = rows.filter(r => r.opportunity_type !== 'ai_generated' || r.status !== 'open');
      const ai = rows.filter(r => r.opportunity_type === 'ai_generated' && r.status === 'open')
        .sort((a, b) => (Number(b.confidence || 0) * Number(b.monthly_saving || 0)) - (Number(a.confidence || 0) * Number(a.monthly_saving || 0)));
      const keep = [], remove = [];
      for (const row of ai) {
        if (blockers.some(x => savingOverlap(row, x)) || keep.some(x => savingOverlap(row, x))) remove.push(row.id);
        else keep.push(row);
      }
      for (let i = 0; i < remove.length; i += 50) {
        const { error } = await sb.from('savings_opportunities').delete().in('id', remove.slice(i, i + 50));
        if (error) throw error;
      }
      return remove.length;
    } catch (error) {
      console.warn('PengePilot savings dedupe', error);
      return 0;
    }
  }

  function addCss() {
    if (document.querySelector('#pp10css')) return;
    const style = document.createElement('style');
    style.id = 'pp10css';
    style.textContent = `.pp10tabs{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 18px;padding:5px;background:#e9edf5;border-radius:15px;width:max-content;max-width:100%}.pp10tab{border:0;background:transparent;color:var(--muted);font-weight:800;padding:9px 13px;border-radius:11px;cursor:pointer;white-space:nowrap}.pp10tab.on{background:#fff;color:var(--text);box-shadow:0 3px 12px rgba(23,32,51,.08)}.pp10hub{min-width:0}.pp10section{margin-bottom:24px}.pp10section+.pp10section{border-top:1px solid var(--line);padding-top:24px}.pp10section-title{margin:0 0 10px}.pp10section-title h2{margin:0 0 4px}.pp10section-title p{margin:0;color:var(--muted);font-size:13px}@media(max-width:900px){.pp10tabs{width:100%;overflow:auto;flex-wrap:nowrap}.pp10tab{min-height:42px}.side .menu{gap:6px}.side .menu a{font-size:14px;padding:11px 12px}}`;
    document.head.appendChild(style);
  }

  async function waitForAiLayer() {
    if (!['transactions', 'savings', 'reports'].includes(page) || !window.ppAI?.status) return;
    try {
      const status = await window.ppAI.status();
      if (!status?.configured) return;
      for (let i = 0; i < 50 && !window.pp6Invoke; i++) await new Promise(resolve => setTimeout(resolve, 40));
    } catch {}
  }

  async function install() {
    if (state.installed || state.installing) return false;
    if (typeof renderers === 'undefined' || typeof routes === 'undefined' || typeof titles === 'undefined') return false;
    state.installing = true;
    try {
      await waitForAiLayer();
      if (state.installed) return true;

      state.base = {
        accounts: renderers.accounts,
        transactions: renderers.transactions,
        budget: renderers.budget,
        subscriptions: renderers.subscriptions,
        bills: renderers.bills,
        goals: renderers.goals,
        savings: renderers.savings,
        forecast: renderers.forecast,
        health: renderers.health,
        reports: renderers.reports,
        chat: renderers.chat
      };
      if (Object.values(state.base).some(fn => typeof fn !== 'function')) return false;

      routes.splice(0, routes.length,
        ['dashboard', 'Overblik', 'index.html'],
        [page === 'import' ? 'import' : 'transactions', 'Økonomi', 'transactions.html'],
        ['budget', 'Plan', 'budget.html'],
        ['savings', 'Besparelser', 'savings.html'],
        ['reports', 'Indsigter', 'reports.html'],
        ['settings', 'Indstillinger', 'settings.html']
      );

      titles.transactions = ['Økonomi', 'Konti, import og transaktioner'];
      titles.budget = ['Plan', 'Budget, faste betalinger og mål'];
      titles.savings = ['Besparelser', 'Konkrete forslag til at frigøre penge'];
      titles.reports = ['Indsigter', 'Analyse, prognose og PengePilot AI'];

      renderers.transactions = economyHub;
      renderers.budget = planHub;
      renderers.reports = insightsHub;
      addCss();

      if (page === 'savings') await dedupeSavings();

      state.installed = true;
      window.addEventListener('hashchange', () => {
        if (groupForPage()) render();
      });

      if (typeof currentUser !== 'undefined' && currentUser && typeof shell === 'function') {
        shell(currentUser);
        await render();
      }
      return true;
    } catch (error) {
      console.error('PengePilot v10 navigation install failed', error);
      return false;
    } finally {
      state.installing = false;
    }
  }

  function boot() {
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts++;
      const done = await install();
      if (done || attempts > 100) clearInterval(timer);
    }, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
