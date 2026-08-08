// PengePilot v9: simplify navigation into five hubs without removing underlying functionality.
(() => {
  const legacyTargets = {
    accounts: 'transactions.html#accounts',
    subscriptions: 'budget.html#subscriptions',
    bills: 'budget.html#bills',
    goals: 'budget.html#goals',
    forecast: 'savings.html#analysis',
    health: 'savings.html#analysis',
    reports: 'savings.html#analysis',
    chat: 'savings.html#chat'
  };

  if (typeof page !== 'undefined' && legacyTargets[page]) {
    const target = legacyTargets[page];
    if (!location.pathname.endsWith(target.split('#')[0])) {
      location.replace(target);
      return;
    }
  }

  const state = { installed: false, base: null };
  const defs = {
    economy: {
      tabs: [
        ['transactions', 'Transaktioner'],
        ['accounts', 'Konti'],
        ['import', 'Importér']
      ],
      defaultTab: 'transactions'
    },
    plan: {
      tabs: [
        ['budget', 'Budget'],
        ['subscriptions', 'Abonnementer'],
        ['bills', 'Regninger'],
        ['goals', 'Mål']
      ],
      defaultTab: 'budget'
    },
    insights: {
      tabs: [
        ['savings', 'Penge fundet'],
        ['analysis', 'Analyse'],
        ['chat', 'Spørg AI']
      ],
      defaultTab: 'savings'
    }
  };

  function groupForPage() {
    if (page === 'transactions') return 'economy';
    if (page === 'budget') return 'plan';
    if (page === 'savings') return 'insights';
    return null;
  }

  function tabFor(group) {
    const def = defs[group];
    const raw = location.hash.replace(/^#/, '');
    return def.tabs.some(([id]) => id === raw) ? raw : def.defaultTab;
  }

  function tabBar(group) {
    const def = defs[group];
    const active = tabFor(group);
    return `<div class="pp9tabs" role="tablist" aria-label="${group}">${def.tabs.map(([id, label]) => `<button class="pp9tab ${active === id ? 'on' : ''}" type="button" onclick="pp9Tab('${group}','${id}')">${esc(label)}</button>`).join('')}</div>`;
  }

  window.pp9Tab = function (group, tab) {
    const def = defs[group];
    if (!def || !def.tabs.some(([id]) => id === tab)) return;
    if (group === 'economy' && tab === 'import') {
      location.href = 'import.html';
      return;
    }
    if (location.hash !== `#${tab}`) history.pushState(null, '', `#${tab}`);
    if (typeof render === 'function') render();
  };

  function rewriteEconomyLinks(html) {
    return String(html)
      .replace(/href="import\.html"/g, 'href="import.html"')
      .replace(/href="accounts\.html"/g, 'href="transactions.html#accounts"');
  }

  async function economyHub() {
    const tab = tabFor('economy');
    if (tab === 'import') {
      location.href = 'import.html';
      return '<div class="loading">Åbner import…</div>';
    }
    const fn = state.base?.[tab] || state.base?.transactions;
    const html = await fn();
    return `${tabBar('economy')}<div class="pp9hub">${rewriteEconomyLinks(html)}</div>`;
  }

  async function planHub() {
    const tab = tabFor('plan');
    const fn = state.base?.[tab] || state.base?.budget;
    const html = await fn();
    return `${tabBar('plan')}<div class="pp9hub">${html}</div>`;
  }

  async function analysisPanel() {
    const [forecastHtml, healthHtml, reportsHtml] = await Promise.all([
      state.base.forecast(),
      state.base.health(),
      state.base.reports()
    ]);
    return `<div class="pp9section"><div class="pp9section-title"><h2>Prognose</h2><p>Hvor økonomien er på vej hen ud fra dine registrerede tal.</p></div>${forecastHtml}</div>
      <div class="pp9section"><div class="pp9section-title"><h2>Sundhed</h2><p>Samlet status på økonomiske vaner og datadækning.</p></div>${healthHtml}</div>
      <div class="pp9section"><div class="pp9section-title"><h2>Rapporter</h2><p>Historik, månedsudvikling og eksport.</p></div>${reportsHtml}</div>`;
  }

  function savingTokens(value) {
    const stop = new Set(['og','eller','for','med','din','dit','dine','paa','til','fra','om','en','et','af','pr','md','maaned','maanedlig','spar','spare','besparelse','reducer','reduktion']);
    return new Set(String(value || '').toLowerCase().replace(/æ/g,'ae').replace(/ø/g,'o').replace(/å/g,'a').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(w => w.length > 2 && !stop.has(w)));
  }

  function savingOverlap(a, b) {
    const key = row => String(row?.evidence?.dedupe_key || row?.title || '').toLowerCase().replace(/[^a-z0-9æøå]+/gi,' ').trim();
    const ka = key(a), kb = key(b);
    if (ka && kb && (ka === kb || ((ka.includes(kb) || kb.includes(ka)) && Math.min(ka.length, kb.length) >= 5))) return true;
    const score = (x, y) => {
      const A = savingTokens(x), B = savingTokens(y);
      if (!A.size || !B.size) return 0;
      let n = 0;
      for (const w of A) if (B.has(w)) n++;
      return n / Math.min(A.size, B.size);
    };
    return score(a?.title, b?.title) >= 0.66 || score(`${a?.title || ''} ${a?.description || ''}`, `${b?.title || ''} ${b?.description || ''}`) >= 0.72;
  }

  async function dedupeSavings() {
    try {
      const rows = await q('savings_opportunities', { limit: 500 });
      const existing = rows.filter(r => r.opportunity_type !== 'ai_generated');
      const ai = rows
        .filter(r => r.opportunity_type === 'ai_generated' && r.status === 'open')
        .sort((a, b) => (Number(b.confidence || 0) * Number(b.monthly_saving || 0)) - (Number(a.confidence || 0) * Number(a.monthly_saving || 0)));
      const keep = [], remove = [];
      for (const row of ai) {
        if (existing.some(x => savingOverlap(row, x)) || keep.some(x => savingOverlap(row, x))) remove.push(row.id);
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

  async function insightsHub() {
    const tab = tabFor('insights');
    let html;
    if (tab === 'analysis') html = await analysisPanel();
    else if (tab === 'chat') html = await state.base.chat();
    else {
      await dedupeSavings();
      html = await state.base.savings();
    }
    return `${tabBar('insights')}<div class="pp9hub">${html}</div>`;
  }

  function addCss() {
    if (document.querySelector('#pp9css')) return;
    const style = document.createElement('style');
    style.id = 'pp9css';
    style.textContent = `
      .pp9tabs{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 18px;padding:5px;background:#e9edf5;border-radius:15px;width:max-content;max-width:100%}
      .pp9tab{border:0;background:transparent;color:var(--muted);font-weight:800;padding:9px 13px;border-radius:11px;cursor:pointer;white-space:nowrap}
      .pp9tab.on{background:#fff;color:var(--text);box-shadow:0 3px 12px rgba(23,32,51,.08)}
      .pp9hub{min-width:0}.pp9section{margin-bottom:24px}.pp9section+.pp9section{border-top:1px solid var(--line);padding-top:24px}
      .pp9section-title{margin:0 0 10px}.pp9section-title h2{margin:0 0 4px}.pp9section-title p{margin:0;color:var(--muted);font-size:13px}
      @media(max-width:900px){.pp9tabs{width:100%;overflow:auto;flex-wrap:nowrap}.pp9tab{min-height:42px}.side .menu{gap:7px}.side .menu a{font-size:14px;padding:12px}}
    `;
    document.head.appendChild(style);
  }

  async function waitForAiLayer() {
    if (!window.ppAI?.status) return;
    try {
      const status = await window.ppAI.status();
      if (!status?.configured) return;
      for (let i = 0; i < 40 && !window.pp6Invoke; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch {}
  }

  async function install() {
    if (state.installed || typeof renderers === 'undefined' || typeof routes === 'undefined' || typeof titles === 'undefined') return false;
    await waitForAiLayer();

    state.base = {
      accounts: renderers.accounts,
      transactions: renderers.transactions,
      import: renderers.import,
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
      ['transactions', 'Økonomi', 'transactions.html'],
      ['budget', 'Plan', 'budget.html'],
      ['savings', 'Indsigter', 'savings.html'],
      ['settings', 'Indstillinger', 'settings.html']
    );

    titles.transactions = ['Økonomi', 'Konti, import og transaktioner samlet'];
    titles.budget = ['Plan', 'Budget, faste betalinger og mål'];
    titles.savings = ['Indsigter', 'Analyse, spareforslag og PengePilot AI'];

    renderers.transactions = economyHub;
    renderers.budget = planHub;
    renderers.savings = insightsHub;

    addCss();

    if (typeof window.pp6GenerateSavings === 'function' && !window.__PP9_SAVINGS_WRAPPED__) {
      window.__PP9_SAVINGS_WRAPPED__ = true;
      const originalGenerate = window.pp6GenerateSavings;
      window.pp6GenerateSavings = async function () {
        await originalGenerate();
        const removed = await dedupeSavings();
        if (removed && typeof toast === 'function') toast(`${removed} overlappende AI-forslag fjernet`);
        if (removed && typeof render === 'function') await render();
      };
    }

    state.installed = true;

    window.addEventListener('hashchange', () => {
      if (groupForPage() && typeof render === 'function') render();
    });

    if (typeof currentUser !== 'undefined' && currentUser && typeof shell === 'function') {
      shell(currentUser);
      await render();
    }
    return true;
  }

  async function boot() {
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts++;
      if (await install() || attempts > 80) clearInterval(timer);
    }, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
