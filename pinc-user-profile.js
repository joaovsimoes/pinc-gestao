/* Avatar e identidade do usuário conectado na Gestão PINC. */
(function(){
  'use strict';
  const PHOTO_MAX = 60000;
  let uploading=false;
  const byId=id=>document.getElementById(id);
  const current=()=>{try{return window.parent?.PINC_AUTH_USER||null}catch(e){return null}};
  const verifiedPhoto=value=>typeof value==='string'&&value.length<PHOTO_MAX&&/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value)?value:'';
  const getName=u=>String(u?.name||u?.username||'Usuário PINC').trim();
  function initials(name){
    const parts=String(name||'').split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0]||'U')+(parts.length>1?parts[parts.length-1]?.[0]||'':'')).toLocaleUpperCase('pt-BR');
  }
  function render(){
    const u=current();if(!u)return;
    const name=getName(u);
    const role=u.profileName||({master:'Master',hub:'Hub',flow:'Flow'})[u.profile]||'Gestão';
    const profileName=byId('pincLoggedName'),profileRole=byId('pincLoggedRole');
    if(profileName){profileName.textContent=name;profileName.title=name;}
    if(profileRole)profileRole.textContent=role+(u.location?' · '+u.location:'');
    const photo=verifiedPhoto(u.photo);
    document.querySelectorAll('[data-pinc-user-avatar]').forEach(el=>{
      el.setAttribute('aria-label','Alterar foto de perfil de '+name);
      el.title='Foto do perfil: '+name+' (clique para alterar)';
      el.innerHTML='';
      if(photo){
        const img=document.createElement('img');
        img.src=photo;img.alt='';img.className='pinc-user-photo';
        img.decoding='async';
        el.appendChild(img);
      }else{
        const span=document.createElement('span');
        span.className='pinc-user-initials';
        span.textContent=initials(name);
        el.appendChild(span);
      }
    });
  }
  function sync(accesses){
    const u=current();
    if(!u||!Array.isArray(accesses))return;
    const record=accesses.find(x=>String(x.id)===String(u.id))||
      accesses.find(x=>String(x.username||'').toLowerCase()===String(u.username||'').toLowerCase());
    if(record){
      const next={...u,
        name:record.name||u.name,username:record.username||u.username,
        location:record.location||u.location,profile:record.profile||u.profile,
        level:Number(record.level||u.level),profileName:record.profileName||u.profileName,
        photo:verifiedPhoto(record.photo)};
      window.parent.PINC_AUTH_USER=next;
    }
    render();
  }
  function pick(){
    if(uploading)return;
    const input=byId('pincProfileUpload');
    if(input){input.value='';input.click();}
  }
  function shrink(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file);
      const img=new Image();
      img.onload=()=>{
        try{
          const sourceW=img.naturalWidth||img.width,sourceH=img.naturalHeight||img.height;
          if(!sourceW||!sourceH)throw new Error('Imagem inválida.');
          function paint(size,quality){
            const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
            const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Seu navegador não suporta edição de fotos.');
            const side=Math.min(sourceW,sourceH);
            ctx.drawImage(img,(sourceW-side)/2,(sourceH-side)/2,side,side,0,0,size,size);
            return canvas.toDataURL('image/jpeg',quality);
          }
          let data=paint(192,.78);
          if(data.length>=PHOTO_MAX)data=paint(144,.62);
          if(!verifiedPhoto(data))throw new Error('Não foi possível reduzir a foto. Escolha outra imagem.');
          resolve(data);
        }catch(e){reject(e)}
        finally{URL.revokeObjectURL(url)}
      };
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Não foi possível abrir a imagem.'))};
      img.src=url;
    });
  }
  async function upload(file){
    if(!file||uploading)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
      window.toast?.('Selecione uma foto JPG, PNG ou WebP.');return;
    }
    if(file.size>5*1024*1024){window.toast?.('A foto deve ter no máximo 5 MB.');return;}
    const user=current();
    if(!user?.id){window.toast?.('Faça login novamente para atualizar a foto.');return;}
    uploading=true;
    document.querySelectorAll('[data-pinc-user-avatar]').forEach(el=>el.disabled=true);
    try{
      const photo=await shrink(file);
      // Salvar no mesmo registro online de acesso, mantendo senha, perfil e permissões atuais.
      const accounts=await window.PINC_ACCESS.load();
      const account=accounts.find(x=>String(x.id)===String(user.id));
      if(!account)throw new Error('Seu cadastro não foi localizado. Entre novamente no sistema.');
      const updated=await window.PINC_ACCESS.upsert({...account,photo});
      sync(updated);
      window.toast?.('Foto do perfil atualizada.');
    }catch(e){
      window.toast?.(e?.message||'Não foi possível salvar a foto. Verifique a conexão.');
      console.warn('PINC profile image',e?.message||e);
    }finally{
      uploading=false;
      document.querySelectorAll('[data-pinc-user-avatar]').forEach(el=>el.disabled=false);
    }
  }
  function init(){
    const input=byId('pincProfileUpload');
    if(input&&!input.dataset.bound){
      input.dataset.bound='true';
      input.addEventListener('change',()=>{const file=input.files?.[0];input.value='';upload(file)});
    }
    render();
  }
  window.PINC_PROFILE={init,render,sync,pick,upload,preparePhoto:shrink};
})();
