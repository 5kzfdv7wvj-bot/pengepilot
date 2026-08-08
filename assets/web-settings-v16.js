// PengePilot settings v16: security first, advanced automation tucked away.
(() => {
  const P = window.pp13;
  if (!P || window.__PP16_SETTINGS__) return;
  window.__PP16_SETTINGS__ = true;
  const base = typeof settingsV2 === 'function' ? settingsV2 : (typeof renderers !== 'undefined' ? renderers.settings : null);

  async function settings() {
    const [baseHtml, rules, cats, tx, imports, ai] = await Promise.all([
      base ? base() : '',
      q('category_rules', { order:'priority', asc:true }),
      q('categories'),
      q('transactions', { limit:10000 }),
      q('imports', { order:'created_at' }),
      P.aiStatus()
    ]);
    const map = P.categoryMap(cats), other = P.categoryId(cats, 'Andet');
    const learned = rules.filter(r => String(r.name || '').startsWith('Lært:'));
    const unclear = tx.filter(t => !t.category_id || t.category_id === other).length;
    const suspicious = tx.filter(t => P.reviewReason(t, map)).length;
    const completedImports = imports.filter(x => x.status === 'completed');
    const lastImport = completedImports[0]?.imported_at || completedImports[0]?.created_at || null;
    return `${baseHtml}
      <div class="pp16section" style="margin-top:16px">
        <div class="pp16section-intro"><div><div class="pp16eyebrow">AUTOMATIK</div><h2>Sådan lærer PengePilot</h2><p>Manuelle kategorirettelser bliver til regler. AI bruges kun som fallback og handlingshjælp.</p></div></div>
        <div class="pp16home-grid">
          <div class="card pp16compact-card"><div class="pp16section-head"><div><h3>Datakvalitet</h3><small>Det der påvirker analyser og spareforslag.</small></div></div>
            <div class="pp16line"><span>Transaktioner</span><b>${tx.length}${tx.length >= 10000 ? '+' : ''}</b></div>
            <div class="pp16line"><span>Kræver kategorisering</span><b class="${unclear ? 'bad' : 'good'}">${unclear}</b></div>
            <div class="pp16line"><span>Bør kontrolleres</span><b class="${suspicious ? 'warn' : 'good'}">${suspicious}</b></div>
            <div class="pp16line"><span>Seneste import</span><b>${lastImport ? P.dateLabel(lastImport) : '—'}</b></div>
            <div class="pp16line"><span>PengePilot AI</span><b class="${ai.configured && ai.agent ? 'good' : ''}">${ai.configured && ai.agent ? 'Klar' : ai.configured ? 'Delvist klar' : 'Ikke aktiv'}</b></div>
            ${(unclear || suspicious) ? '<a class="btn ghost" style="margin-top:10px" href="transactions.html">Gennemgå transaktioner</a>' : ''}
          </div>
          <div class="card pp16compact-card"><div class="pp16section-head"><div><h3>Lærte kategorier</h3><small>${learned.length} aktive eller gemte regler.</small></div></div>
            ${learned.length ? `<details class="pp16history"><summary>Administrér regler</summary>${learned.slice(0,100).map(r => `<div class="pp16plan-row"><div><b>${esc(r.match_value)}</b><small>→ ${esc(map[r.category_id]?.name || 'Ukendt')} · ${r.enabled ? 'Aktiv' : 'Slået fra'}</small></div><div class="pp16row-actions"><button class="pp14link" onclick="pp16RuleToggle('${r.id}',${!r.enabled})">${r.enabled ? 'Slå fra' : 'Slå til'}</button><button class="pp14link pp13danger" onclick="pp16RuleDelete('${r.id}')">Slet</button></div></div>`).join('')}</details><button class="pp14link pp13danger" style="margin-top:9px" onclick="pp16RulesClear()">Ryd alle lærte regler</button>` : '<div class="empty">Ingen lærte regler endnu. Når du retter en kategori manuelt, kan PengePilot huske valget.</div>'}
          </div>
        </div>
      </div>`;
  }

  window.pp16RuleToggle = async (id, enabled) => { try { const r = await sb.from('category_rules').update({ enabled }).eq('id', id); if (r.error) throw r.error; toast('Regel opdateret'); render(); } catch (error) { alert(P.err(error)); } };
  window.pp16RuleDelete = async id => { if (!confirm('Slet denne lærte regel? Eksisterende transaktioner ændres ikke.')) return; const r = await sb.from('category_rules').delete().eq('id', id); if (r.error) return alert(P.err(r.error)); toast('Regel slettet'); render(); };
  window.pp16RulesClear = async () => { if (!confirm('Slet alle lærte kategoriregler? Eksisterende kategorier beholdes.')) return; const r = await sb.from('category_rules').delete().like('name', 'Lært:%'); if (r.error) return alert(P.err(r.error)); toast('Lærte regler ryddet'); render(); };

  P.renderers.settings = settings;
})();
