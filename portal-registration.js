(function () {
  'use strict';
  // Novo cadastro de Stars. Intencionalmente NÃO importa os acessos legados com código.
  // Os antigos documentos portalAccess não participam desta base reiniciada.
  const KIND='pincStarCadastroV2',EVENT='pincStarCadastroEventV2';
  let entries=[],unsubscribe=null,loading=null,busy=false,db=null;
  const location=()=>S.currentLocation;
  const here=()=>entries.filter(x=>x.location===location());
  const firebaseMessage=e=>({permission_denied:'Sem permissão para alterar a base online.',unavailable:'Sem conexão com a base de Stars.'}[e?.code]||e?.message||'Não foi possível salvar o cadastro online.');
  async function database(){
    if(db)return db;
    if(!firebase.apps.length)firebase.initializeApp(window.PINC_MANAGEMENT_CONFIG);
    const auth=firebase.auth();if(!auth.currentUser)await auth.signInAnonymously();
    db=firebase.firestore();return db;
  }
  const feed=d=>d.collection('pincLocks').where('type','in',[KIND,EVENT]);
  function decode(snap){
    const docs=snap.docs.map(x=>({...x.data(),_doc:x.id}));
    docs.sort((a,b)=>Number(a.updatedAtMillis||0)-Number(b.updatedAtMillis||0)||a._doc.localeCompare(b._doc));
    const map=new Map();
    for(const d of docs){
      if(d.type===KIND&&d.id&&d.location){
        map.set(d.id,{id:d.id,name:String(d.name||''),matricula:String(d.matricula||''),cdc:String(d.cdc||''),username:String(d.username||'').trim().toLowerCase(),location:String(d.location)});
      }else if(d.type===EVENT&&map.has(d.targetId)){
        if(d.deleted){map.delete(d.targetId);continue}
        const old=map.get(d.targetId),patch=d.patch||{};
        map.set(d.targetId,{...old,...Object.fromEntries(['name','matricula','cdc','username'].filter(k=>typeof patch[k]==='string').map(k=>[k,patch[k]]))});
      }
    }
    return [...map.values()];
  }
  async function refresh(){
    const snap=await (await database()).collection('pincLocks').where('type','in',[KIND,EVENT]).get();
    entries=decode(snap);renderPortalRegistrations();window.renderWelcomeStarOptions?.();
  }
  window.PINC_STAR_REGISTRY={
    active:()=>here().filter(x=>x.name&&x.matricula&&x.cdc),
    find:id=>here().find(x=>x.id===id)||null,
    all:here,
    refresh
  };
  window.renderPortalRegistrations=function(){
    const table=g('portalRegistrationTable');if(!table)return;
    const query=normalizeHeaderText(g('portalRegistrationSearch')?.value||'');
    const rows=here().filter(x=>normalizeHeaderText([x.name,x.matricula,x.cdc,x.username,x.location].join(' ')).includes(query))
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    if(g('portalRegistrationLocation'))g('portalRegistrationLocation').textContent=location();
    if(g('portalRegistrationCount'))g('portalRegistrationCount').textContent=rows.length+' Star(s)';
    table.innerHTML=rows.length?rows.map(u=>'<tr><td><strong>'+esc(u.name)+'</strong></td><td>'+esc(u.matricula)+'</td><td>'+esc(u.cdc)+'</td><td><code>'+esc(u.username||'Não cadastrado')+'</code></td><td>'+esc(u.location)+'</td><td><div class="star-actions"><button class="btn secondary" onclick="openPortalRegistration(\''+esc(u.id)+'\')">Editar</button><button class="btn secondary" onclick="removeStarRegistration(\''+esc(u.id)+'\')">Excluir</button></div></td></tr>').join(''):'<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:28px">Nenhum Star cadastrado nesta localidade. Utilize + Cadastrar Star.</td></tr>';
  };
  window.initPortalRegistration=async function(){
    if(unsubscribe){renderPortalRegistrations();return}
    if(loading)return loading;
    if(g('portalRegistryStatus'))g('portalRegistryStatus').textContent='Carregando cadastro de Stars...';
    loading=(async()=>{
      try{
        await refresh();
        unsubscribe=(await database())&&db.collection('pincLocks').where('type','in',[KIND,EVENT]).onSnapshot(snap=>{
          if(snap.metadata?.hasPendingWrites||snap.metadata?.fromCache)return;
          entries=decode(snap);renderPortalRegistrations();window.renderWelcomeStarOptions?.();
          if(g('portalRegistryStatus'))g('portalRegistryStatus').textContent='Cadastros sincronizados online';
        },err=>{if(g('portalRegistryStatus'))g('portalRegistryStatus').textContent=firebaseMessage(err)});
      }catch(e){if(g('portalRegistryStatus'))g('portalRegistryStatus').textContent=firebaseMessage(e)}
      finally{loading=null}
    })();
    return loading;
  };
  window.openPortalRegistration=function(id){
    if(managementLevel()<4)return toast('Seu perfil não possui permissão para cadastrar Stars.');
    const current=id?here().find(x=>x.id===id):null;
    if(id&&!current)return toast('Star não encontrado nesta localidade.');
    window.__starDraft={id:current?.id||null,location:location(),matricula:current?.matricula||''};
    openDialog(current?'Editar Star':'Cadastrar Star','<div class="form-grid" style="grid-template-columns:1fr 1fr">'+
      '<div class="field full"><label for="starName">Nome completo *</label><input id="starName" maxlength="120" autocomplete="off" value="'+esc(current?.name||'')+'" placeholder="Nome do Star"></div>'+
      '<div class="field"><label for="starMatricula">Matrícula *</label><input id="starMatricula" maxlength="30" inputmode="numeric" autocomplete="off" value="'+esc(current?.matricula||'')+'" placeholder="Ex.: 000123"></div>'+
      '<div class="field"><label for="starCdc">CDC *</label><input id="starCdc" maxlength="30" inputmode="numeric" autocomplete="off" value="'+esc(current?.cdc||'')+'" placeholder="Ex.: 0200"></div>'+
      '<div class="field full"><label for="starUsername">Usuário para acessar o portal Stars *</label><input id="starUsername" maxlength="40" autocapitalize="off" spellcheck="false" autocomplete="off" value="'+esc(current?.username||'')+'" placeholder="Ex.: maria.silva"></div>'+ 
      '<div class="field full"><label for="starLocation">Localidade vinculada *</label><input id="starLocation" readonly value="'+esc(location())+'"></div>'+
      '</div>','<button class="btn secondary" onclick="closeModal()">Cancelar</button><button class="btn primary" id="starSaveButton" onclick="savePortalRegistration()">Salvar Star</button>');
  };
  window.savePortalRegistration=async function(){
    if(busy||managementLevel()<4)return;
    const draft=window.__starDraft;
    if(!draft||draft.location!==location())return toast('A localidade mudou. Abra o cadastro novamente.');
    const name=g('starName')?.value.trim()||'',matricula=g('starMatricula')?.value.trim()||'',cdc=g('starCdc')?.value.trim()||'',username=(g('starUsername')?.value||'').trim().toLowerCase();
    if(!name||!matricula||!cdc||!username)return toast('Preencha nome, matrícula, CDC e usuário.');
    if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username))return toast('Use um usuário de 3 a 40 caracteres com letras minúsculas, números, ponto, hífen ou sublinhado.');
    if(!/^\d+$/.test(cdc))return toast('O CDC deve conter apenas números.');
    if(here().some(x=>x.matricula===matricula&&x.id!==draft.id))return toast('Já existe um Star com essa matrícula na localidade.');
    if(entries.some(x=>x.username===username&&x.id!==draft.id))return toast('Este nome de usuário já está cadastrado. Escolha outro.');
    busy=true;const button=g('starSaveButton');if(button){button.disabled=true;button.textContent='Salvando...'}
    try{
      const conn=await database();
      // Confere novamente a base antes de gravar, inclusive usuários de outras localidades.
      const latest=decode(await feed(conn).get({source:'server'}));
      if(latest.some(x=>x.username===username&&x.id!==draft.id))throw new Error('Este usuário já existe. Escolha outro nome de usuário.');
      if(latest.some(x=>x.location===draft.location&&x.matricula===matricula&&x.id!==draft.id))throw new Error('Esta matrícula já existe nesta localidade.');
      if(draft.id){
        await conn.collection('pincLocks').add({
          type:EVENT,ownerUid:firebase.auth().currentUser.uid,targetId:draft.id,
          location:draft.location,patch:{name,matricula,cdc,username},updatedAtMillis:Date.now()
        });
      }else{
        const ref=conn.collection('pincLocks').doc();
        await ref.set({
          type:KIND,ownerUid:firebase.auth().currentUser.uid,id:ref.id,
          name,matricula,cdc,username,location:draft.location,updatedAtMillis:Date.now()
        });
      }
      await refresh();closeModal();window.__starDraft=null;
      successDialog(draft.id?'Star atualizado':'Star cadastrado','Usuário '+username+' vinculado ao Star, sem senha. Localidade: '+draft.location+'.');
    }catch(e){toast(firebaseMessage(e))}
    finally{busy=false;if(button){button.disabled=false;button.textContent='Salvar Star'}}
  };
  window.removeStarRegistration=function(id){
    if(managementLevel()<4)return;
    const star=here().find(x=>x.id===id);if(!star)return;
    window.__pendingStarDelete={id,location:star.location};
    confirmDialog('Excluir Star','Deseja excluir o cadastro de "'+star.name+'"? Os acolhimentos já confirmados serão mantidos.','Excluir Star','confirmRemoveStarRegistration()',false);
  };
  window.confirmRemoveStarRegistration=async function(){
    if(busy||managementLevel()<4)return;
    const pending=window.__pendingStarDelete;
    if(!pending||pending.location!==location()||!here().some(x=>x.id===pending.id))return;
    busy=true;
    try{
      const conn=await database();
      await conn.collection('pincLocks').add({
        type:EVENT,ownerUid:firebase.auth().currentUser.uid,targetId:pending.id,
        location:pending.location,deleted:true,updatedAtMillis:Date.now()
      });
      window.__pendingStarDelete=null;await refresh();closeModal();
      successDialog('Star excluído','O cadastro deixou de aparecer na lista e na seleção do acolhimento.');
    }catch(e){toast(firebaseMessage(e))}
    finally{busy=false}
  };
})();
