(function(){
  'use strict';
  window.PINC_PORTAL_USER={star:null,host:null};
  // Portal Stars é uma consulta sem código. A localidade é escolhida na própria tela.
  window.PINC_SHOW_PORTAL_LOGIN=function(role){
    window.PINC_DO_LAUNCH(role==='host'?'facilitador':'stars');
  };
  window.PINC_CLOSE_PORTAL_LOGIN=function(){};
  window.PINC_LOGIN_PORTAL_CODE=function(){window.PINC_DO_LAUNCH('stars')};
  window.PINC_VALIDATE_PORTAL=async function(role){
    if(role==='star')return{profile:'welcome',profileName:'Star',role:'star',location:''};
    const session=window.PINC_PORTAL_USER?.[role];
    if(!session)throw new Error('CODE_INVALID');
    const current=await window.PINC_PORTAL_ACCESS.lookup(role,session.code);
    if(current.location!==session.location)throw new Error('CODE_INVALID');
    window.PINC_PORTAL_USER[role]=current;return current;
  };
  const direct=new URLSearchParams(window.location.search).get('portal');
  if(direct==='star'||direct==='host')window.PINC_DO_LAUNCH(direct==='host'?'facilitador':'stars');
})();