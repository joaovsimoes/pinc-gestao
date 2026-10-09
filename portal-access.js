/* Shared online registry. Sequence reservations stay immutable; facilitator suffix follows the registered area. */
(function (root) {
  'use strict';
  let database = null, connection = null;
  const normalizeCode = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  const profileForRole = role => role === 'host'
    ? { profile: 'guide', level: 2, profileName: 'Facilitador' }
    : { profile: 'welcome', level: 1, profileName: 'Star' };
  const buildingSlug = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
  function prefix(role, building) {
    if (role === 'host') return 'G&G.';
    if (role !== 'star' || !buildingSlug(building)) throw new Error('BUILDING_REQUIRED');
    return 'STAR-' + buildingSlug(building) + '-';
  }
  function hostArea(input) {
    const area = String(input.area || '').trim(), areaLetter = String(input.areaLetter || '').trim().toUpperCase();
    if (!area) throw new Error('AREA_REQUIRED');
    if (!/^[A-Z]$/.test(areaLetter)) throw new Error('AREA_LETTER_REQUIRED');
    return { area, areaLetter };
  }
  function codeFor(role, building, sequence, areaLetter) {
    const number = String(sequence).padStart(3, '0');
    if (role === 'host') {
      const letter = String(areaLetter || '').trim().toUpperCase();
      if (!/^[A-Z]$/.test(letter)) throw new Error('AREA_LETTER_REQUIRED');
      return 'G&G.' + number + '.' + letter;
    }
    return prefix(role, building) + number;
  }
  const isHostCode = code => /^(?:HOST\d{3}|G&G\.\d{3}\.[A-Z])$/.test(code);
  const isStarCode = code => /^STAR-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$/.test(code);
  function recordSequence(record) {
    const match = String(record.code || '').match(/^(?:HOST|G&G\.)(\d{3})/);
    return match ? Number(match[1]) : Number(record.sequence) || 0;
  }
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
          ((row.role === 'host' && isHostCode(row.code)) || (row.role === 'star' && isStarCode(row.code))) &&
          typeof row.location === 'string' && row.location) {
        const host = row.role === 'host';
        records.set(row.code, {
          id: row.code, code: row.code, role: row.role, name: row.name, building: row.building || '',
          area: host ? String(row.area || '') : '',
          areaLetter: host ? String(row.areaLetter || (row.code.match(/\.([A-Z])$/)?.[1] || '')) : '',
          legacyCode: host && row.code.startsWith('HOST') ? row.code : '',
          location: row.location, prefix: row.prefix,
          sequence: host ? recordSequence(row) : row.sequence, active: row.active !== false,
          ...profileForRole(row.role)
        });
      } else if (row.type === 'portalAccessEvent' && records.has(row.targetId)) {
        const record = records.get(row.targetId), patch = row.patch || {};
        const next = { ...record,
          name: typeof patch.name === 'string' ? patch.name : record.name,
          active: typeof patch.active === 'boolean' ? patch.active : record.active };
        if (record.role === 'host' && typeof patch.area === 'string' && patch.area.trim() && /^[A-Z]$/.test(patch.areaLetter)) {
          next.area = patch.area.trim(); next.areaLetter = patch.areaLetter;
          next.code = codeFor('host', '', record.sequence, next.areaLetter);
        }
        // Identity, locality and sequence remain attached to the original reservation.
        records.set(row.targetId, next);
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
    const areaFields = input.role === 'host' ? hostArea(input) : {};
    const p = prefix(input.role, building), db = await timeout(connect());
    const records = await load();
    let next = records.filter(u => input.role === 'host' ? u.role === 'host' : u.prefix === p).reduce((max, u) => Math.max(max, Number(u.sequence) || 0), 0) + 1;
    // A transaction claims the actual code document: two computers cannot create the same code.
    while (next <= 999) {
      const sequence = next++, code = codeFor(input.role, building, sequence, areaFields.areaLetter);
      // Reuse the HOST sequence document to avoid duplicate numbers even with older clients.
      const reservation = input.role === 'host' ? 'HOST' + String(sequence).padStart(3, '0') : code;
      const ref = db.collection('pincLocks').doc('portalAccess_' + reservation);
      try {
        await timeout(db.runTransaction(async transaction => {
          const existing = await transaction.get(ref);
          if (existing.exists) throw new Error('CODE_COLLISION');
          transaction.set(ref, {
            type: 'portalAccess', ownerUid: root.firebase.auth().currentUser.uid,
            code, role: input.role, name, building, ...areaFields, location, prefix: p, sequence, active: true,
            ...profileForRole(input.role),
            updatedAt: root.firebase.firestore.FieldValue.serverTimestamp(), updatedAtMillis: Date.now()
          });
        }));
        const saved = await timeout(ref.get({ source: 'server' }));
        if (!saved.exists) throw new Error('PORTAL_OFFLINE');
        return { id: code, code, role: input.role, name, building, ...areaFields, location, prefix: p, sequence, active: true, ...profileForRole(input.role) };
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
    if (current.role === 'host' && ('area' in changes || 'areaLetter' in changes)) {
      Object.assign(patch, hostArea({ area: changes.area ?? current.area, areaLetter: changes.areaLetter ?? current.areaLetter }));
    }
    const ref = await timeout(db.collection('pincLocks').add({ type: 'portalAccessEvent',
      ownerUid: root.firebase.auth().currentUser.uid, targetId: id, location: current.location, patch,
      updatedAt: root.firebase.firestore.FieldValue.serverTimestamp(), updatedAtMillis: Date.now() }));
    await timeout(ref.get({ source: 'server' }));
    const updated = { ...current, ...patch };
    if (current.role === 'host' && patch.areaLetter) updated.code = codeFor('host', '', current.sequence, patch.areaLetter);
    return updated;
  }
  async function lookup(role, code) {
    const normalized = normalizeCode(code);
    if (!normalized) throw new Error('CODE_REQUIRED');
    const record = (await load()).find(u => u.role === role && (u.code === normalized || u.legacyCode === normalized) && u.active && u.location);
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
      AREA_REQUIRED: 'Informe a área do Facilitador.', AREA_LETTER_REQUIRED: 'Informe uma única letra de A a Z para identificar a área.',
      CODE_REQUIRED: 'Informe seu código de acesso.', CODE_INVALID: 'Código inválido, inativo ou de outro tipo de acesso.',
      ACCESS_NOT_FOUND: 'Este cadastro não foi encontrado. Atualize a lista.',
      SEQUENCE_FULL: 'A sequência de três dígitos está completa. Não foi criado nenhum código.'
    };
    return messages[error?.message] || 'Não foi possível confirmar o cadastro na base online. Verifique a conexão e tente novamente.';
  }
  root.PINC_PORTAL_ACCESS = { load, create, update, lookup, watch, message, codeFor, buildingSlug, normalizeCode, profileForRole };
})(window);
