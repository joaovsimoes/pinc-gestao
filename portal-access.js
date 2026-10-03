/* Stars and Hosts share one online registry. Code reservations are immutable. */
(function (root) {
  'use strict';
  let database = null, connection = null;
  const normalizeCode = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  const buildingSlug = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
  function prefix(role, building) {
    if (role === 'host') return 'HOST';
    if (role !== 'star' || !buildingSlug(building)) throw new Error('BUILDING_REQUIRED');
    return 'STAR-' + buildingSlug(building) + '-';
  }
  function codeFor(role, building, sequence) { return prefix(role, building) + String(sequence).padStart(3, '0'); }
  function timeout(promise) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('PORTAL_OFFLINE')), 15000); })])
      .finally(() => clearTimeout(timer));
  }
  async function connect() {
    if (database && root.firebase.auth().currentUser) return database;
    if (!connection) connection = (async () => {
      if (!root.firebase) throw new Error('PORTAL_OFFLINE');
      if (!root.firebase.apps.length) root.firebase.initializeApp(root.PINC_FIREBASE_CONFIG || root.PINC_MANAGEMENT_CONFIG);
      const auth = root.firebase.auth();
      if (!auth.currentUser) await auth.signInAnonymously();
      database = root.firebase.firestore();
      return database;
    })().finally(() => { connection = null; });
    return connection;
  }
  function query(db) { return db.collection('pincLocks').where('type', 'in', ['portalAccess', 'portalAccessEvent']); }
  function decode(snapshot) {
    const rows = snapshot.docs.map(doc => ({ ...doc.data(), _documentId: doc.id }));
    const millis = row => row.updatedAt?.toMillis?.() || Number(row.updatedAtMillis || 0);
    rows.sort((a, b) => millis(a) - millis(b) || a._documentId.localeCompare(b._documentId));
    const records = new Map();
    for (const row of rows) {
      if (row.type === 'portalAccess' && typeof row.code === 'string' &&
          /^(?:HOST\d{3}|STAR-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3})$/.test(row.code) &&
          ['host', 'star'].includes(row.role) && (row.role === 'host') === row.code.startsWith('HOST') &&
          typeof row.location === 'string' && row.location) records.set(row.code, {
        id: row.code, code: row.code, role: row.role, name: row.name, building: row.building || '',
        location: row.location, prefix: row.prefix, sequence: row.sequence, active: row.active !== false
      });
      else if (row.type === 'portalAccessEvent' && records.has(row.targetId)) {
        const record = records.get(row.targetId);
        // Code, role, building and sequence stay attached to the reservation.
        records.set(row.targetId, { ...record,
          name: typeof row.patch?.name === 'string' ? row.patch.name : record.name,
          active: typeof row.patch?.active === 'boolean' ? row.patch.active : record.active });
      }
    }
    return [...records.values()];
  }
  async function load() {
    const db = await timeout(connect());
    return decode(await timeout(query(db).get({ source: 'server' })));
  }
  async function create(input) {
    const name = String(input.name || '').trim(), location = String(input.location || '').trim();
    const building = input.role === 'star' ? String(input.building || '').trim() : '';
    if (!name || !location) throw new Error('FIELDS_REQUIRED');
    const p = prefix(input.role, building), db = await timeout(connect());
    const records = await load();
    let next = records.filter(u => u.prefix === p).reduce((max, u) => Math.max(max, Number(u.sequence) || 0), 0) + 1;
    // A transaction claims the actual code document: two computers cannot create the same code.
    while (next <= 999) {
      const sequence = next++, code = codeFor(input.role, building, sequence);
      const ref = db.collection('pincLocks').doc('portalAccess_' + code);
      try {
        await timeout(db.runTransaction(async transaction => {
          const existing = await transaction.get(ref);
          if (existing.exists) throw new Error('CODE_COLLISION');
          transaction.set(ref, {
            type: 'portalAccess', ownerUid: root.firebase.auth().currentUser.uid,
            code, role: input.role, name, building, location, prefix: p, sequence, active: true,
            updatedAt: root.firebase.firestore.FieldValue.serverTimestamp(), updatedAtMillis: Date.now()
          });
        }));
        const saved = await timeout(ref.get({ source: 'server' }));
        if (!saved.exists) throw new Error('PORTAL_OFFLINE');
        return { id: code, code, role: input.role, name, building, location, prefix: p, sequence, active: true };
      } catch (error) {
        if (error.message !== 'CODE_COLLISION') throw error;
      }
    }
    throw new Error('SEQUENCE_FULL');
  }
  async function update(id, changes) {
    const db = await timeout(connect()), current = (await load()).find(u => u.id === id);
    if (!current) throw new Error('ACCESS_NOT_FOUND');
    const patch = {};
    if ('name' in changes) {
      patch.name = String(changes.name || '').trim();
      if (!patch.name) throw new Error('FIELDS_REQUIRED');
    }
    if ('active' in changes) patch.active = changes.active === true;
    const ref = await timeout(db.collection('pincLocks').add({ type: 'portalAccessEvent',
      ownerUid: root.firebase.auth().currentUser.uid, targetId: id, location: current.location, patch,
      updatedAt: root.firebase.firestore.FieldValue.serverTimestamp(), updatedAtMillis: Date.now() }));
    await timeout(ref.get({ source: 'server' }));
    return { ...current, ...patch };
  }
  async function lookup(role, code) {
    const normalized = normalizeCode(code);
    if (!normalized) throw new Error('CODE_REQUIRED');
    const record = (await load()).find(u => u.role === role && u.code === normalized && u.active && u.location);
    if (!record) throw new Error('CODE_INVALID');
    return record;
  }
  async function watch(callback, onError) {
    const db = await timeout(connect());
    return query(db).onSnapshot(snapshot => {
      if (snapshot.metadata?.hasPendingWrites || snapshot.metadata?.fromCache) return;
      callback(decode(snapshot));
    }, onError);
  }
  function message(error) {
    const messages = {
      FIELDS_REQUIRED: 'Informe o nome e a localidade.', BUILDING_REQUIRED: 'Informe o nome do prédio.',
      CODE_REQUIRED: 'Informe seu código de acesso.', CODE_INVALID: 'Código inválido, inativo ou de outro tipo de acesso.',
      ACCESS_NOT_FOUND: 'Este cadastro não foi encontrado. Atualize a lista.',
      SEQUENCE_FULL: 'A sequência de três dígitos está completa. Não foi criado nenhum código.'
    };
    return messages[error?.message] || 'Não foi possível confirmar o cadastro na base online. Verifique a conexão e tente novamente.';
  }
  root.PINC_PORTAL_ACCESS = { load, create, update, lookup, watch, message, codeFor, buildingSlug, normalizeCode };
})(window);
