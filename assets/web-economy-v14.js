// PengePilot web economy v14: mobile-first spending and account views.
(() => {
  const P = window.pp13;
  if (!P) return;
  const S = P.state;

  async function data() {
    const [tx, cats, acc] = await Promise.all([
      q('transactions', { order: 'transaction_date', limit: 10000 }),
      q('categories', { order: 'sort_order', asc: true }),
      q('accounts', { order: 'created_at', asc: true })
    ]);
    return { tx, cats, acc };
  }

  async function transactions() {
    const { tx, cats, acc } = await data();
    const map = P.categoryMap(cats);
    const other = P.categoryId(cats, 'Andet');
    const active = cats.filter(c => !c.is_archived);
    const unclear = tx.filter(t => !t.category_id || t.category_id === other).length;
    const suspicious = tx.filter(t => P.reviewReason(t, map)).length;
    const month = P.localMonth();
    const summary = P.summary(tx, cats, month);
    const options = id => active.map(c => `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

    return `
      <div class="pp14spend-head">
        <div>
          <div class="sub">Brugt ${esc(P.monthLabel(month))}</div>
          <div class="pp14spend-total bad">${fmt(summary.expenses)}</div>
        </div>
        <a class="btn" href="import.html">Importér bankfil</a>
      </div>

      ${(unclear || suspicious) ? `<div class="notice pp14review"><div><b>${unclear ? `${unclear} kræver kategorisering` : 'Kategorier ser fine ud'}${suspicious ? ` · ${suspicious} bør kontrolleres` : ''}</b><small>PengePilot bruger korrekte kategorier til at finde reelle besparelser.</small></div>${unclear ? '<button id="pp13Categorize" class="btn ghost" onclick="pp13Categorize()">Kategorisér</button>' : ''}</div>` : ''}

      <div class="pp14filters">
        <label class="pp14search"><span>Søg</span><input id="search" placeholder="Butik, tekst eller beløb" oninput="pp13FilterTx()"></label>
        <label><span>Kategori</span><select id="categoryFilter" onchange="pp13FilterTx()"><option value="">Alle kategorier</option>${active.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></label>
      </div>

      <div class="pp14list-head">
        <b>Transaktioner</b>
        <button class="btn ghost pp14manual" onclick="pp13TxForm()">+ Manuel</button>
      </div>

      <div id="pp14bulk" class="pp14bulk hidden"><span id="pp14selected">0 valgt</span><button class="btn ghost pp13danger" onclick="pp13DeleteSelected()">Slet valgte</button><button class="btn ghost" onclick="pp13ToggleAll(false)">Ryd valg</button></div>

      <div id="txbody" class="pp14txlist">
        ${tx.map(t => {
          const category = map[t.category_id]?.name || 'Ukategoriseret';
          const account = acc.find(a => a.id === t.account_id)?.name || 'Konto';
          const reason = P.reviewReason(t, map);
          const description = t.merchant || t.description || 'Manglende beskrivelse';
          const amount = Number(t.amount || 0);
          return `<article class="pp14tx" data-category="${esc(category)}">
            <label class="pp14check"><input class="pp13check" type="checkbox" value="${t.id}" onchange="pp14SelectionChanged()"><span></span></label>
            <div class="pp14txbody">
              <div class="pp14txline"><b class="pp14txname">${esc(description)}</b><b class="pp14amount ${amount < 0 ? 'bad' : 'good'}">${fmt(amount)}</b></div>
              <div class="pp14meta">${P.dateLabel(t.transaction_date)} · ${esc(account)}</div>
              ${reason ? `<div class="pp14warning">${esc(reason)}</div>` : ''}
              <div class="pp14txbottom">
                <select aria-label="Kategori" onchange="changeCategory('${t.id}',this.value)"><option value="">Ukategoriseret</option>${options(t.category_id || '')}</select>
                <div class="pp14txactions"><button class="pp14link" onclick="pp13TxForm('${t.id}')">Redigér</button><button class="pp14link pp13danger" onclick="pp13DeleteTx('${t.id}')">Slet</button></div>
              </div>
            </div>
          </article>`;
        }).join('') || '<div class="card empty">Ingen transaktioner endnu. Importér et bankudtog for at komme i gang.</div>'}
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
    return `<div class="pp14account-head"><div><h2>Dine konti</h2><p class="sub">Saldoen bruges som udgangspunkt for dit reelle råderum.</p></div><button class="btn" onclick="pp13AccountForm()">+ Konto</button></div><div class="pp14accounts">${acc.map(a => {
      const balance = P.balance(a, tx, settings);
      const anchor = settings.balance_anchors?.[a.id];
      const asOf = anchor?.through_date || a.opening_balance_date;
      return `<article class="pp14account ${a.is_archived ? 'pp13muted' : ''}"><div class="pp14txline"><div><b>${esc(a.name)}</b><div class="pp14meta">${esc(a.bank_name || 'Bank ikke angivet')}${asOf ? ` · ${P.dateLabel(asOf)}` : ''}</div></div><b class="pp14account-balance ${balance < 0 ? 'bad' : ''}">${fmt(balance)}</b></div><div class="pp14account-actions"><button class="btn" onclick="pp13BalanceForm('${a.id}',${JSON.stringify(balance)})">Ret saldo</button><button class="btn ghost" onclick="pp13AccountForm('${a.id}')">Redigér</button><button class="pp14link" onclick="pp13ArchiveAccount('${a.id}',${!a.is_archived})">${a.is_archived ? 'Genaktivér' : 'Arkivér'}</button></div></article>`;
    }).join('') || '<div class="card empty">Ingen konti endnu.</div>'}</div><div id="modal"></div>`;
  }

  window.pp14SelectionChanged = () => {
    const count = document.querySelectorAll('.pp13check:checked').length;
    const bar = document.querySelector('#pp14bulk');
    const label = document.querySelector('#pp14selected');
    if (label) label.textContent = `${count} valgt`;
    if (bar) bar.classList.toggle('hidden', !count);
  };

  window.pp13FilterTx = () => {
    const search = P.n(document.querySelector('#search')?.value || '');
    const category = document.querySelector('#categoryFilter')?.value || '';
    document.querySelectorAll('#txbody .pp14tx').forEach(card => {
      const visible = (!search || P.n(card.textContent).includes(search)) && (!category || card.dataset.category === category);
      card.style.display = visible ? '' : 'none';
    });
  };

  window.pp13ToggleAll = on => {
    document.querySelectorAll('#txbody .pp14tx:not([style*="display: none"]) .pp13check').forEach(c => c.checked = on);
    window.pp14SelectionChanged();
  };

  P.renderers.transactions = transactions;
  P.renderers.accounts = accounts;
})();
