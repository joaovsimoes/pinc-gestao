(function () {
  'use strict';
  window.PINC_PORTAL_USER = { star: null, host: null };
  let role = null, busy = false;
  const api = window.PINC_PORTAL_ACCESS;
  const targetFor = value => value === 'host' ? 'facilitador' : 'stars';
  window.PINC_SHOW_PORTAL_LOGIN = function (value) {
    if (value === 'host') { window.PINC_DO_LAUNCH('facilitador'); return; }
    role = value === 'host' ? 'host' : 'star';
    const host = role === 'host', box = document.getElementById('portalCodeLogin');
    document.getElementById('portalCodeTitle').textContent = host ? 'Acesso Facilitador' : 'Acesso Star';
    document.getElementById('portalCodeMark').textContent = host ? '▶' : '✦';
    const input = document.getElementById('portalCodeInput'); input.value = ''; input.placeholder = host ? 'G&G.001.A' : 'STAR-NOME-DO-PREDIO-001';
    document.getElementById('portalCodeError').textContent = '';
    box.classList.add('show'); box.setAttribute('aria-hidden', 'false'); setTimeout(() => input.focus(), 100);
  };
  window.PINC_CLOSE_PORTAL_LOGIN = function () { role = null; const box = document.getElementById('portalCodeLogin'); box.classList.remove('show'); box.setAttribute('aria-hidden', 'true'); };
  window.PINC_LOGIN_PORTAL_CODE = async function () {
    if (busy) return;
    const requestedRole = role, code = document.getElementById('portalCodeInput').value, error = document.getElementById('portalCodeError'), button = document.getElementById('portalCodeSubmit');
    busy = true; button.disabled = true; error.textContent = 'Validando código online...';
    try {
      const record = await api.lookup(requestedRole, code);
      if (role !== requestedRole) return;
      window.PINC_PORTAL_USER[requestedRole] = record;
      window.PINC_CLOSE_PORTAL_LOGIN(); window.PINC_DO_LAUNCH(targetFor(requestedRole));
    } catch (failure) { error.textContent = api.message(failure); } finally { busy = false; button.disabled = false; }
  };
  window.PINC_VALIDATE_PORTAL = async function (value) {
    const session = window.PINC_PORTAL_USER[value];
    if (!session) throw new Error('CODE_INVALID');
    const current = await api.lookup(value, session.code);
    if (current.location !== session.location) throw new Error('CODE_INVALID');
    window.PINC_PORTAL_USER[value] = current;
    return current;
  };
  const direct = new URLSearchParams(window.location.search).get('portal');
  if (direct === 'host' || direct === 'star') window.PINC_SHOW_PORTAL_LOGIN(direct);
})();
