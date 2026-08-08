// PengePilot web boot v14: four focused areas, savings first.
(() => {
  const P = window.pp13;
  if (!P) return;

  const redirects = {
    accounts: 'transactions.html#accounts',
    subscriptions: 'savings.html#fixed',
    bills: 'savings.html#fixed',
    goals: 'savings.html#plan',
    budget: 'savings.html#plan',
    forecast: 'savings.html',
    health: 'savings.html',
    reports: 'savings.html',
    chat: 'savings.html'
  };

  if (typeof page !== 'undefined' && redirects[page] && !location.pathname.endsWith(redirects[page].split('#')[0])) {
    location.replace(redirects[page]);
    return;
  }
  if (typeof page !== 'undefined' && (page === 'budget' || page === 'reports')) {
    location.replace(page === 'budget' ? 'savings.html#plan' : 'savings.html');
    return;
  }

  const defs = {
    spend: { tabs: [['transactions', 'Transaktioner'], ['accounts', 'Konti']], def: 'transactions' },
    save: { tabs: [['suggestions', 'Forslag'], ['fixed', 'Faste udgifter'], ['plan', 'Budget & mål']], def: 'suggestions' }
  };
  const original = {};
  let installed = false;

  const activeTab = group => {
    const raw = location.hash.replace(/^#/, '');
    return defs[group].tabs.some(([id]) => id === raw) ? raw : defs[group].def;
  };
  const tabs = group => `<div class="pp13tabs pp14tabs" role="tablist">${defs[group].tabs.map(([id, label]) => `<button type="button" class="pp13tab ${activeTab(group) === id ? 'on' : ''}" onclick="pp14Tab('${group}','${id}')">${esc(label)}</button>`).join('')}</div>`;
  const clean = html => String(html || '').replace(/<div id="modal"><\/div>/g, '');

  window.pp14Tab = (group, tab) => {
    if (!defs[group]?.tabs.some(([id]) => id === tab)) return;
    if (location.hash !== `#${tab}`) history.pushState(null, '', `#${tab}`);
    render();
  };

  async function spendHub() {
    const tab = activeTab('spend');
    return `${tabs('spend')}<div class="pp14hub">${await original[tab]()}</div>`;
  }

  async function saveHub() {
    const tab = activeTab('save');
    if (tab === 'suggestions') return `${tabs('save')}<div class="pp14hub">${await original.savings()}</div>`;
    if (tab === 'fixed') {
      const [subscriptions, bills] = await Promise.all([original.subscriptions(), original.bills()]);
      return `${tabs('save')}<div class="pp14hub"><section class="pp13section pp14compact-section"><div class="pp14section-title"><div><h2>Faste udgifter</h2><p class="sub">Find betalinger der gentager sig, og vurder om de stadig er nødvendige.</p></div></div>${clean(subscriptions)}</section><section class="pp13section pp14compact-section"><div class="pp14section-title"><div><h2>Kommende regninger</h2><p class="sub">Se det der snart rammer kontoen.</p></div></div>${clean(bills)}</section><div id="modal"></div></div>`;
    }
    const [budget, goals] = await Promise.all([original.budget(), original.goals()]);
    return `${tabs('save')}<div class="pp14hub"><section class="pp13section pp14compact-section"><div class="pp14section-title"><div><h2>Budget</h2><p class="sub">Sæt en enkel ramme for det forbrug, du vil holde nede.</p></div></div>${clean(budget)}</section><section class="pp13section pp14compact-section"><div class="pp14section-title"><div><h2>Opsparingsmål</h2><p class="sub">Gør besparelserne synlige ved at knytte dem til et mål.</p></div></div>${clean(goals)}</section><div id="modal"></div></div>`;
  }

  function needed() {
    if (typeof page === 'undefined' || typeof renderers === 'undefined' || typeof routes === 'undefined' || typeof titles === 'undefined' || typeof shell !== 'function') return false;
    const req = {
      dashboard: ['dashboard'],
      transactions: ['transactions', 'accounts'],
      savings: ['savings', 'subscriptions', 'bills', 'budget'],
      settings: ['settings'],
      import: []
    }[page] || [];
    return req.every(key => typeof P.renderers[key] === 'function');
  }

  async function install() {
    if (typeof renderers !== 'undefined' && typeof P.renderers.goals !== 'function' && typeof renderers.goals === 'function') P.renderers.goals = renderers.goals;
    if (installed || !needed()) return false;
    if (page === 'savings' && typeof P.renderers.goals !== 'function') return false;
    installed = true;

    P.css();
    Object.assign(original, {
      transactions: P.renderers.transactions,
      accounts: P.renderers.accounts,
      savings: P.renderers.savings,
      subscriptions: P.renderers.subscriptions,
      bills: P.renderers.bills,
      budget: P.renderers.budget,
      goals: P.renderers.goals
    });

    routes.splice(0, routes.length,
      ['dashboard', 'Overblik', 'index.html'],
      [page === 'import' ? 'import' : 'transactions', 'Forbrug', 'transactions.html'],
      ['savings', 'Spar penge', 'savings.html'],
      ['settings', 'Indstillinger', 'settings.html']
    );

    titles.dashboard = ['Overblik', 'Hvor kan du spare mest lige nu?'];
    titles.transactions = ['Forbrug', 'Se, forstå og ryd op i dine transaktioner'];
    titles.import = ['Importér', 'Hent dit bankudtog ind i PengePilot'];
    titles.savings = ['Spar penge', 'Konkrete handlinger med størst effekt'];
    titles.settings = ['Indstillinger', 'Profil, sikkerhed og datakvalitet'];

    if (page === 'dashboard') renderers.dashboard = P.renderers.dashboard;
    if (page === 'transactions') renderers.transactions = spendHub;
    if (page === 'savings') renderers.savings = saveHub;
    if (page === 'settings') renderers.settings = P.renderers.settings;

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.querySelector('#modal')) document.querySelector('#modal').innerHTML = '';
    });
    document.addEventListener('click', event => {
      if (event.target?.classList?.contains('modal') && document.querySelector('#modal')) document.querySelector('#modal').innerHTML = '';
      if (event.target.closest?.('.menu a') && innerWidth < 900) document.querySelector('.side')?.classList.remove('open');
    });
    addEventListener('offline', () => typeof toast === 'function' && toast('Du er offline. Ændringer kan ikke gemmes.'));
    addEventListener('online', () => typeof toast === 'function' && toast('Forbindelsen er tilbage.'));
    addEventListener('hashchange', () => ['transactions', 'savings'].includes(page) && render());

    if (typeof currentUser !== 'undefined' && currentUser) {
      shell(currentUser);
      await render();
    }
    return true;
  }

  let tries = 0;
  const timer = setInterval(async () => {
    tries++;
    try {
      if (await install() || tries > 160) clearInterval(timer);
    } catch (error) {
      console.error('PengePilot v14 boot', error);
      clearInterval(timer);
    }
  }, 30);
})();
