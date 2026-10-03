(function () {
  'use strict';
  let entries = [], selectedRole = 'star', busy = false, stopWatching = null;
  const api = window.PINC_PORTAL_ACCESS;
  const location = () => window.parent.PINC_AUTH_USER?.location || S.currentLocation;
  const here = () => entries.filter(u => u.location === location());
  window.renderPortalRegistrations = function () {
    const search = normalizeHeaderText(g('portalRegistrationSearch')?.value || '');
    const rows = here().filter(u => u.role === selectedRole && normalizeHeaderText([u.name, u.building, u.code].join(' ')).includes(search));
    g('portalRegisterButton').textContent = selectedRole === 'star' ? '+ Cadastrar Star' : '+ Cadastrar Facilitador';
    g('portalBuildingHeader').style.display = selectedRole === 'star' ? '' : 'none';
    g('portalRegistrationLocation').textContent = location();
    g('portalRegistrationCount').textContent = rows.length + ' cadastro(s)';
    document.querySelectorAll('#portalRoleSegment button').forEach(button => {
      button.classList.toggle('active', button.dataset.role === selectedRole);
      button.setAttribute('aria-pressed', String(button.dataset.role === selectedRole));
    });
    g('portalRegistrationTable').innerHTML = rows.length ? rows.sort((a, b) => a.code.localeCompare(b.code)).map(u => `<tr>
      <td><strong>${esc(u.name)}</strong></td>${selectedRole === 'star' ? `<td>${esc(u.building)}</td>` : ''}
      <td>${esc(u.location)}</td><td><code>${esc(u.code)}</code></td>
      <td><span class="status ${u.active ? 'green' : 'red'}">${u.active ? 'Ativo' : 'Inativo'}</span></td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn secondary" onclick="copyPortalCode('${u.id}')">Copiar</button>
      <button class="btn secondary" onclick="openPortalRegistration('${u.id}')">Editar</button>
      <button class="btn secondary" onclick="togglePortalRegistration('${u.id}')">${u.active ? 'Desativar' : 'Ativar'}</button></div></td></tr>`).join('') :
      `<tr><td colspan="${selectedRole === 'star' ? 6 : 5}" style="text-align:center;padding:28px">Nenhum ${selectedRole === 'star' ? 'Star' : 'Facilitador'} cadastrado nesta localidade.</td></tr>`;
  };
  window.selectPortalRegistrationRole = function (role) { selectedRole = role === 'host' ? 'host' : 'star'; renderPortalRegistrations(); };
  window.initPortalRegistration = async function () {
    if (stopWatching) { renderPortalRegistrations(); return; }
    g('portalRegistryStatus').textContent = 'Carregando cadastros online...';
    try {
      entries = await api.load(); renderPortalRegistrations();
      stopWatching = await api.watch(records => {
        entries = records; renderPortalRegistrations(); g('portalRegistryStatus').textContent = 'Cadastros atualizados online';
      }, error => { g('portalRegistryStatus').textContent = api.message(error); });
    } catch (error) { g('portalRegistryStatus').textContent = api.message(error); }
  };
  window.openPortalRegistration = function (id) {
    const current = id ? here().find(u => u.id === id) : null;
    if (id && !current) return toast('Cadastro não encontrado nesta localidade.');
    const role = current?.role || selectedRole;
    window.__portalRegistrationDraft = { id: current?.id, role, location: location() };
    openDialog(current ? 'Editar cadastro' : role === 'star' ? 'Cadastrar Star' : 'Cadastrar Facilitador', `<div class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="field full"><label for="portalPersonName">Nome da pessoa</label><input id="portalPersonName" maxlength="120" value="${esc(current?.name || '')}" autocomplete="off"></div>
      ${role === 'star' ? `<div class="field full"><label for="portalPersonBuilding">Prédio</label><input id="portalPersonBuilding" maxlength="80" value="${esc(current?.building || '')}" ${current ? 'readonly' : ''} placeholder="Ex.: Goiás" autocomplete="off"></div>` : ''}
      <div class="field full"><label>Localidade vinculada</label><input readonly value="${esc(location())}"></div>
      <div class="field full"><label>Código de acesso</label><input readonly value="${esc(current?.code || (role === 'host' ? 'HOST + número sequencial (001, 002...)' : 'STAR-NOME-DO-PREDIO + número sequencial (001, 002...)'))}"></div>
      <div class="hint full">${current ? 'O código e a localidade permanecem vinculados a este cadastro.' : 'O código será gerado automaticamente e confirmado online ao salvar.'}</div>
      </div>`, `<button class="btn secondary" onclick="closeModal()">Cancelar</button><button id="portalRegistrationSave" class="btn primary" onclick="savePortalRegistration()">Salvar cadastro</button>`);
  };
  window.savePortalRegistration = async function () {
    if (busy) return;
    const draft = window.__portalRegistrationDraft, name = g('portalPersonName')?.value.trim(), building = g('portalPersonBuilding')?.value.trim() || '';
    if (!draft || draft.location !== location()) return toast('Atualize a localidade antes de cadastrar.');
    if (!name) return toast('Informe o nome da pessoa.');
    if (draft.role === 'star' && !building) return toast('Informe o prédio.');
    busy = true; const button = g('portalRegistrationSave'); if (button) { button.disabled = true; button.textContent = 'Salvando online...'; }
    try {
      const saved = draft.id ? await api.update(draft.id, { name }) : await api.create({ role: draft.role, name, building, location: draft.location });
      entries = entries.filter(record => record.id !== saved.id).concat(saved); renderPortalRegistrations(); closeModal();
      openDialog(draft.id ? 'Cadastro atualizado' : 'Cadastro criado', `<div class="hint">${esc(saved.name)}<br>Localidade: <strong>${esc(saved.location)}</strong>${saved.building ? `<br>Prédio: <strong>${esc(saved.building)}</strong>` : ''}</div>
        <p style="margin-top:16px">Código confirmado online:</p><div style="padding:16px;background:var(--purpleSoft);border-radius:12px;font-size:20px;font-weight:850;overflow-wrap:anywhere">${esc(saved.code)}</div>
        <p>Use este código ao acessar ${saved.role === 'host' ? 'Facilitador' : 'Stars'} na página inicial.</p>`, `<button class="btn secondary" onclick="copyPortalCode('${saved.id}')">Copiar código</button><button class="btn primary" onclick="closeModal()">Concluir</button>`);
    } catch (error) { toast(api.message(error)); } finally { busy = false; if (button) { button.disabled = false; button.textContent = 'Salvar cadastro'; } }
  };
  window.copyPortalCode = async function (id) {
    const record = here().find(u => u.id === id);
    if (!record) return;
    try { await navigator.clipboard.writeText(record.code); toast('Código copiado.'); } catch (_) { toast('Código: ' + record.code); }
  };
  window.togglePortalRegistration = function (id) {
    const record = here().find(u => u.id === id); if (!record) return;
    window.__portalStatusChange = { id, active: !record.active };
    confirmDialog(record.active ? 'Desativar acesso' : 'Ativar acesso', `${record.active ? 'Desativar' : 'Ativar'} o código ${record.code} de ${record.name}?`, 'Confirmar', 'confirmPortalStatus()', false);
  };
  window.confirmPortalStatus = async function () {
    if (busy) return;
    const change = window.__portalStatusChange; if (!change || !here().some(u => u.id === change.id)) return;
    busy = true;
    try { const saved = await api.update(change.id, { active: change.active }); entries = entries.map(record => record.id === saved.id ? saved : record); renderPortalRegistrations(); closeModal(); successDialog('Acesso atualizado', 'A situação do código foi confirmada online.'); }
    catch (error) { toast(api.message(error)); } finally { busy = false; }
  };
})();
