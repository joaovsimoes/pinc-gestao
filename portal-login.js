(function(){
  'use strict';
  window.PINC_PORTAL_USER={star:null,host:null};
  let busy=false;
  const normalizeCdc=value=>String(value??'').trim();
  const NO_PENDING_MESSAGE='Neste PINC não temos colaboradores para serem acolhidos no CDC informado.';
  // Usa o mesmo feed atualizado pela Gestão que alimenta o Portal Stars.
  // O documento pincShared/core é opcional neste PINC e pode não existir.
  function countPendingByLocation(people,cdc,sourceLocation,locations){
    const counts=new Map();
    for(const p of people){
      if(normalizeCdc(p.cdc)!==cdc||p.present!==true||p.welcomeDone===true)continue;
      const location=String(p.location||sourceLocation||'').trim()||
        (Array.isArray(locations)&&locations.length===1?String(locations[0].name||'').trim():'');
      if(!location)continue;
      counts.set(location,(counts.get(location)||0)+1);
    }
    return [...counts].map(([location,count])=>({location,count}))
      .sort((a,b)=>a.location.localeCompare(b.location,'pt-BR'));
  }
  async function loadPendingForCdc(cdc){
    if(!window.firebase?.firestore||!window.firebase?.auth)throw new Error('FIREBASE_UNAVAILABLE');
    if(!firebase.apps.length)firebase.initializeApp(window.PINC_FIREBASE_CONFIG||window.PINC_MANAGEMENT_CONFIG);
    const auth=firebase.auth();if(!auth.currentUser)await auth.signInAnonymously();
    const db=firebase.firestore();
    let feedError=null;
    try{
      const snap=await db.collection('pincLocks').where('type','==','starsFeed').get({source:'server'});
      // Em caso de mais de uma publicação da mesma unidade, usa somente a mais recente.
      const byLocation=new Map();
      for(const doc of snap.docs){
        const feed=doc.data()||{},location=String(feed.location||'').trim();
        if(!location||feed.enabled===false||feed.status==='disabled'||!Array.isArray(feed.participants))continue;
        const current=byLocation.get(location),stamp=Number(feed.updatedAtMillis||0);
        if(!current||stamp>=current.stamp)byLocation.set(location,{stamp,people:feed.participants});
      }
      if(byLocation.size){
        const counts=new Map();
        for(const [location,feed] of byLocation){
          for(const row of countPendingByLocation(feed.people,cdc,location))
            counts.set(row.location,(counts.get(row.location)||0)+row.count);
        }
        return [...counts].map(([location,count])=>({location,count}))
          .sort((a,b)=>a.location.localeCompare(b.location,'pt-BR'));
      }
    }catch(e){feedError=e;console.warn('Consulta do feed Stars indisponível:',e.code||e.message)}
    // Compatibilidade com ambientes que usam o documento compartilhado clássico.
    try{
      const snap=await db.collection('pincShared').doc('core').get({source:'server'});
      if(snap.exists&&Array.isArray(snap.data()?.participants)){
        const data=snap.data();
        return countPendingByLocation(data.participants,cdc,'',data.locations);
      }
    }catch(e){
      console.warn('Consulta do núcleo PINC indisponível:',e.code||e.message);
      if(feedError)throw feedError;
      throw e;
    }
    // A ausência de fonte de dados NÃO significa que o CDC esteja sem pendências.
    throw feedError||new Error('PINC_DATA_UNAVAILABLE');
  }
  window.PINC_SHOW_STAR_LOGIN=function(){
    window.PINC_PORTAL_USER.star=null;
    const modal=document.getElementById('portalStarLogin'),
      form=document.getElementById('portalStarForm'),
      empty=document.getElementById('portalStarEmpty'),
      choice=document.getElementById('portalStarLocationChoice'),
      input=document.getElementById('portalStarCdc'),
      err=document.getElementById('portalStarError');
    if(form)form.hidden=false;if(empty)empty.hidden=true;if(choice)choice.hidden=true;
    if(input)input.value='';if(err)err.textContent='';
    if(modal){modal.classList.add('show');modal.setAttribute('aria-hidden','false')}
    setTimeout(()=>input?.focus(),100);
  };
  window.PINC_CLOSE_STAR_LOGIN=function(){
    const modal=document.getElementById('portalStarLogin');
    if(modal){modal.classList.remove('show');modal.setAttribute('aria-hidden','true')}
  };
  function showEmpty(cdc){
    const form=document.getElementById('portalStarForm'),
      empty=document.getElementById('portalStarEmpty'),
      choice=document.getElementById('portalStarLocationChoice'),
      code=document.getElementById('portalStarEmptyCode'),
      msg=document.getElementById('portalStarEmptyMessage');
    if(form)form.hidden=true;if(empty)empty.hidden=false;if(choice)choice.hidden=true;
    if(code)code.textContent='CDC '+cdc;
    if(msg)msg.textContent=NO_PENDING_MESSAGE;
  }
  function authorize(cdc,location,count){
    window.PINC_PORTAL_USER.star={role:'star',profileName:'Star',cdc,location,pendingCount:count};
    window.PINC_CLOSE_STAR_LOGIN();
    window.PINC_DO_LAUNCH('stars');
  }
  window.PINC_LOGIN_STAR_CDC=async function(){
    if(busy)return;
    const input=document.getElementById('portalStarCdc'),
      err=document.getElementById('portalStarError'),
      button=document.getElementById('portalStarSubmit'),
      cdc=normalizeCdc(input?.value);
    if(!cdc||!/^[0-9]{1,30}$/.test(cdc)){
      if(err)err.textContent='Informe um CDC válido, somente com números.';return;
    }
    busy=true;if(button){button.disabled=true;button.textContent='Verificando CDC...'}
    if(err)err.textContent='Verificando os colaboradores presentes e pendentes...';
    try{
      const matches=await loadPendingForCdc(cdc);
      if(!matches.length){if(err)err.textContent='';showEmpty(cdc);return}
      if(matches.length===1){authorize(cdc,matches[0].location,matches[0].count);return}
      // Havendo o mesmo CDC em duas localidades, não se escolhe uma automaticamente.
      const select=document.getElementById('portalStarLocation'),
        form=document.getElementById('portalStarForm'),
        panel=document.getElementById('portalStarLocationChoice');
      window.__starCdcMatches={cdc,matches};
      if(select){
        select.innerHTML='<option value="">Selecione a localidade</option>'+matches.map(m=>{
          const loc=String(m.location).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;'}[c]));
          return '<option value="'+loc+'">'+loc+' ('+m.count+' pendente'+(m.count===1?'':'s')+')</option>';
        }).join('');
      }
      if(form)form.hidden=true;if(panel)panel.hidden=false;
      if(err)err.textContent='';
    }catch(e){
      console.warn('Verificação do CDC indisponível:',e);
      if(err)err.textContent='Não foi possível verificar os dados do PINC. Confira sua conexão e tente novamente.';
    }finally{busy=false;if(button){button.disabled=false;button.textContent='Verificar CDC'}}
  };
  window.PINC_CONFIRM_STAR_LOCATION=async function(){
    if(busy)return;
    const pending=window.__starCdcMatches,location=document.getElementById('portalStarLocation')?.value;
    if(!pending||!pending.matches.some(x=>x.location===location))return;
    busy=true;
    try{
      const matches=await loadPendingForCdc(pending.cdc);
      const found=matches.find(m=>m.location===location);
      if(!found){showEmpty(pending.cdc);return}
      authorize(pending.cdc,location,found.count);
    }catch(e){
      const err=document.getElementById('portalStarLocationError');
      if(err)err.textContent='Não foi possível validar a localidade. Tente novamente.';
    }finally{busy=false}
  };
  window.PINC_VALIDATE_PORTAL=async function(role){
    if(role==='star'){
      const session=window.PINC_PORTAL_USER?.star;
      if(!session?.cdc||!session.location)throw new Error('STAR_CDC_INVALID');
      const matches=await loadPendingForCdc(normalizeCdc(session.cdc));
      const match=matches.find(x=>x.location===session.location);
      if(!match){window.PINC_PORTAL_USER.star=null;throw new Error('STAR_CDC_NO_PENDING')}
      window.PINC_PORTAL_USER.star={...session,pendingCount:match.count};
      return window.PINC_PORTAL_USER.star;
    }
    const session=window.PINC_PORTAL_USER?.[role];
    if(!session)throw new Error('CODE_INVALID');
    const current=await window.PINC_PORTAL_ACCESS.lookup(role,session.code);
    if(current.location!==session.location)throw new Error('CODE_INVALID');
    window.PINC_PORTAL_USER[role]=current;
    return current;
  };
  window.PINC_SHOW_PORTAL_LOGIN=role=>role==='star'?window.PINC_SHOW_STAR_LOGIN():window.PINC_DO_LAUNCH('facilitador');
  window.PINC_CLOSE_PORTAL_LOGIN=window.PINC_CLOSE_STAR_LOGIN;
  const direct=new URLSearchParams(window.location.search).get('portal');
  if(direct==='star')window.PINC_SHOW_STAR_LOGIN();
  else if(direct==='host')window.PINC_DO_LAUNCH('facilitador');
})();