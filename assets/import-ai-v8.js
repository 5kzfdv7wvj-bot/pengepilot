// PengePilot import v8: require missing descriptions and AI-categorize unresolved imported transactions.
(() => {
  if (document.body?.dataset?.page !== 'import') return;

  let draftRows = [];
  let missingRows = [];
  let categoriesCache = [];
  let rulesCache = [];
  let importStats = {};

  function textCandidate(value) {
    const s = String(value ?? '').trim();
    if (s.length < 2 || s.length > 180 || !/[A-Za-zÆØÅæøå]/.test(s)) return false;
    const n = pp3Norm(s);
    if (!n || ['dkk', 'eur', 'usd', 'sek', 'nok', 'saldo', 'balance', 'debet', 'kredit'].includes(n)) return false;
    return !pp3BankDate(s) && !Number.isFinite(pp3Amount(s));
  }

  function guessDescription(row, excluded) {
    const candidates = row
      .map((value, index) => ({ index, value: String(value ?? '').trim() }))
      .filter(x => !excluded.has(x.index) && textCandidate(x.value))
      .sort((a, b) => b.value.length - a.value.length);
    return candidates[0]?.value || '';
  }

  function amountFromRow(row, amountIndex, debitIndex, creditIndex) {
    if (amountIndex >= 0) return pp3Amount(pp3Cell(row, amountIndex));
    const debit = pp3Amount(pp3Cell(row, debitIndex));
    const credit = pp3Amount(pp3Cell(row, creditIndex));
    if (!Number.isFinite(debit) && !Number.isFinite(credit)) return NaN;
    return (Number.isFinite(credit) ? Math.abs(credit) : 0) - (Number.isFinite(debit) ? Math.abs(debit) : 0);
  }

  function localCategoryId(tx) {
    const learned = rulesCache.find(r => r.enabled && ruleMatches(r, tx));
    return learned?.category_id || fallbackCategoryId(tx, categoriesCache) || categoriesCache.find(c => pp3Norm(c.name) === 'andet')?.id || null;
  }

  async function rebuildParsedImport() {
    const occurrences = {};
    const rows = [];
    for (const item of draftRows.filter(x => !x.skip && x.description).sort((a, b) => a.order - b.order)) {
      const tx = {
        transaction_date: item.transaction_date,
        description: item.description,
        merchant: item.description,
        amount: item.amount
      };
      tx.category_id = localCategoryId(tx);
      const base = `${tx.transaction_date}|${normalizeMerchant(tx.description)}|${Number(tx.amount).toFixed(2)}`;
      occurrences[base] = (occurrences[base] || 0) + 1;
      tx.source_hash = await sha256(`${base}|${occurrences[base]}`);
      rows.push(tx);
    }
    parsedImport = rows;
    parsedImportFile = { name: pp3ImportState.file.name, hash: pp3ImportState.rawHash };
    parsedImportMeta = {
      format: pp3ImportState.format,
      encoding: pp3ImportState.encoding,
      delimiter: pp3ImportState.delimiter === '\t' ? 'tab' : pp3ImportState.delimiter,
      sheet: pp3ImportState.sheetName || null,
      header_row: pp3ImportState.headerIndex + 1,
      columns: importStats.columns,
      invalid: importStats.invalid,
      inferred_descriptions: importStats.inferredDescriptions,
      user_supplied_descriptions: missingRows.filter(x => x.description && !x.skip).length,
      skipped_missing_descriptions: missingRows.filter(x => x.skip).length,
      importer: 'v8-ai'
    };
  }

  function renderFinalPreview() {
    const result = document.querySelector('#pp3Result');
    if (!result) return;
    const cmap = categoryMap(categoriesCache);
    const otherId = categoriesCache.find(c => pp3Norm(c.name) === 'andet')?.id || null;
    const unresolved = parsedImport.filter(t => !t.category_id || (otherId && t.category_id === otherId)).length;
    const ignored = Number(importStats.invalid?.date || 0) + Number(importStats.invalid?.amount || 0) + missingRows.filter(x => x.skip).length;
    result.innerHTML = `
      <div class="notice good"><b>${parsedImport.length} transaktioner klar.</b>${ignored ? ` ${ignored} rækker bliver ikke importeret.` : ''}</div>
      ${unresolved ? `<div class="notice"><b>${unresolved} uklare posteringer.</b> De er foreløbigt sat til “Andet” og sendes efter import til OpenAI som fallback, hvis API-nøglen er aktiv. Resten beholder lokale/lærte kategorier.</div>` : '<div class="notice good">Alle posteringer har allerede en lokal eller lært kategori.</div>'}
      <div class="card" style="overflow:auto"><table><thead><tr><th>Dato</th><th>Navn / beskrivelse</th><th>Kategori</th><th>Beløb</th></tr></thead><tbody>${parsedImport.slice(0, 25).map(r => `<tr><td>${esc(r.transaction_date)}</td><td>${esc(r.description)}</td><td>${esc(cmap[r.category_id]?.name || 'Ukategoriseret')}</td><td class="${r.amount < 0 ? 'bad' : 'good'}">${fmt(r.amount)}</td></tr>`).join('')}</tbody></table></div>
      <button id="pp3Commit" class="btn" onclick="pp3CommitImport()">Importér og kategorisér ${parsedImport.length} transaktioner</button>`;
  }

  window.pp8ApplyMissingDescriptions = async function () {
    const unresolved = [];
    for (const item of missingRows) {
      const input = document.querySelector(`#pp8desc-${item.key}`);
      const skip = document.querySelector(`#pp8skip-${item.key}`)?.checked;
      const description = String(input?.value || '').trim();
      if (!description && !skip) unresolved.push(item.rowNumber);
      item.skip = Boolean(skip);
      item.description = description;
    }
    if (unresolved.length) return alert(`Udfyld navn/beskrivelse eller markér “Spring over” på række ${unresolved.slice(0, 8).join(', ')}${unresolved.length > 8 ? '…' : ''}.`);
    await rebuildParsedImport();
    renderFinalPreview();
  };

  function renderMissingDescriptions() {
    const result = document.querySelector('#pp3Result');
    if (!result) return;
    result.innerHTML = `
      <div class="notice bad"><b>${missingRows.length} postering${missingRows.length === 1 ? '' : 'er'} mangler navn/beskrivelse.</b> PengePilot importerer dem ikke lydløst. Udfyld teksten eller vælg aktivt at springe rækken over.</div>
      <div class="card"><h3>Udfyld manglende tekst</h3>${missingRows.map(item => `<div class="row" style="align-items:flex-end"><div style="flex:1"><small>Række ${item.rowNumber} · ${esc(item.transaction_date)} · ${fmt(item.amount)}</small><div class="field" style="margin:6px 0"><input id="pp8desc-${item.key}" placeholder="Fx Løn, Netto, husleje, overførsel…" value="${esc(item.description || '')}"></div></div><label style="font-size:12px;white-space:nowrap"><input id="pp8skip-${item.key}" type="checkbox"> Spring over</label></div>`).join('')}</div>
      <button class="btn" onclick="pp8ApplyMissingDescriptions()">Gem beskrivelser og fortsæt</button>`;
  }

  pp3BuildPreview = async function () {
    const result = document.querySelector('#pp3Result');
    if (!pp3ImportState || !result) return;
    const dateIndex = Number(document.querySelector('#pp3Date')?.value ?? -1);
    const descIndex = Number(document.querySelector('#pp3Desc')?.value ?? -1);
    const amountIndex = Number(document.querySelector('#pp3Amount')?.value ?? -1);
    const debitIndex = Number(document.querySelector('#pp3Debit')?.value ?? -1);
    const creditIndex = Number(document.querySelector('#pp3Credit')?.value ?? -1);
    if (dateIndex < 0 || descIndex < 0) return alert('Vælg dato og beskrivelse.');
    if (amountIndex < 0 && debitIndex < 0 && creditIndex < 0) return alert('Vælg en beløbskolonne eller Debet/Kredit.');

    result.innerHTML = '<div class="notice">Bygger preview og kontrollerer manglende beskrivelser…</div>';
    [categoriesCache, rulesCache] = await Promise.all([
      q('categories', { order: 'sort_order', asc: true }),
      q('category_rules', { order: 'priority', asc: true })
    ]);

    const invalid = { date: 0, amount: 0 };
    let inferredDescriptions = 0;
    draftRows = [];
    missingRows = [];
    const excluded = new Set([dateIndex, descIndex, amountIndex, debitIndex, creditIndex].filter(i => i >= 0));
    const sourceRows = pp3ImportState.rows.slice(pp3ImportState.headerIndex + 1);

    for (let i = 0; i < sourceRows.length; i++) {
      const row = sourceRows[i];
      const date = pp3BankDate(pp3Cell(row, dateIndex));
      const amount = amountFromRow(row, amountIndex, debitIndex, creditIndex);
      if (!date || !Number.isFinite(amount)) {
        if (!date) invalid.date++;
        if (!Number.isFinite(amount)) invalid.amount++;
        continue;
      }
      let description = String(pp3Cell(row, descIndex) ?? '').trim();
      let inferred = false;
      if (!description) {
        description = guessDescription(row, excluded);
        inferred = Boolean(description);
        if (inferred) inferredDescriptions++;
      }
      const item = {
        key: `r${i}`,
        order: i,
        rowNumber: i + pp3ImportState.headerIndex + 2,
        transaction_date: date,
        amount,
        description,
        inferred,
        skip: false
      };
      draftRows.push(item);
      if (!description) missingRows.push(item);
    }

    importStats = {
      columns: { date: dateIndex, description: descIndex, amount: amountIndex, debit: debitIndex, credit: creditIndex },
      invalid,
      inferredDescriptions
    };

    if (!draftRows.length) {
      result.innerHTML = `<div class="notice bad"><b>0 gyldige transaktioner.</b><br>Ugyldig dato: ${invalid.date} · ugyldigt beløb: ${invalid.amount}. Kontrollér mappingen ovenfor.</div>`;
      return;
    }
    if (missingRows.length) {
      renderMissingDescriptions();
      return;
    }
    await rebuildParsedImport();
    renderFinalPreview();
  };

  pp3CommitImport = async function () {
    if (!parsedImport.length || !parsedImportFile) return alert('Lav først et gyldigt preview.');
    const accountId = document.querySelector('#importAccount')?.value;
    if (!accountId) return alert('Vælg en konto.');
    const button = document.querySelector('#pp3Commit');
    if (button) { button.disabled = true; button.textContent = 'Importerer…'; }

    let imp = null;
    try {
      const { data: existing, error: lookupError } = await sb.from('imports').select('id,status,created_at').eq('account_id', accountId).eq('file_hash', parsedImportFile.hash).order('created_at', { ascending: false }).limit(1);
      if (lookupError) throw lookupError;
      const previous = existing?.[0];
      if (previous?.status === 'completed') throw new Error('Denne fil er allerede importeret til den valgte konto.');
      if (previous) {
        await sb.from('transactions').delete().eq('import_id', previous.id);
        const { error: deleteError } = await sb.from('imports').delete().eq('id', previous.id);
        if (deleteError) throw deleteError;
      }

      const { data: created, error: importError } = await sb.from('imports').insert({
        user_id: currentUser.id,
        account_id: accountId,
        source_type: pp3ImportState.format === 'excel' ? 'xlsx' : 'csv',
        original_filename: parsedImportFile.name,
        file_hash: parsedImportFile.hash,
        status: 'processing',
        row_count: parsedImport.length,
        metadata: { client: 'github-pages', ...parsedImportMeta }
      }).select().single();
      if (importError) throw importError;
      imp = created;

      let inserted = 0;
      let skipped = 0;
      const insertedRows = [];
      for (let i = 0; i < parsedImport.length; i += 50) {
        const chunk = parsedImport.slice(i, i + 50);
        const hashes = chunk.map(r => r.source_hash);
        const { data: known, error: knownError } = await sb.from('transactions').select('source_hash').eq('account_id', accountId).in('source_hash', hashes);
        if (knownError) throw knownError;
        const found = new Set((known || []).map(r => r.source_hash));
        const fresh = chunk.filter(r => !found.has(r.source_hash));
        skipped += chunk.length - fresh.length;
        if (!fresh.length) continue;
        const payload = fresh.map(r => ({ ...r, user_id: currentUser.id, account_id: accountId, import_id: imp.id, is_manual: false }));
        const { data: saved, error: insertError } = await sb.from('transactions').insert(payload).select('id,category_id');
        if (insertError) throw insertError;
        inserted += saved?.length || 0;
        insertedRows.push(...(saved || []));
      }

      const otherId = categoriesCache.find(c => pp3Norm(c.name) === 'andet')?.id || null;
      const aiIds = insertedRows.filter(r => !r.category_id || (otherId && r.category_id === otherId)).map(r => r.id);
      let aiResult = { configured: false, changed: 0, ai: 0, learned: 0, remaining: aiIds.length };
      let aiError = null;
      if (aiIds.length && window.ppAI) {
        if (button) button.textContent = `AI kategoriserer ${aiIds.length} uklare…`;
        try { aiResult = await window.ppAI.categorizeIds(aiIds); }
        catch (error) { aiError = String(error?.message || error || 'AI-kategorisering fejlede.'); }
      }

      const metadata = {
        client: 'github-pages',
        ...parsedImportMeta,
        parsed_rows: parsedImport.length,
        skipped_duplicates: skipped,
        ai: {
          attempted: aiIds.length,
          configured: Boolean(aiResult.configured),
          changed: Number(aiResult.changed || 0),
          ai_changed: Number(aiResult.ai || 0),
          learned_changed: Number(aiResult.learned || 0),
          remaining: Number(aiResult.remaining || 0),
          model: aiResult.model || null,
          error: aiError
        }
      };
      const { error: finishError } = await sb.from('imports').update({ status: 'completed', imported_at: new Date().toISOString(), row_count: inserted, metadata }).eq('id', imp.id);
      if (finishError) throw finishError;

      const aiText = aiIds.length
        ? aiError
          ? ' · AI kunne ikke køre nu'
          : aiResult.configured
            ? ` · ${Number(aiResult.ai || 0)} AI-kategoriseret`
            : ' · AI afventer API-nøgle'
        : '';
      toast(`Import færdig · ${inserted} nye${skipped ? ` · ${skipped} dubletter` : ''}${aiText}`);
      setTimeout(() => { location.href = 'transactions.html'; }, 1100);
    } catch (error) {
      console.error(error);
      if (imp?.id) {
        await sb.from('transactions').delete().eq('import_id', imp.id);
        await sb.from('imports').update({ status: 'failed', metadata: { client: 'github-pages', ...parsedImportMeta, error: String(error?.message || error) } }).eq('id', imp.id);
      }
      if (button) { button.disabled = false; button.textContent = `Importér og kategorisér ${parsedImport.length} transaktioner`; }
      alert(`Importen kunne ikke gennemføres: ${error.message}`);
    }
  };
})();
