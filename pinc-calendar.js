(function(){
  'use strict';
  // Eventos com data inicial/final e público. Mantém leitura dos dias legados.
  const LEGACY='pincCalendarDayV1',EVENT='pincCalendarEventV2',ZONE='America/Sao_Paulo',MAX_DAYS=31;
  const AUDIENCES={efetivos:'Efetivos',aprendizes:'Aprendizes',estagiarios:'Estagiários'};
  const datePattern=/^\d{4}-\d{2}-\d{2}$/;
  let db=null,connecting=null;
  function today(){
    const p=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=t=>p.find(x=>x.type===t)?.value||'';
    return get('year')+'-'+get('month')+'-'+get('day');
  }
  function parseDay(day){
    if(!datePattern.test(day||''))return null;
    const date=new Date(day+'T12:00:00Z');
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day?date:null;
  }
  function label(day){
    const date=parseDay(day);
    return date?new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'}).format(date):day;
  }
  function range(start,end){
    const first=parseDay(start),last=parseDay(end||start);
    if(!first||!last||first>last)throw new Error('Informe datas válidas, com a data final igual ou posterior à inicial.');
    const days=[];
    for(let t=first.getTime();t<=last.getTime();t+=86400000){
      if(days.length>=MAX_DAYS)throw new Error('O período pode ter no máximo 31 dias consecutivos.');
      days.push(new Date(t).toISOString().slice(0,10));
    }
    return days;
  }
  function audienceLabel(value){return AUDIENCES[value]||'Não informado'}
  function key(location,date){return location+'|'+date}
  function eventTime(x){
    const server=Number(x.createdAt?.seconds||0)*1e3+Number(x.createdAt?.nanoseconds||0)/1e6;
    return server||Number(x.updatedAtMillis||0);
  }
  function decode(snapshot){
    const docs=snapshot.docs.map(d=>({...d.data(),_doc:d.id}))
      .sort((a,b)=>eventTime(a)-eventTime(b)||Number(a.updatedAtMillis||0)-Number(b.updatedAtMillis||0)||String(a._doc).localeCompare(String(b._doc)));
    const days=new Map(),events=new Map();
    for(const record of docs){
      const location=String(record.location||'').trim();
      if(!location)continue;
      if(record.type===LEGACY){
        const date=String(record.date||'');
        if(!parseDay(date))continue;
        if(record.active===true)days.set(key(location,date),{location,date});
        else if(record.active===false)days.delete(key(location,date));
      }
      if(record.type===EVENT){
        const id=String(record.eventId||'').trim();
        if(!id)continue;
        if(record.active===false){events.delete(id);continue}
        if(record.active!==true||!parseDay(record.start)||!parseDay(record.end)||!AUDIENCES[record.audience])continue;
        try{range(record.start,record.end)}catch(e){continue}
        events.set(id,{id,location,start:record.start,end:record.end,audience:record.audience,legacy:false});
      }
    }
    // Os registros antigos não possuem ID de evento; períodos contíguos da mesma unidade
    // são agrupados somente na apresentação, sem presumir o público da integração.
    const grouped=new Map();
    for(const day of days.values()){
      if(!grouped.has(day.location))grouped.set(day.location,[]);
      grouped.get(day.location).push(day.date);
    }
    const legacyEvents=[];
    for(const [location,dates] of grouped){
      dates.sort();
      let group=[];
      const flush=()=>{
        if(!group.length)return;
        const start=group[0],end=group[group.length-1];
        legacyEvents.push({id:'legacy:'+encodeURIComponent(location)+':'+start+':'+end,
          location,start,end,audience:'',legacy:true,dates:group.slice()});
      };
      for(const day of dates){
        const last=group[group.length-1];
        const next=last?new Date(parseDay(last).getTime()+86400000).toISOString().slice(0,10):'';
        if(group.length&&day!==next){flush();group=[]}
        group.push(day);
      }
      flush();
    }
    return [...events.values(),...legacyEvents].sort((a,b)=>a.start.localeCompare(b.start)||a.location.localeCompare(b.location,'pt-BR')||a.audience.localeCompare(b.audience));
  }
  async function connect(){
    if(!window.firebase?.firestore||!window.firebase?.auth)throw new Error('FIREBASE_UNAVAILABLE');
    if(!connecting)connecting=(async()=>{
      let config=window.PINC_FIREBASE_CONFIG||window.PINC_MANAGEMENT_CONFIG;
      if(!config){try{config=window.parent?.PINC_FIREBASE_CONFIG}catch(e){}}
      if(!config){try{config=PINC_FIREBASE_CONFIG}catch(e){}}
      if(!firebase.apps.length){if(!config)throw new Error('FIREBASE_UNAVAILABLE');firebase.initializeApp(config)}
      const auth=firebase.auth();
      if(!auth.currentUser)await auth.signInAnonymously();
      db=firebase.firestore();
      return{db,uid:auth.currentUser?.uid};
    })().catch(e=>{connecting=null;throw e});
    return connecting;
  }
  const query=db=>db.collection('pincLocks').where('type','in',[LEGACY,EVENT]);
  async function list(){
    const {db}=await connect();
    return decode(await query(db).get({source:'server'}));
  }
  function includesDate(event,date){return event.start<=date&&date<=event.end}
  async function allowed(location){
    const loc=String(location||'').trim();
    if(!loc)return false;
    const rows=await list(),date=today();
    return rows.some(x=>x.location===loc&&includesDate(x,date));
  }
  async function openLocations(){
    const rows=await list(),date=today();
    return [...new Set(rows.filter(x=>includesDate(x,date)).map(x=>x.location))];
  }
  async function saveEvent(input){
    const location=String(input?.location||'').trim(),start=String(input?.start||''),end=String(input?.end||start);
    const audience=String(input?.audience||'').trim();
    const dates=range(start,end);
    if(!location||!AUDIENCES[audience])throw new Error('Informe a localidade e selecione Efetivos, Aprendizes ou Estagiários.');
    const {db,uid}=await connect();
    if(!uid)throw new Error('FIREBASE_UNAVAILABLE');
    const all=await list(),id=String(input?.id||'').trim();
    const original=id?all.find(x=>x.id===id):null;
    if(id&&!original)throw new Error('Este PINC foi alterado. Atualize o calendário e tente novamente.');
    if(original&&original.location!==location)throw new Error('A localidade do evento não pode ser alterada.');
    if(all.some(x=>x.id!==id&&x.location===location&&x.start===start&&x.end===end&&x.audience===audience))
      throw new Error('Já existe um PINC desse público nas mesmas datas e localidade.');
    const batch=db.batch(),now=Date.now(),idRef=db.collection('pincLocks').doc();
    const eventId=original&&!original.legacy?original.id:idRef.id;
    batch.set(idRef,{type:EVENT,ownerUid:uid,eventId,location,start,end,audience,active:true,
      updatedAtMillis:now,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    if(original?.legacy){
      for(const [i,date] of original.dates.entries()){
        const ref=db.collection('pincLocks').doc();
        batch.set(ref,{type:LEGACY,ownerUid:uid,location,date,active:false,
          updatedAtMillis:now+i+1,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
      }
    }
    await batch.commit();
    return{eventId,count:dates.length,updated:!!original};
  }
  async function addRange(location,start,end,audience){return saveEvent({location,start,end,audience})}
  async function removeEvent(id){
    const eventId=String(id||''),{db,uid}=await connect();
    if(!uid)throw new Error('FIREBASE_UNAVAILABLE');
    const record=(await list()).find(x=>x.id===eventId);
    if(!record)return 0;
    const batch=db.batch(),now=Date.now();
    if(record.legacy){
      record.dates.forEach((date,i)=>{
        const ref=db.collection('pincLocks').doc();
        batch.set(ref,{type:LEGACY,ownerUid:uid,location:record.location,date,active:false,
          updatedAtMillis:now+i,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
      });
    }else{
      const ref=db.collection('pincLocks').doc();
      batch.set(ref,{type:EVENT,ownerUid:uid,eventId:record.id,location:record.location,
        start:record.start,end:record.end,audience:record.audience,active:false,
        updatedAtMillis:now,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    }
    await batch.commit();
    return 1;
  }
  async function watch(onChange,onError){
    const {db}=await connect();
    return query(db).onSnapshot(snap=>{
      if(snap.metadata?.hasPendingWrites)return;
      onChange(decode(snap));
    },onError);
  }
  window.PINC_DATES={today,label,range,audienceLabel,list,allowed,openLocations,saveEvent,addRange,removeEvent,watch,decode};
})();