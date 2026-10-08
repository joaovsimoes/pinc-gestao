/* Shared management registry. Local storage is a migration source/cache only. */
(function (root) {
  'use strict';
  const AUTH_KEY = 'pinc-gestao-auth-v1';
  const STATE_KEYS = ['pinc-gestao-v6', 'pinc-gestao-backup-v1', 'pinc-gestao-v5', 'pinc-gestao-v4'];
  let connecting = null;
  let seeding = null;
  let db = null;
  let unsubscribe = null;
  let mutationQueue = Promise.resolve();
  const normalize = value => String(value || '').trim().toLowerCase();
  const PROFILES = Object.freeze({
    master: { level: 5, name: 'Master' },
    hub: { level: 4, name: 'Hub' },
    flow: { level: 3, name: 'Flow' }
  });
  function normalizeProfile(u) {
    const raw = String(u?.profile || '').trim().toLowerCase();
    if (PROFILES[raw]) return raw;
    const level = Number(u?.level || 0);
    if (level >= 5) return 'master';
    if (level === 3) return 'flow';
    return 'hub';
  }
  function enrich(u) {
    if (!u || typeof u !== 'object') return u;
    const profile = normalizeProfile(u), meta = PROFILES[profile];
    return { ...u, profile, level: meta.level, profileName: meta.name };
  }
  const legacy = u => u && u.username === 'joao.vitor' && u.password === '123456' && u.email === 'joao.vitor@empresa.com';
  const keyOf = u => String(u.id || normalize(u.username || u.email));
  function localRecords() {
    const candidates = [];
    for (const key of [AUTH_KEY, ...STATE_KEYS]) {
      try {
        const value = JSON.parse(root.localStorage.getItem(key) || 'null');
        const records = key === AUTH_KEY ? value : value?.accesses;
        if (Array.isArray(records)) candidates.push(...records);
      } catch (_) {}
    }
    const unique = new Map();
    for (const u of candidates) {
      if (!u || legacy(u) || !normalize(u.username || u.email) || !u.location || !(u.password || u.passwordHash)) continue;
      const key = normalize(u.username || u.email);
      if (!unique.has(key)) unique.set(key, enrich({ ...u, username: u.username || String(u.email).split('@')[0] }));
    }
    return [...unique.values()];
  }
  function cache(records) {
    records = (records || []).map(enrich);
    try {
      root.localStorage.setItem(AUTH_KEY, JSON.stringify(records));
      // Keep the original browser's registry cache in step with the server.
      for (const key of STATE_KEYS) {
        const state = JSON.parse(root.localStorage.getItem(key) || 'null');
        if (!state || typeof state !== 'object') continue;
        state.accesses = records;
        root.localStorage.setItem(key, JSON.stringify(state));
      }
    } catch (_) {}
    return records;
  }
  async function hash(password, salt) {
    const digest = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(salt || 'pinc') + '|' + String(password || '')));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }
  async function cloudRecord(u) {
    const username = String(u.username || String(u.email || '').split('@')[0]).trim();
    const id = String(u.id || 'u_' + root.crypto.randomUUID());
    const salt = String(u.salt || id);
    const passwordHash = u.password ? await hash(u.password, salt) : String(u.passwordHash || '');
    if (!username || !u.location || !passwordHash) throw new Error('ACCESS_INCOMPLETE');
    const profile = normalizeProfile(u), meta = PROFILES[profile];
    return { id, name: String(u.name || ''), email: String(u.email || '').trim(), username,
      location: String(u.location), profile, level: meta.level, profileName: meta.name,
      active: u.active !== false, salt, passwordHash };
  }
  async function connect() {
    if (db && root.firebase.auth().currentUser) return db;
    if (!connecting) connecting = (async () => {
      const firebase = root.firebase;
      if (!firebase) throw new Error('ACCESS_OFFLINE');
      if (!firebase.apps.length) firebase.initializeApp(root.PINC_FIREBASE_CONFIG || root.PINC_MANAGEMENT_CONFIG);
      const auth = firebase.auth();
      if (!auth.currentUser) await auth.signInAnonymously();
      db = firebase.firestore();
      return db;
    })().finally(() => { connecting = null; });
    return connecting;
  }
  function timeout(promise) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('ACCESS_OFFLINE')), 15000); })])
      .finally(() => clearTimeout(timer));
  }
  function query(database) { return database.collection('pincLocks').where('type', '==', 'managementAccessSnapshot'); }
  function decode(snapshot) {
    const rows = snapshot.docs.map(doc => ({ ...doc.data(), _documentId: doc.id }));
    const millis = row => row.updatedAt?.toMillis?.() || Number(row.updatedAtMillis || 0);
    rows.sort((a, b) => millis(a) - millis(b) || String(a._documentId).localeCompare(String(b._documentId)));
    let records = new Map();
    let migrated = false;
    for (const row of rows) {
      if (!Array.isArray(row.accesses)) continue;
      if (!row.operation && !migrated) {
        // Compatibility with the previous full-registry snapshots.
        records = new Map(row.accesses.filter(u => u && !legacy(u)).map(u => [keyOf(u), u]));
      } else if (row.operation?.kind === 'seed') {
        if (!records.size && rows.indexOf(row) === 0) {
          for (const u of row.accesses) if (u && !legacy(u)) records.set(keyOf(u), u);
        }
      } else if (row.operation?.kind === 'upsert') {
        for (const u of row.accesses) if (u && !legacy(u)) records.set(keyOf(u), u);
      } else if (row.operation?.kind === 'delete') records.delete(String(row.operation.id));
      if (row.schemaVersion === 2) migrated = true;
    }
    return { exists: rows.length > 0, records: [...records.values()].map(enrich) };
  }
  async function read(database) {
    // A cached/failed request must never be reported as an invalid password.
    return decode(await timeout(query(database).get({ source: 'server' })));
  }
  async function append(database, operation, accesses) {
    const ref = await timeout(database.collection('pincLocks').add({
      type: 'managementAccessSnapshot', schemaVersion: 2,
      ownerUid: root.firebase.auth().currentUser.uid,
      operation, accesses, updatedAt: root.firebase.firestore.FieldValue.serverTimestamp(),
      updatedAtMillis: Date.now()
    }));
    await timeout(ref.get({ source: 'server' }));
  }
  async function load(options = {}) {
    const database = await timeout(connect());
    let current = await read(database);
    if (!current.exists && options.migrate !== false) {
      const local = localRecords();
      if (local.length) {
        if (!seeding) seeding = (async () => {
          const check = await read(database);
          if (!check.exists) await append(database, { kind: 'seed' }, await Promise.all(local.map(cloudRecord)));
        })().finally(() => { seeding = null; });
        await seeding;
        current = await read(database);
      }
    }
    return cache(current.records);
  }
  function mutate(kind, account) {
    const work = mutationQueue.then(async () => {
      const database = await timeout(connect());
      const records = await load();
      if (kind === 'delete') {
        if (!records.some(u => keyOf(u) === keyOf(account))) throw new Error('ACCESS_NOT_FOUND');
        await append(database, { kind: 'delete', id: keyOf(account) }, []);
      } else {
        const record = await cloudRecord(account);
        const duplicate = records.find(u => keyOf(u) !== keyOf(record) &&
          (normalize(u.username) === normalize(record.username) || (record.email && normalize(u.email) === normalize(record.email))));
        if (duplicate) throw new Error('ACCESS_DUPLICATE');
        await append(database, { kind: 'upsert', id: record.id }, [record]);
      }
      return load({ migrate: false });
    });
    mutationQueue = work.catch(() => {});
    return work;
  }
  function watch(onChange, onError) {
    if (unsubscribe) unsubscribe();
    return connect().then(database => {
      unsubscribe = query(database).onSnapshot(snapshot => {
        if (snapshot.metadata?.hasPendingWrites || snapshot.metadata?.fromCache) return;
        onChange(cache(decode(snapshot).records));
      }, onError);
      return unsubscribe;
    });
  }
  async function matches(access, password) {
    if (!access?.passwordHash) return false;
    return await hash(password, access.salt || access.id || access.username || 'pinc') === access.passwordHash;
  }
  function message(error) {
    if (error?.message === 'ACCESS_DUPLICATE') return 'Este usuário ou e-mail já está cadastrado.';
    if (error?.message === 'ACCESS_NOT_FOUND') return 'O acesso foi alterado em outro computador. Atualize a lista e tente novamente.';
    return 'Não foi possível confirmar o acesso na base online. Verifique a conexão e tente novamente.';
  }
  root.PINC_ACCESS = { load, upsert: account => mutate('upsert', account), remove: account => mutate('delete', account), watch, matches, message, normalize, profiles: PROFILES, normalizeProfile, enrich };
})(window);
