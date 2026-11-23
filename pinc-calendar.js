(function(){
  'use strict';
  // Datas oficiais do PINC: lista compartilhada em Firebase, sem liberação por dados locais.
  const TYPE='pincCalendarDayV1', ZONE='America/Sao_Paulo', MAX_DAYS=31;
  const re=/^\d{4}-\d{2}-\d{2}$/;
  let db=null,authPromise=null;
  function today(){
    const p=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=t=>p.find(x=>x.type===t)?.value||'';
    return get('year')+'-'+get('month')+'-'+get('day');
  }
  function parseDay(v){
    if(!re.test(v||''))return null;
    const t=new Date(v+'T12:00:00Z');
    return Number.isFinite(t.getTime())&&t.toISOString().slice(0,10)===v?t:null;
  }
  function label(v){
    const d=parseDay(v);return d?new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'}).format(d):v;
  }
  function range(start,end){
    const a=parseDay(start),b=parseDay(end||start);
    if(!a||!b||a>b)throw new Error('Selecione datas válidas, em ordem crescente.');
    const out=[];
    for(let t=a.getTime();t<=b.getTime();t+=86400000){
      if(out.length>=MAX_DAYS)throw new Error('Cadastre até 31 dias consecutivos por vez.');
      out.push(new Date(t).toISOString().slice(0,10));
    }
    return out;
  }
  function key(location,date){return location+'|'+date}
  function decode(snapshot){
    const docs=snapshot.docs.map(d=>({...d.data(),_id:d.id})).filter(x=>x.type===TYPE);
    docs.sort((a,b)=>Number(a.createdAt?.seconds||0)-Number(b.createdAt?.seconds||0)||Number(a.createdAt?.nanoseconds||0)-Number(b.createdAt?.nanoseconds||0)||Number(a.updatedAtMillis||0)-Number(b.updatedAtMillis||0)||String(a._id).localeCompare(String(b._id)));
    const map=new Map();
    for(const e of docs){
      const location=String(e.location||'').trim(),date=String(e.date||'');
      if(!location||!parseDay(date))continue;
      if(e.active===true)map.set(key(location,date),{location,date,active:true});
      else if(e.active===false)map.delete(key(location,date));
    }
    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.location.localeCompare(b.location,'pt-BR'));
  }
  async function connect(){
    if(!window.firebase?.firestore||!window.firebase?.auth)throw new Error('FIREBASE_UNAVAILABLE');
    if(!authPromise)authPromise=(async()=>{
      let config=window.PINC_FIREBASE_CONFIG||window.PINC_MANAGEMENT_CONFIG;
      if(!config){try{config=window.parent?.PINC_FIREBASE_CONFIG}catch(e){}}
      if(!config){try{config=PINC_FIREBASE_CONFIG}catch(e){}}
      if(!firebase.apps.length){if(!config)throw new Error('FIREBASE_UNAVAILABLE');firebase.initializeApp(config)};
      const auth=firebase.auth();
      if(!auth.currentUser)await auth.signInAnonymously();
      db=firebase.firestore();
      return{db,uid:auth.currentUser?.uid};
    })().catch(e=>{authPromise=null;throw e});
    return authPromise;
  }
  async function list(){
    const {db}=await connect();
    const snapshot=await db.collection('pincLocks').where('type','==',TYPE).get({source:'server'});
    return decode(snapshot);
  }
  async function allowed(location){
    const name=String(location||'').trim();
    if(!name)return false;
    const entries=await list();
    return entries.some(x=>x.location===name&&x.date===today());
  }
  async function openLocations(){
    const entries=await list(),date=today();
    return [...new Set(entries.filter(x=>x.date===date).map(x=>x.location))];
  }
  async function write(location,dates,active){
    const name=String(location||'').trim();
    if(!name||!Array.isArray(dates)||!dates.length||dates.length>MAX_DAYS||dates.some(v=>!parseDay(v)))throw new Error('Informe localidade e datas válidas.');
    const {db,uid}=await connect();
    if(!uid)throw new Error('FIREBASE_UNAVAILABLE');
    const existing=await list();
    const current=new Set(existing.map(x=>key(x.location,x.date)));
    const changed=[...new Set(dates)].filter(d=>current.has(key(name,d))!==active);
    if(!changed.length)return 0;
    const batch=db.batch(),now=Date.now();
    changed.forEach((date,i)=>{
      const ref=db.collection('pincLocks').doc();
      batch.set(ref,{type:TYPE,ownerUid:uid,location:name,date,active,updatedAtMillis:now+i,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    });
    await batch.commit();
    return changed.length;
  }
  async function addRange(location,start,end){return write(location,range(start,end),true)}
  async function remove(location,date){return write(location,[date],false)}
  async function watch(onChange,onError){
    const {db}=await connect();
    return db.collection('pincLocks').where('type','==',TYPE).onSnapshot(snapshot=>{
      if(snapshot.metadata?.hasPendingWrites)return;
      onChange(decode(snapshot));
    },onError);
  }
  window.PINC_DATES={today,label,range,list,allowed,openLocations,addRange,remove,watch,decode};
})();