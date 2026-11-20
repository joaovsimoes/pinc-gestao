(function(){
  'use strict';
  window.PINC_PORTAL_USER={star:null,host:null};
  const KIND='pincStarCadastroV2',EVENT='pincStarCadastroEventV2';
  let busy=false;
  const normalize=value=>String(value||'').trim().toLowerCase();
  async function loadStars(){
    if(!window.firebase?.firestore||!window.firebase?.auth)throw new Error('FIREBASE_UNAVAILABLE');
    const config=window.PINC_MANAGEMENT_CONFIG||window.PINC_FIREBASE_CONFIG;
    if(!firebase.apps.length)firebase.initializeApp(config);
    const auth=firebase.auth();
    if(!auth.currentUser)await auth.signInAnonymously();
    const snap=await firebase.firestore().collection('pincLocks').where('type','in',[KIND,EVENT]).get({source:'server'});
    const docs=snap.docs.map(doc=>({...doc.data(),_doc:doc.id}))
      .sort((a,b)=>Number(a.updatedAtMillis||0)-Number(b.updatedAtMillis||0)||a._doc.localeCompare(b._doc));
    const users=new Map();
    for(const d of docs){
      if(d.type===KIND&&d.id&&d.location){
        users.set(d.id,{id:d.id,name:String(d.name||''),matricula:String(d.matricula||''),cdc:String(d.cdc||''),username:normalize(d.username),location:String(d.location)});
      }else if(d.type===EVENT&&users.has(d.targetId)){
        if(d.deleted){users.delete(d.targetId);continue}
        const patch=d.patch||{},u=users.get(d.targetId);
        users.set(d.targetId,{...u,
          name:typeof patch.name==='string'?patch.name:u.name,
          matricula:typeof patch.matricula==='string'?patch.matricula:u.matricula,
          cdc:typeof patch.cdc==='string'?patch.cdc:u.cdc,
          username:typeof patch.username==='string'?normalize(patch.username):u.username
        });
      }
    }
    return [...users.values()];
  }
  window.PINC_SHOW_STAR_LOGIN=function(){
    const modal=document.getElementById('portalStarLogin'),input=document.getElementById('portalStarUsername'),error=document.getElementById('portalStarError');
    window.PINC_PORTAL_USER.star=null;
    if(error)error.textContent='';
    if(input)input.value='';
    if(modal){modal.classList.add('show');modal.setAttribute('aria-hidden','false')}
    setTimeout(()=>input?.focus(),100);
  };
  window.PINC_CLOSE_STAR_LOGIN=function(){
    const modal=document.getElementById('portalStarLogin');
    if(modal){modal.classList.remove('show');modal.setAttribute('aria-hidden','true')}
  };
  window.PINC_LOGIN_STAR_USERNAME=async function(){
    if(busy)return;
    const input=document.getElementById('portalStarUsername'),error=document.getElementById('portalStarError'),button=document.getElementById('portalStarSubmit');
    const username=normalize(input?.value);
    if(!username){if(error)error.textContent='Informe o nome de usuário.';return}
    if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)){if(error)error.textContent='Informe um usuário válido.';return}
    busy=true;if(button){button.disabled=true;button.textContent='Verificando...'}
    if(error)error.textContent='Consultando o cadastro online...';
    try{
      const users=await loadStars();
      const found=users.filter(u=>u.username===username&&u.name&&u.matricula&&u.cdc&&u.location);
      if(found.length!==1){if(error)error.textContent='Usuário não encontrado. Solicite o cadastro à Gestão.';return}
      window.PINC_PORTAL_USER.star={...found[0],profileName:'Star'};
      window.PINC_CLOSE_STAR_LOGIN();window.PINC_DO_LAUNCH('stars');
    }catch(e){
      console.warn('Validação do Portal Stars indisponível:',e);
      if(error)error.textContent='Não foi possível validar o usuário. Confira a conexão e tente novamente.';
    }finally{busy=false;if(button){button.disabled=false;button.textContent='Acessar Stars'}}
  };
  window.PINC_SHOW_PORTAL_LOGIN=function(role){
    if(role==='star')window.PINC_SHOW_STAR_LOGIN();
    else window.PINC_DO_LAUNCH('facilitador');
  };
  window.PINC_CLOSE_PORTAL_LOGIN=window.PINC_CLOSE_STAR_LOGIN;
  window.PINC_VALIDATE_PORTAL=async function(role){
    if(role==='star'){
      const session=window.PINC_PORTAL_USER?.star;
      if(!session)throw new Error('STAR_SESSION_INVALID');
      const users=await loadStars();
      const match=users.find(u=>u.id===session.id&&u.username===session.username&&u.location===session.location&&u.name&&u.matricula&&u.cdc);
      if(!match){window.PINC_PORTAL_USER.star=null;throw new Error('STAR_SESSION_INVALID')}
      window.PINC_PORTAL_USER.star={...match,profileName:'Star'};
      return window.PINC_PORTAL_USER.star;
    }
    const session=window.PINC_PORTAL_USER?.[role];
    if(!session)throw new Error('CODE_INVALID');
    const current=await window.PINC_PORTAL_ACCESS.lookup(role,session.code);
    if(current.location!==session.location)throw new Error('CODE_INVALID');
    window.PINC_PORTAL_USER[role]=current;
    return current;
  };
  const direct=new URLSearchParams(window.location.search).get('portal');
  if(direct==='star')window.PINC_SHOW_STAR_LOGIN();
  else if(direct==='host')window.PINC_DO_LAUNCH('facilitador');
})();