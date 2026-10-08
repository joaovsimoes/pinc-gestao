(() => {
  'use strict';
  const groups = [['efetivos', '1'], ['efetivos', '2'], ['aprendizes', 'matutino'], ['aprendizes', 'vespertino']];
  function transform(value, encode) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const agenda = structuredClone(value);
    for (const [audience, period] of groups) {
      const rows = agenda[audience]?.[period];
      if (!Array.isArray(rows)) continue;
      // Numeric fields also keep already-open clients readable during the update.
      agenda[audience][period] = rows.map(row => encode
        ? (Array.isArray(row) ? Object.assign({ _pincStage: Array.from(row, cell => cell === undefined ? null : cell) }, Object.fromEntries(Array.from(row, (cell, index) => [String(index), cell === undefined ? null : cell]))) : row)
        : (Array.isArray(row?._pincStage) ? row._pincStage.map((cell, index) => Object.hasOwn(row, String(index)) ? row[String(index)] : cell) : row));
    }
    return agenda;
  }
  function version(record) {
    const value = Number(record?.agenda?._syncAt || record?.updatedAtMillis || 0);
    return Number.isFinite(value) ? value : 0;
  }
  function latest(rows, location, core = null) {
    const candidates = (rows || []).filter(row => row.location === location && row.agenda &&
      ((row.type === 'agendaFeed' && row.status === 'published') || row.type === 'agendaSnapshot'));
    const locKey = String(location || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (core?.agenda && (core.location === location || (!core.location && locKey === 'anapolis'))) candidates.push(core);
    return candidates.sort((a, b) => version(b) - version(a))[0] || null;
  }
  window.PINC_AGENDA = { encode: value => transform(value, true), decode: value => transform(value, false), version, latest };
})();
