// PengePilot economy v16: month-focused transaction review and cleaner account controls.
(() => {
  const P = window.pp13;
  if (!P || window.__PP16_ECONOMY__) return;
  window.__PP16_ECONOMY__ = true;
  const S = P.state;
  S.txMonth ||= P.localMonth();
  S.txReviewOnly ||= false;

  async function data() {
    const [tx, cats, acc] = await Promise.all([
      q('transactions', { order: 'transaction_date', limit: 10000 }),
      q('categories', { order: 'sort_order', asc: true }),
      q('accounts', { order: 'created_at', asc: true })
    ]);
    return { tx, cats, acc };
  }

  function monthRows(tx) {
    return tx.filter(t => String(t.transaction_date).startsWith(S.txMonth));
  }

  async function transactions() {
    const { tx, cats, acc } = await data();
    const map = P.categoryMap(cats);
    const other = P.categoryId(cats, 'Andet');
    const active = cats.filter(c => !c.is_archived);
    const rows = monthRows(tx);
    const summary = P.summary(rows, cats);
    const unclear = rows.filter(t => !t.category_id || t.category_id === other).length;
    const suspicious = rows.filter(t => P.reviewReason(t, map)).length;
    const options = id => active.map(c => `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

    return `
      <div class="pp16monthbar">
        <button class="pp16iconbtn" type="button" onclick="pp16TxMonth(-1)" aria-label="Forrige måned">←</button>
        <div><b>${esc(P.monthLabel(S.txMonth))}</b><small>${rows.length} transaktion${rows.length === 1 ? '' : 'er'}</small></div>
        <button class="pp16iconbtn" type="button" onclick="pp16TxMonth(1)" aria-label="Næste måned" ${S.txMonth >= P.localMonth() ? 'disabled' : ''}>→</button>
      </div>

      <div class="pp16spend-summary">
        <div><span>Udgifter</span><b>${fmt(summary.expenses)}</b></div>
        <div><span>Indkomst</span><b class="good">${fmt(summary.income)}</b></div>
        <div><span>Netto</span><b class="${summary.net >= 0 ? 'good' : 'bad'}">${fmt(summary.net)}</b></div>
      </div>

      <div class="pp16actions-row">
        <a class="btn pp16primary" href="import.html">Importér bankfil</a>
        <button class="btn ghost" type="button" onclick="pp13TxForm()">+ Manuel transaktion</button>
      </div>

      ${(unclear || suspicious) ? `<div class="notice pp16quality"><div><b>${unclear + suspicious} postering${unclear + suspicious === 1 ? '' : 'er'} kræver opmærksomhed</b><small>${unclear ? `${unclear} uklare kategorier. ` : ''}${suspicious ? `${suspicious} mulige fejlklassifikationer.` : ''}</small></div><div class="pp16quality-actions">${unclear ? '<button id="pp13Categorize" class="btn ghost" onclick="pp13Categorize()">Kategorisér</button>' : ''}<button class="btn ghost" onclick="pp16ReviewOnly()">${S.txReviewOnly ? 'Vis alle' : 'Vis kun dem'}</button></div></div>` : ''}

      <div class="pp16filters">
        <label><span>Søg</span><input id="search" inputmode="search" placeholder="Butik, tekst eller beløb" oninput="pp16FilterTx()"></label>
        <label><span>Kategori</span><select id="categoryFilter" onchange="pp16FilterTx()"><option value="">Alle</option>${active.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></label>
      </div>

      <div class="pp16listhead"><b>Transaktioner</b><button type="button" class="pp14link" onclick="pp13ToggleAll(true)">Vælg viste</button></div>
      <div id="pp14bulk" class="pp14bulk hidden"><span id="pp14selected">0 valgt</span><button class="btn ghost pp13danger" onclick="pp13DeleteSelected()">Slet valgte</button><button class="btn ghost" onclick="pp13ToggleAll(false)">Ryd valg</button></div>

      <div id="txbody" class="pp16txlist">
        ${rows.map(t => {
          const category = map[t.category_id]?.name || 'Ukategoriseret';
          const account = acc.find(a => a.id === t.account_id)?.name || 'Konto';
          const reason = P.reviewReason(t, map);
          const needsReview = !t.category_id || t.category_id === other || Boolean(reason);
          const description = t.merchant || t.description || 'Manglende beskrivelse';
          const amount = Number(t.amount || 0);
          return `<article class="pp16tx" data-category="${esc(category)}" data-review="${needsReview ? '1' : '0'}">
            <label class="pp16check"><input class="pp13check" type="checkbox" value="${t.id}" onchange="pp16SelectionChanged()"><span></span></label>
            <div class="pp16txbody">
              <div class="pp16txmain"><div><b class="pp16txname">${esc(description)}</b><small>${P.dateLabel(t.transaction_date)} · ${esc(account)}</small></div><b class="pp16amount ${amount < 0 ? 'bad' : 'good'}">${fmt(amount)}</b></div>
              ${reason ? `<div class="pp16warning">${esc(reason)}</div>` : ''}
              <div class="pp16txfooter">
                <select aria-label="Kategori" onchange="changeCategory('${t.id}',this.value)"><option value="">Ukategoriseret</option>${options(t.category_id || '')}</select>
                <button class="pp14link" onclick="pp13TxForm('${t.id}')">Redigér</button>
                <button class="pp14link pp13danger" onclick="pp13DeleteTx('${t.id}')">Slet</button>
              </div>
            </div>
          </article>`;
        }).join('') || '<div class="card empty">Ingen transaktioner i denne måned.</div>'}
      </div>
      <div id="modal"></div>`;
  }

  async function accounts() {
    const [acc, tx, settings] = await Promise.all([
      q('accounts', { order: 'created_at', asc: true }),
      q('transactions', { limit: 10000 }),
      P.settings()
    ]);
    S.accounts = acc;
    const active = acc.filter(a => !a.is_archived);
    const total = active.reduce((sum, a) => sum + P.balance(a, tx, settings), 0);
    return `
      <div class="pp16account-summary card"><div><div class="pp16eyebrow">SAMLET SALDO</div><div class="pp16account-total ${total < 0 ? 'bad' : ''}">${fmt(total)}</div><small>${active.length} aktive konti</small></div><button class="btn" onclick="pp13AccountForm()">+ Konto</button></div>
      <div class="pp16account-list">${acc.map(a => {
        const balance = P.balance(a, tx, settings);
        const anchor = settings.balance_anchors?.[a.id];
        const asOf = anchor?.through_date || a.opening_balance_date;
        return `<article class="pp16account ${a.is_archived ? 'pp13muted' : ''}">
          <div class="pp16account-main"><div><b>${esc(a.name)}</b><small>${esc(a.bank_name || 'Bank ikke angivet')}${asOf ? ` · saldo pr. ${P.dateLabel(asOf)}` : ''}</small></div><b class="${balance < 0 ? 'bad' : ''}">${fmt(balance)}</b></div>
          <div class="pp16account-actions"><button class="btn" onclick="pp13BalanceForm('${a.id}',${JSON.stringify(balance)})">Ret saldo</button><button class="btn ghost" onclick="pp13AccountForm('${a.id}')">Redigér</button><button class="pp14link" onclick="pp13ArchiveAccount('${a.id}',${!a.is_archived})">${a.is_archived ? 'Genaktivér' : 'Arkivér'}</button></div>
        </article>`;
      }).join('') || '<div class="card empty">Ingen konti endnu. Opret den konto, du importerer bankudtog til.</div>'}</div><div id="modal"></div>`;
  }

  window.pp16TxMonth = delta => {
    const next = P.shiftMonth(S.txMonth || P.localMonth(), delta);
    S.txMonth = next > P.localMonth() ? P.localMonth() : next;
    render();
  };
  window.pp16ReviewOnly = () => { S.txReviewOnly = !S.txReviewOnly; window.pp16FilterTx(); };
  window.pp16SelectionChanged = () => {
    const count = document.querySelectorAll('.pp13check:checked').length;
    document.querySelector('#pp14selected')?.replaceChildren(document.createTextNode(`${count} valgt`));
    document.querySelector('#pp14bulk')?.classList.toggle('hidden', !count);
  };
  window.pp14SelectionChanged = window.pp16SelectionChanged;
  window.pp16FilterTx = () => {
    const search = P.n(document.querySelector('#search')?.value || '');
    const category = document.querySelector('#categoryFilter')?.value || '';
    document.querySelectorAll('#txbody .pp16tx').forEach(card => {
      const visible = (!search || P.n(card.textContent).includes(search)) && (!category || card.dataset.category === category) && (!S.txReviewOnly || card.dataset.review === '1');
      card.style.display = visible ? '' : 'none';
    });
  };
  window.pp13FilterTx = window.pp16FilterTx;
  window.pp13ToggleAll = on => {
    document.querySelectorAll('#txbody .pp16tx:not([style*="display: none"]) .pp13check').forEach(c => c.checked = on);
    window.pp16SelectionChanged();
  };

  P.renderers.transactions = transactions;
  P.renderers.accounts = accounts;
})();
