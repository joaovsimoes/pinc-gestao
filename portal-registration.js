(function () {
  'use strict';
  // Novo cadastro de Acolhe+. Intencionalmente NÃO importa os acessos legados com código.
  // Os antigos documentos portalAccess não participam desta base reiniciada.
  const KIND='pincStarCadastroV2',EVENT='pincStarCadastroEventV2';
  let entries=[],unsubscribe=null,loading=null,busy=false,db=null;
  const location=()=>S.currentLocation;
  const here=()=>entries.filter(x=>x.location===location());
  const firebaseMessage=e=>({permission_denied:'Sem permissão para alterar a base online.',unavailable:'Sem conexão com a base de Acolhe+.'}[e?.code]||e?.message||'Não foi possível salvar o cadastro online.');
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
        map.set(d.id,{id:d.id,name:String(d.name||''),matricula:String(d.matricula||''),cdc:String(d.cdc||''),location:String(d.location)});
      }else if(d.type===EVENT&&map.has(d.targetId)){
        if(d.deleted){map.delete(d.targetId);continue}
        const old=map.get(d.targetId),patch=d.patch||{};
        map.set(d.targetId,{...old,...Object.fromEntries(['name','matricula','cdc'].filter(k=>typeof patch[k]==='string').map(k=>[k,patch[k]]))});
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
    allLocations:()=>entries.slice(),
    importBulk,
    refresh
  };
  window.renderPortalRegistrations=function(){
    const table=g('portalRegistrationTable');if(!table)return;
    const query=normalizeHeaderText(g('portalRegistrationSearch')?.value||'');
    const rows=here().filter(x=>normalizeHeaderText([x.name,x.matricula,x.cdc,x.location].join(' ')).includes(query))
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    if(g('portalRegistrationLocation'))g('portalRegistrationLocation').textContent=location();
    if(g('portalRegistrationCount'))g('portalRegistrationCount').textContent=rows.length+(rows.length===1?' integrante do Acolhe+':' integrantes do Acolhe+');
    table.innerHTML=rows.length?rows.map(u=>'<tr><td><strong>'+esc(u.name)+'</strong></td><td>'+esc(u.matricula)+'</td><td>'+esc(u.cdc)+'</td><td>'+esc(u.location)+'</td><td><div class="star-actions"><button class="btn secondary" onclick="openPortalRegistration(\''+esc(u.id)+'\')">Editar</button><button class="btn secondary" onclick="removeStarRegistration(\''+esc(u.id)+'\')">Excluir</button></div></td></tr>').join(''):'<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:28px">Nenhum integrante do Acolhe+ cadastrado nesta localidade. Utilize + Cadastrar integrante.</td></tr>';
  };
  window.initPortalRegistration=async function(){
    if(unsubscribe){renderPortalRegistrations();return}
    if(loading)return loading;
    if(g('portalRegistryStatus'))g('portalRegistryStatus').textContent='Carregando cadastro de Acolhe+...';
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
    if(managementLevel()<4)return toast('Seu perfil não possui permissão para cadastrar integrantes do Acolhe+.');
    const current=id?here().find(x=>x.id===id):null;
    if(id&&!current)return toast('Integrante não encontrado nesta localidade.');
    window.__starDraft={id:current?.id||null,location:location(),matricula:current?.matricula||''};
    openDialog(current?'Editar cadastro':'Cadastrar integrante','<div class="form-grid" style="grid-template-columns:1fr 1fr">'+
      '<div class="field full"><label for="starName">Nome completo *</label><input id="starName" maxlength="120" autocomplete="off" value="'+esc(current?.name||'')+'" placeholder="Nome do integrante"></div>'+
      '<div class="field"><label for="starMatricula">Matrícula *</label><input id="starMatricula" maxlength="30" inputmode="numeric" autocomplete="off" value="'+esc(current?.matricula||'')+'" placeholder="Ex.: 000123"></div>'+
      '<div class="field"><label for="starCdc">CDC *</label><input id="starCdc" maxlength="30" inputmode="numeric" autocomplete="off" value="'+esc(current?.cdc||'')+'" placeholder="Ex.: 0200"></div>'+
      '<div class="field full"><label for="starLocation">Localidade vinculada *</label><input id="starLocation" readonly value="'+esc(location())+'"></div>'+
      '</div>','<button class="btn secondary" onclick="closeModal()">Cancelar</button><button class="btn primary" id="starSaveButton" onclick="savePortalRegistration()">Salvar cadastro</button>');
  };
  window.savePortalRegistration=async function(){
    if(busy||managementLevel()<4)return;
    const draft=window.__starDraft;
    if(!draft||draft.location!==location())return toast('A localidade mudou. Abra o cadastro novamente.');
    const name=g('starName')?.value.trim()||'',matricula=g('starMatricula')?.value.trim()||'',cdc=g('starCdc')?.value.trim()||'';
    if(!name||!matricula||!cdc)return toast('Preencha nome, matrícula e CDC.');
    if(!/^\d+$/.test(cdc))return toast('O CDC deve conter apenas números.');
    if(here().some(x=>x.matricula===matricula&&x.id!==draft.id))return toast('Já existe um integrante do Acolhe+ com essa matrícula na localidade.');
    busy=true;const button=g('starSaveButton');if(button){button.disabled=true;button.textContent='Salvando...'}
    try{
      const conn=await database();
      // Confere a matrícula na base online antes de gravar.
      const latest=decode(await feed(conn).get({source:'server'}));
      if(latest.some(x=>x.location===draft.location&&x.matricula===matricula&&x.id!==draft.id))throw new Error('Esta matrícula já existe nesta localidade.');
      if(draft.id){
        await conn.collection('pincLocks').add({
          type:EVENT,ownerUid:firebase.auth().currentUser.uid,targetId:draft.id,
          location:draft.location,patch:{name,matricula,cdc},updatedAtMillis:Date.now()
        });
      }else{
        const ref=conn.collection('pincLocks').doc();
        await ref.set({
          type:KIND,ownerUid:firebase.auth().currentUser.uid,id:ref.id,
          name,matricula,cdc,location:draft.location,updatedAtMillis:Date.now()
        });
      }
      await refresh();closeModal();window.__starDraft=null;
      successDialog(draft.id?'Cadastro atualizado':'Integrante cadastrado','Integrante do Acolhe+ vinculado à localidade '+draft.location+' e ao CDC '+cdc+'.');
    }catch(e){toast(firebaseMessage(e))}
    finally{busy=false;if(button){button.disabled=false;button.textContent='Salvar cadastro'}}
  };
  // A importação escreve documentos no mesmo cadastro usado pelas telas Acolhe+ e Acolhimento.
  // A base é relida do servidor antes da escrita e cada matrícula deve ser única por localidade.
  async function importBulk(items){
    if(busy)throw new Error('Outra operação de cadastro está em andamento.');
    if(managementLevel()<4)throw new Error('Seu perfil não possui permissão para importar Acolhe+.');
    if(!Array.isArray(items)||!items.length)throw new Error('Não existem integrantes do Acolhe+ válidos para importar.');
    if(items.length>2000)throw new Error('Limite de 2.000 integrantes do Acolhe+ por importação. Divida a planilha em partes.');
    busy=true;
    let total=0,skipped=0;
    try{
      const conn=await database();
      const existing=decode(await feed(conn).get({source:'server'}));
      const keys=new Set(existing.map(x=>x.location+'|'+x.matricula.trim()));
      const permitted=(S.locations||[]).map(x=>x.name);
      const safe=[];
      for(const item of items){
        const name=String(item.name||'').trim(),matricula=String(item.matricula||'').trim();
        const cdc=String(item.cdc||'').trim(),loc=String(item.location||'').trim();
        if(!name||name.length>120||!matricula||matricula.length>30||!cdc||cdc.length>30||!/^\d+$/.test(cdc))
          throw new Error('Há dados inválidos na planilha. Revise a prévia e importe novamente.');
        if(!permitted.includes(loc))throw new Error('Localidade não cadastrada: '+loc);
        if(!isMaster()&&loc!==location())throw new Error('Seu perfil só pode importar integrantes do Acolhe+ da própria localidade.');
        const key=loc+'|'+matricula;
        if(keys.has(key)){skipped++;continue}
        keys.add(key);
        safe.push({name,matricula,cdc,location:loc});
      }
      if(!safe.length)return{imported:0,skipped};
      const authUid=firebase.auth().currentUser?.uid;
      if(!authUid)throw new Error('Autenticação online indisponível. Entre novamente no sistema.');
      // No máximo 400 documentos por lote, abaixo do limite do Firestore.
      for(let start=0;start<safe.length;start+=400){
        const batch=conn.batch(),group=safe.slice(start,start+400);
        const now=Date.now();
        for(const [i,star] of group.entries()){
          const ref=conn.collection('pincLocks').doc();
          batch.set(ref,{type:KIND,ownerUid:authUid,id:ref.id,...star,updatedAtMillis:now+i});
        }
        try{await batch.commit();total+=group.length}
        catch(error){
          const message=firebaseMessage(error);
          throw new Error(total
            ?'Importação parcialmente concluída: '+total+' cadastro(s) do Acolhe+ gravado(s) antes da falha. Atualize a lista e reimporte a planilha; matrículas já existentes serão ignoradas. Detalhe: '+message
            :message);
        }
      }
      await refresh();
      return{imported:total,skipped};
    } finally {
      busy=false;
      // A consulta online do cadastro continua disponível mesmo após erros de importação.
      refresh().catch(error=>console.warn('Acolhe+: falha ao atualizar após importação',error));
    }
  }
  window.removeStarRegistration=function(id){
    if(managementLevel()<4)return;
    const star=here().find(x=>x.id===id);if(!star)return;
    window.__pendingStarDelete={id,location:star.location};
    confirmDialog('Excluir cadastro','Deseja excluir o cadastro de "'+star.name+'"? Os acolhimentos já confirmados serão mantidos.','Excluir cadastro','confirmRemoveStarRegistration()',false);
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
      successDialog('Cadastro excluído','O cadastro deixou de aparecer na lista e na seleção do acolhimento.');
    }catch(e){toast(firebaseMessage(e))}
    finally{busy=false}
  };
})();
