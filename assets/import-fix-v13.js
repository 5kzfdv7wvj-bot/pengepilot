// PengePilot import compatibility v13.
// If a bank export has no recognisable description column, create a temporary blank column.
// import-ai-v8 will then infer another text field or explicitly ask the user for the missing description.
(() => {
  if (document.body?.dataset?.page !== 'import') return;
  if (typeof pp3RenderMapping !== 'function') return;
  const baseRenderMapping = pp3RenderMapping;

  function prepareDescriptionColumn(headerIndex) {
    if (typeof pp3ImportState === 'undefined' || !pp3ImportState?.rows?.length || typeof pp3Mapping !== 'function') return false;
    const rows = pp3ImportState.rows;
    let synthetic = pp3ImportState.syntheticDescriptionIndex;
    if (!Number.isInteger(synthetic)) {
      synthetic = Math.max(...rows.map(row => Array.isArray(row) ? row.length : 0));
      pp3ImportState.syntheticDescriptionIndex = synthetic;
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        while (row.length <= synthetic) row.push('');
      }
    }

    const previous = pp3ImportState.syntheticDescriptionHeader;
    if (Number.isInteger(previous) && rows[previous]) rows[previous][synthetic] = '';

    const index = Number(headerIndex);
    const header = rows[index] || [];
    header[synthetic] = '';
    const hasRealDescription = pp3Mapping(header).description >= 0;
    if (!hasRealDescription) {
      header[synthetic] = 'Beskrivelse (udfyldes eller findes automatisk)';
      pp3ImportState.syntheticDescriptionHeader = index;
      return true;
    }
    pp3ImportState.syntheticDescriptionHeader = null;
    return false;
  }

  pp3RenderMapping = function (headerIndex) {
    const synthetic = prepareDescriptionColumn(headerIndex);
    baseRenderMapping(headerIndex);
    if (!synthetic) return;
    const select = document.querySelector('#pp3Desc');
    const label = select?.closest('.field')?.querySelector('label');
    if (label) label.textContent = 'Beskrivelse / tekst (manglende tekst bliver spurgt om) *';
    const notice = document.querySelector('#preview .notice');
    if (notice) notice.insertAdjacentHTML('beforeend', '<br><small>Der blev ikke fundet en sikker beskrivelseskolonne. PengePilot forsøger andre tekstfelter og spørger dig på de rækker, hvor navnet stadig mangler.</small>');
  };
})();
