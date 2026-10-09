(function () {
  'use strict';
  let entries = [], selectedRole = 'star', busy = false, stopWatching = null;
  const api = window.PINC_PORTAL_ACCESS;
  const location = () => Number(window.parent.PINC_AUTH_USER?.level||4) >= 5 ? S.currentLocation : (window.parent.PINC_AUTH_USER?.location || S.currentLocation);
  const here = () => entries.filter(u => u.location === location());
  window.renderPortalRegistrations = function () {
    const search = normalizeHeaderText(g('portalRegistrationSearch')?.value || '');
    const rows = here().filter(u => u.role === selectedRole && normalizeHeaderText([u.name, u.building, u.area, u.code, u.legacyCode].join(' ')).includes(search));
    g('portalRegisterButton').textContent = selectedRole === 'star' ? '+ Cadastrar Star' : '+ Cadastrar Facilitador';
    g('portalBuildingHeader').style.display = '';
    g('portalBuildingHeader').textContent = selectedRole === 'star' ? 'Prédio' : 'Área';
    g('portalRegistrationLocation').textContent = location();
    g('portalRegistrationCount').textContent = rows.length + ' cadastro(s)';
    document.querySelectorAll('#portalRoleSegment button').forEach(button => {
      button.classList.toggle('active', button.dataset.role === selectedRole);
      button.setAttribute('aria-pressed', String(button.dataset.role === selectedRole));
    });
    g('portalRegistrationTable').innerHTML = rows.length ? rows.sort((a, b) => a.code.localeCompare(b.code)).map(u => `<tr>
      <td><strong>${esc(u.name)}</strong></td><td>${esc(selectedRole === 'star' ? u.building : (u.area || 'Informar área'))}</td>
      <td>${esc(u.location)}</td><td><code>${esc(u.code)}</code>${u.role === 'host' && !u.area ? '<div style="font-size:9px;color:var(--muted);margin-top:5px">Edite para definir a área e atualizar o código.</div>' : ''}</td>
      <td><span class="status ${u.active ? 'green' : 'red'}">${u.active ? 'Ativo' : 'Inativo'}</span></td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn secondary" onclick="copyPortalCode('${u.id}')">Copiar</button>
      <button class="btn secondary" onclick="openPortalRegistration('${u.id}')">Editar</button>
      <button class="btn secondary" onclick="togglePortalRegistration('${u.id}')">${u.active ? 'Desativar' : 'Ativar'}</button></div></td></tr>`).join('') :
      `<tr><td colspan="6" style="text-align:center;padding:28px">Nenhum ${selectedRole === 'star' ? 'Star' : 'Facilitador'} cadastrado nesta localidade.</td></tr>`;
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
    window.__portalRegistrationDraft = { id: current?.id, role, location: location(), sequence: current?.sequence, code: current?.code };
    openDialog(current ? 'Editar cadastro' : role === 'star' ? 'Cadastrar Star' : 'Cadastrar Facilitador', `<div class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="field full"><label for="portalPersonName">Nome da pessoa</label><input id="portalPersonName" maxlength="120" value="${esc(current?.name || '')}" autocomplete="off"></div>
      ${role === 'star' ? `<div class="field full"><label for="portalPersonBuilding">Prédio</label><input id="portalPersonBuilding" maxlength="80" value="${esc(current?.building || '')}" ${current ? 'readonly' : ''} placeholder="Ex.: Goiás" autocomplete="off"></div>` : `<div class="field"><label for="portalPersonArea">Área do Facilitador</label><input id="portalPersonArea" maxlength="80" list="portalAreaOptions" value="${esc(current?.area || '')}" placeholder="Informe a área" autocomplete="off" oninput="updatePortalHostCodePreview(true)"><datalist id="portalAreaOptions">${[...new Set(entries.filter(u => u.role === 'host' && u.area).map(u => u.area))].map(area => `<option value="${esc(area)}"></option>`).join('')}</datalist></div><div class="field"><label for="portalPersonAreaLetter">Letra da área</label><input id="portalPersonAreaLetter" maxlength="1" pattern="[A-Za-z]" value="${esc(current?.areaLetter || '')}" placeholder="Ex.: A" autocomplete="off" oninput="this.value=this.value.toUpperCase();updatePortalHostCodePreview()"></div>`}
      <div class="field full"><label>Localidade vinculada</label><input readonly value="${esc(location())}"></div>
      <div class="field full"><label>Código de acesso</label><input id="portalPersonCode" readonly value="${esc(current?.code || (role === 'host' ? 'G&G.000.A • sequência + letra da área' : 'STAR-NOME-DO-PREDIO + número sequencial (001, 002...)'))}"></div>
      <div class="hint full">${role === 'host' ? 'G&G. + número sequencial + letra da área. A sequência e a localidade são preservadas; ao informar ou mudar a letra, o código é atualizado.' : current ? 'O código e a localidade permanecem vinculados a este cadastro.' : 'O código será gerado automaticamente e confirmado online ao salvar.'}</div>
      </div>`, `<button class="btn secondary" onclick="closeModal()">Cancelar</button><button id="portalRegistrationSave" class="btn primary" onclick="savePortalRegistration()">Salvar cadastro</button>`);
  };
  window.updatePortalHostCodePreview = function (areaChanged) {
    const draft = window.__portalRegistrationDraft;
    if (draft?.role !== 'host') return;
    const areaInput = g('portalPersonArea'), letterInput = g('portalPersonAreaLetter'), codeInput = g('portalPersonCode');
    const area = normalizeHeaderText(areaInput?.value || '');
    const known = area ? entries.find(u => u.role === 'host' && u.areaLetter && normalizeHeaderText(u.area || '') === area) : null;
    if (areaChanged && letterInput) letterInput.value = known?.areaLetter || '';
    const letter = String(letterInput?.value || '').trim().toUpperCase();
    if (codeInput) codeInput.value = /^[A-Z]$/.test(letter)
      ? api.codeFor('host', '', draft.sequence ?? 0, letter)
      : 'G&G.000. + letra da área';
  };
  window.savePortalRegistration = async function () {
    if (busy) return;
    const draft = window.__portalRegistrationDraft, name = g('portalPersonName')?.value.trim(), building = g('portalPersonBuilding')?.value.trim() || '';
    if (!draft || draft.location !== location()) return toast('Atualize a localidade antes de cadastrar.');
    if (!name) return toast('Informe o nome da pessoa.');
    if (draft.role === 'star' && !building) return toast('Informe o prédio.');
    const area = g('portalPersonArea')?.value.trim() || '', areaLetter = (g('portalPersonAreaLetter')?.value || '').trim().toUpperCase();
    if (draft.role === 'host' && !area) return toast('Informe a área do Facilitador.');
    if (draft.role === 'host' && !/^[A-Z]$/.test(areaLetter)) return toast('Informe uma única letra de A a Z para identificar a área.');
    const changes = draft.role === 'host' ? { name, area, areaLetter } : { name };
    busy = true; const button = g('portalRegistrationSave'); if (button) { button.disabled = true; button.textContent = 'Salvando online...'; }
    try {
      const saved = draft.id ? await api.update(draft.id, changes) : await api.create({ role: draft.role, name, building, area, areaLetter, location: draft.location });
      entries = entries.filter(record => record.id !== saved.id).concat(saved); renderPortalRegistrations(); closeModal();
      openDialog(draft.id ? 'Cadastro atualizado' : 'Cadastro criado', `<div class="hint">${esc(saved.name)}<br>Localidade: <strong>${esc(saved.location)}</strong>${saved.building ? `<br>Prédio: <strong>${esc(saved.building)}</strong>` : ''}${saved.area ? `<br>Área: <strong>${esc(saved.area)}</strong> • ${esc(saved.areaLetter)}` : ''}</div>
        <p style="margin-top:16px">Código confirmado online:</p><div style="padding:16px;background:var(--purpleSoft);border-radius:12px;font-size:20px;font-weight:850;overflow-wrap:anywhere">${esc(saved.code)}</div>
        <p>Use este código ao acessar ${saved.role === 'host' ? 'Facilitador' : 'Star'} na página inicial.</p>`, `<button class="btn secondary" onclick="copyPortalCode('${saved.id}')">Copiar código</button><button class="btn primary" onclick="closeModal()">Concluir</button>`);
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
