/* Edição de acessos da Gestão PINC: campos, foto e validações antes de atualizar a mesma conta. */
(function(){
  'use strict';
  let selectedId=null;
  let draftPhoto='',uploadBusy=false,saveBusy=false;
  const byId=id=>document.getElementById(id);
  const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[char]));
  const photoOk=value=>typeof value==='string'&&value.length<60000&&/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value);
  const records=()=>Array.isArray(S.accesses)?S.accesses:[];
  const selected=()=>records().find(x=>String(x.id)===String(selectedId));
  const initials=name=>{
    const parts=String(name||'Usuário').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0]||'U')+(parts.length>1?parts[parts.length-1][0]:'' )).toUpperCase();
  };
  function photoMarkup(user){
    const photo=photoOk(user?.photo)?user.photo:'';
    return photo?'<img class="access-photo" src="'+photo+'" alt="">':escapeHTML(initials(user?.name||user?.username));
  }
  function previewPhoto(){
    const holder=byId('pincAccessEditAvatar');
    if(!holder)return;
    holder.innerHTML=draftPhoto&&photoOk(draftPhoto)?
      '<img class="access-photo" src="'+draftPhoto+'" alt="Prévia da foto">':
      escapeHTML(initials(byId('editAccessName')?.value||selected()?.name));
    const remove=byId('pincAccessRemovePhoto');
    if(remove)remove.disabled=!draftPhoto;
  }
  function choices(current){
    const level=managementLevel();
    const profiles=Object.entries(MANAGEMENT_PROFILES)
      .filter(([key,info])=>level>=5||info.level<=level)
      .map(([key,info])=>'<option value="'+escapeHTML(key)+'"'+(current===key?' selected':'')+'>'+escapeHTML('Nível '+info.level+' • '+info.name)+'</option>');
    return profiles.join('');
  }
  function locations(current){
    const local=isMaster()?S.locations:S.locations.filter(item=>item.name===managementAuth()?.location);
    return local.map(item=>'<option value="'+escapeHTML(item.name)+'"'+(item.name===current?' selected':'')+'>'+escapeHTML(item.name)+'</option>').join('');
  }
  function open(index){
    const user=records()[index];
    if(!user||!canManageAccessRecord(user)){
      toast('Você não tem permissão para editar este acesso.');return;
    }
    selectedId=String(user.id);
    draftPhoto=photoOk(user.photo)?user.photo:'';
    uploadBusy=false;saveBusy=false;
    const name=String(user.name||user.username||'Usuário').trim();
    const inputHTML='<div class="pinc-access-editor">'+
      '<div class="pinc-access-photo-row"><div id="pincAccessEditAvatar" class="pinc-access-photo-preview">'+photoMarkup(user)+'</div>'+
        '<div class="pinc-access-photo-info"><strong>Foto de perfil</strong><p>Aparece no menu, nas notificações e na lista de usuários. Arquivos JPG, PNG ou WebP de até 5 MB.</p>'+
        '<div class="pinc-access-photo-buttons"><label class="btn secondary" for="pincAccessEditFile">Escolher foto</label>'+
        '<input type="file" id="pincAccessEditFile" accept="image/jpeg,image/png,image/webp" onchange="PINC_ACCESS_EDITOR.upload(this)">'+
        '<button type="button" class="btn secondary" id="pincAccessRemovePhoto" onclick="PINC_ACCESS_EDITOR.removePhoto()" '+(draftPhoto?'':'disabled')+'>Remover foto</button></div></div></div>'+
      '<div class="pinc-access-form-grid">'+
        '<label class="field full">Nome completo *<input id="editAccessName" maxlength="120" autocomplete="off" value="'+escapeHTML(user.name||'')+'" oninput="PINC_ACCESS_EDITOR.refreshPhoto()"></label>'+
        '<label class="field full">E-mail corporativo *<input id="editAccessEmail" type="email" maxlength="180" autocomplete="off" value="'+escapeHTML(user.email||'')+'"></label>'+
        '<label class="field">Usuário de acesso *<input id="editAccessUsername" maxlength="100" autocomplete="off" value="'+escapeHTML(user.username||'')+'"></label>'+
        '<label class="field">Nível de acesso *<select id="editAccessProfile">'+choices(accessProfile(user))+'</select></label>'+
        '<label class="field full">Localidade vinculada *<select id="editAccessLocation" '+(isMaster()?'':'disabled')+'>'+locations(user.location)+'</select></label>'+
      '</div>'+
      '<p class="pinc-access-editor-note">A senha não será alterada. Para redefini-la, utilize o botão <b>Senha</b> na lista de usuários.</p>'+
      '<p class="pinc-access-editor-error" id="pincAccessEditError" role="alert" hidden></p>'+
    '</div>';
    openDialog('Editar usuário • '+name,inputHTML,
      '<button type="button" class="btn secondary" onclick="closeModal()">Cancelar</button>'+
      '<button type="button" class="btn primary" id="pincAccessEditSave" onclick="PINC_ACCESS_EDITOR.save()">Salvar alterações</button>');
  }
  function displayError(message){
    const p=byId('pincAccessEditError');
    if(p){p.hidden=false;p.textContent=message;}
  }
  function upload(input){
    const file=input?.files?.[0];
    if(input)input.value='';
    if(!file||uploadBusy)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))
      return displayError('Escolha uma imagem JPG, PNG ou WebP.');
    if(file.size>5*1024*1024)return displayError('A foto deve ter até 5 MB.');
    if(!window.PINC_PROFILE?.preparePhoto)return displayError('O editor de imagens não está disponível. Atualize a página.');
    uploadBusy=true;
    const save=byId('pincAccessEditSave');
    if(save){save.disabled=true;save.textContent='Preparando foto...';}
    Promise.resolve(window.PINC_PROFILE.preparePhoto(file))
      .then(photo=>{
        if(!selectedId||!byId('pincAccessEditAvatar'))return;
        if(!photoOk(photo))throw new Error('A foto não pôde ser processada.');
        draftPhoto=photo;previewPhoto();
        const p=byId('pincAccessEditError');
        if(p)p.hidden=true;
      })
      .catch(error=>displayError(error?.message||'Não foi possível ler a foto.'))
      .finally(()=>{
        uploadBusy=false;
        const button=byId('pincAccessEditSave');
        if(button){button.disabled=false;button.textContent='Salvar alterações';}
      });
  }
  function removePhoto(){
    if(saveBusy||uploadBusy)return;
    draftPhoto='';
    previewPhoto();
  }
  async function save(){
    if(uploadBusy||saveBusy||!selectedId)return;
    const user=selected();
    if(!user||!canManageAccessRecord(user))return displayError('Este acesso não está disponível para edição.');
    const name=byId('editAccessName')?.value.trim()||'',
      email=byId('editAccessEmail')?.value.trim()||'',
      username=byId('editAccessUsername')?.value.trim()||'',
      profile=byId('editAccessProfile')?.value||'',
      location=isMaster()?(byId('editAccessLocation')?.value||''):managementAuth()?.location||'';
    const meta=MANAGEMENT_PROFILES[profile];
    if(!name||!email||!username||!location)return displayError('Preencha nome, e-mail, usuário e localidade.');
    if(name.length>120||username.length>100||email.length>180)return displayError('Algum campo ultrapassou o limite de caracteres.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return displayError('Informe um e-mail válido.');
    if(!meta||(!isMaster()&&meta.level>managementLevel()))return displayError('Seu perfil não permite atribuir esse nível de acesso.');
    if(!S.locations.some(x=>x.name===location))return displayError('Selecione uma localidade cadastrada.');
    if(!isMaster()&&location!==managementAuth()?.location)return displayError('Você não pode transferir usuários para outra localidade.');
    if(!photoOk(draftPhoto)&&draftPhoto)return displayError('A foto selecionada não é válida.');
    if(accessLevel(user)>=5&&meta.level<5&&records().filter(x=>accessLevel(x)>=5&&x.active!==false).length<=1)
      return displayError('Não é possível rebaixar o último usuário Master ativo.');
    const button=byId('pincAccessEditSave');
    saveBusy=true;
    if(button){button.disabled=true;button.textContent='Salvando...';}
    try{
      const previous=selected();
      // Relê o registro antes de salvar para preservar hash de senha, estado ativo e alterações simultâneas.
      const latest=await window.PINC_ACCESS.load({migrate:false});
      const original=latest.find(x=>String(x.id)===String(selectedId));
      if(!original||!canManageAccessRecord(original))throw new Error('O usuário foi alterado ou removido. Atualize a lista.');
      if(!isMaster()&&(meta.level>managementLevel()||location!==managementAuth()?.location))
        throw new Error('Seu perfil não pode executar esta alteração.');
      if(accessLevel(original)>=5&&meta.level<5&&latest.filter(x=>accessLevel(x)>=5&&x.active!==false).length<=1)
        throw new Error('Não é possível rebaixar o último usuário Master ativo.');
      const updated={...original,name,email,username,profile,level:meta.level,profileName:meta.name,location,photo:draftPhoto};
      const results=await window.PINC_ACCESS.upsert(updated);
      S.accesses=results;
      window.PINC_PROFILE?.sync(results);
      const logged=managementAuth();
      const own=String(original.id)===String(logged?.id);
      const identityChanged=own&&(original.profile!==profile||original.location!==location||original.username!==username);
      closeModal();
      renderSettingsLists();
      if(own)renderLocationSelect();
      successDialog('Usuário atualizado',identityChanged?
        'As alterações foram salvas. Para aplicar o novo perfil, usuário ou localidade ao acesso atual, retorne à página inicial e entre novamente.':
        'Os dados e a foto de perfil foram atualizados. A senha permanece a mesma.');
    }catch(error){
      let msg=error?.message||'Não foi possível salvar este usuário.';
      if(msg==='ACCESS_DUPLICATE')msg='O nome de usuário ou e-mail já está cadastrado em outro acesso.';
      displayError(msg);
      console.warn('PINC edit account',error?.message||error);
    }finally{
      saveBusy=false;
      if(button){button.disabled=false;button.textContent='Salvar alterações';}
    }
  }
  window.PINC_ACCESS_EDITOR={open,upload,removePhoto,refreshPhoto:previewPhoto,save};
})();
