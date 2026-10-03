(() => {
  'use strict';
  const period = (audience, value) => audience === 'aprendizes' ? String(value || 'matutino').toLowerCase() : String(value || '1').replace(/[^12]/g, '') || '1';
  const key = (location, audience, value) => JSON.stringify([location, audience, period(audience, value)]);
  const events = rows => (rows || []).filter(r => r.type === 'periodReset' && ['agenda', 'report'].includes(r.kind) && r.location && ['efetivos', 'aprendizes'].includes(r.audience) && Number(r.createdAtMillis) > 0);
  function cutoff(rows, location, audience, value, kind) {
    const context = key(location, audience, value);
    return events(rows).filter(r => r.kind === kind && key(r.location, r.audience, r.period) === context).reduce((max, r) => Math.max(max, Number(r.createdAtMillis)), 0);
  }
  function reportMatches(record, location, audience, value) {
    return (!record.location || record.location === location) && (record.audience || 'efetivos') === audience && period(audience, record.period) === period(audience, value);
  }
  function apply(state, rows, location) {
    for (const reset of events(rows).filter(r => r.location === location && r.kind === 'agenda')) {
      const stamp = Number(reset.createdAtMillis), context = key(location, reset.audience, reset.period), p = period(reset.audience, reset.period);
      state.agenda ||= {};
      state.agenda._periodResets ||= {};
      if (Number(state.agenda._periodResets[context] || 0) < stamp) {
        for (const stage of state.agenda[reset.audience]?.[p] || []) { stage[6] = ''; stage[7] = ''; }
        state.agenda._periodResets[context] = stamp;
      }
      state.live ||= {}; state.live[reset.audience] ||= {};
      if (Number(state.live[reset.audience][p]?._periodResetAt || 0) < stamp) {
        state.live[reset.audience][p] = { completed: 0, activeIndex: 0, activePct: 0, running: false, startedAt: null, actualStart: null, elapsedBefore: 0, elapsedSeconds: 0, _updatedAt: stamp, _updatedBy: 'gestao-reset', _periodResetAt: stamp };
      }
    }
    state.reports = (state.reports || []).filter(r => {
      const loc = r.location || location, audience = r.audience || 'efetivos';
      const agendaAt = cutoff(rows, loc, audience, r.period, 'agenda'), reportAt = cutoff(rows, loc, audience, r.period, 'report');
      return Number(r.periodResetAt || 0) >= agendaAt && Number(r.reportResetAt || 0) >= reportAt;
    });
    return state;
  }
  function stampReport(record, rows, location) {
    const loc = record.location || location, audience = record.audience || 'efetivos';
    record.periodResetAt = cutoff(rows, loc, audience, record.period, 'agenda');
    record.reportResetAt = cutoff(rows, loc, audience, record.period, 'report');
    record.recordedAtMillis = Date.now();
    return record;
  }
  function freshFeed(record, rows) {
    if (!record) return false;
    const resetAt = cutoff(rows, record.location, record.audience, record.period, 'agenda');
    return !resetAt || (record.commandLock === true ? Number(record.startedAtMillis || 0) > resetAt : Number(record.periodResetAt || 0) >= resetAt);
  }
  async function read(db, location) {
    const snapshot = await db.collection('pincLocks').where('location', '==', location).get({ source: 'server' });
    return snapshot.docs.filter(d => !d.metadata?.hasPendingWrites).map(d => d.data());
  }
  async function create(db, uid, target) {
    if (!db || !uid) throw new Error('OFFLINE');
    const periods = [...new Set(target.periods.map(p => period(target.audience, p)))];
    const rows = await read(db, target.location);
    if (target.kind === 'agenda' && rows.some(r => r.location === target.location && r.audience === target.audience && periods.includes(period(r.audience, r.period)) && r.commandLock === true && r.running === true && r.status === 'active' && freshFeed(r, rows) && Date.now() - Number(r.heartbeatAtMillis || r.heartbeatAt?.toMillis?.() || 0) < 45000)) throw new Error('RUNNING');
    const now = Date.now(), batch = db.batch();
    const created = periods.map(p => ({ type: 'periodReset', status: 'applied', commandLock: false, running: false, ownerUid: uid, location: target.location, audience: target.audience, period: p, kind: target.kind, createdAtMillis: now }));
    created.forEach(record => batch.set(db.collection('pincLocks').doc(), record));
    await batch.commit();
    return [...events(rows), ...created];
  }
  window.PINC_RESET = { period, key, events, cutoff, reportMatches, apply, stampReport, freshFeed, read, create };
})();
