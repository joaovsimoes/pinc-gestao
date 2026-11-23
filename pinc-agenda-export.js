/* Exportação de imagem da agenda PINC, construída exclusivamente com dados da agenda selecionada. */
(() => {
  'use strict';

  const W = 1240;
  const COLORS = {
    bg: '#ffffff', text: '#241b38', subtitle: '#6f677e',
    purple: '#7417ff', darkPurple: '#4e0fa8', line: '#e6d9f5',
    soft: '#f5edff', lighter: '#fcfaff', accent: '#eeccff', gray: '#8b8298'
  };
  const GUIDANCE = [
    'Chegue com 5 minutos de antecedência do seu horário.',
    'Mantenha sua apresentação e seus materiais prontos antes do início.',
    'Respeite o horário previsto e a duração de cada etapa.',
    'Em caso de imprevisto, comunique a equipe de G&G com antecedência.'
  ];
  let version = 0;
  let snapshot = null;
  let pngCanvas = null;
  let renderDelay = null;

  function byId(id) { return document.getElementById(id); }
  function font(size, weight = 500) { return weight + ' ' + size + 'px Inter, system-ui, "Segoe UI", Arial, sans-serif'; }
  function pathRound(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
  function panel(ctx, x, y, w, h, r, fill, border = null, lineWidth = 1) {
    pathRound(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }
  function write(ctx, value, x, y, size, color, weight=500, align='left') {
    ctx.font=font(size,weight);
    ctx.textBaseline='top';
    ctx.textAlign=align;
    ctx.fillStyle=color;
    ctx.fillText(String(value),x,y);
    ctx.textAlign='left';
  }
  function wrap(ctx, value, width, size, weight=500) {
    ctx.font=font(size,weight);
    const words=String(value||'').trim().split(/\s+/).filter(Boolean);
    if(!words.length) return [];
    const lines=[];
    let line='';
    for(const word of words){
      const candidate=line ? line+' '+word : word;
      if(ctx.measureText(candidate).width<=width){line=candidate;continue;}
      if(line){lines.push(line);line='';}
      if(ctx.measureText(word).width<=width){line=word;continue;}
      // Avoid clipping unusually long words in imported stage names.
      let chunk='';
      for(const char of word){
        if(chunk&&ctx.measureText(chunk+char).width>width){lines.push(chunk);chunk='';}
        chunk+=char;
      }
      line=chunk;
    }
    if(line)lines.push(line);
    return lines;
  }
  function drawLines(ctx, lines, x, y, lineHeight, size, color, weight=500) {
    lines.forEach((line,i)=>write(ctx,line,x,y+i*lineHeight,size,color,weight));
  }
  function shapeClock(ctx, x, y, color) {
    ctx.save();
    ctx.strokeStyle=color;ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();
    ctx.arc(x,y,13,0,2*Math.PI);
    ctx.moveTo(x,y-8);ctx.lineTo(x,y);ctx.lineTo(x+6,y+5);
    ctx.stroke();ctx.restore();
  }
  function shapeHourglass(ctx,x,y,color) {
    ctx.save();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(x-9,y-12);ctx.lineTo(x+9,y-12);
    ctx.moveTo(x-9,y+12);ctx.lineTo(x+9,y+12);
    ctx.moveTo(x-7,y-10);ctx.quadraticCurveTo(x-8,y-3,x,y);
    ctx.quadraticCurveTo(x+8,y+5,x+7,y+10);
    ctx.moveTo(x+7,y-10);ctx.quadraticCurveTo(x+8,y-3,x,y);
    ctx.quadraticCurveTo(x-8,y+5,x-7,y+10);
    ctx.stroke();ctx.restore();
  }
  function formatDay(value) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return '';
    const [yyyy,mm,dd]=value.split('-');
    const date=new Date(value+'T12:00:00Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return '';
    return dd+'/'+mm+'/'+yyyy;
  }
  function plusDays(date,days){
    const parsed = new Date(date+'T12:00:00Z');
    if(!Number.isFinite(parsed.getTime()))return '';
    parsed.setUTCDate(parsed.getUTCDate()+days);
    return parsed.toISOString().slice(0,10);
  }
  function duration(value) {
    const n = Number(value);
    return Math.max(0,Number.isFinite(n)?Math.round(n):0)+' min';
  }
  function cleanName(value){
    return String(value||'pinc').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45);
  }
  function getSnapshot(){
    // S and list() are in gestao.html; a cloned snapshot avoids mutation during image creation.
    const source = typeof list === 'function' ? list() : [];
    return {
      rows: Array.isArray(source) ? source.map(item => Array.isArray(item) ? item.slice() : []) : [],
      location: S.currentLocation || 'Localidade',
      audience: S.audience === 'aprendizes' ? 'aprendizes' : 'efetivos',
      day: Number(S.day) === 2 ? 2 : 1,
      shift: S.apprenticeShift === 'vespertino' ? 'vespertino' : 'matutino'
    };
  }
  function audienceName(data){ return data.audience==='efetivos'?'Efetivos':'Aprendizes'; }
  function periodName(data){ return data.audience==='efetivos'?'Dia '+data.day : (data.shift==='vespertino'?'Vespertino':'Matutino'); }
  async function preferredDate(data) {
    // Only prefill a date actually registered in Calendário PINC.
    if(typeof window.PINC_DATES?.list !== 'function')return '';
    try{
      const events=await window.PINC_DATES.list();
      const same=(events||[]).filter(e=>e.location===data.location &&
        (!e.audience||e.audience===data.audience))
        .map(e=>({date:data.audience==='efetivos'&&data.day===2?plusDays(e.start,1):e.start,
          last:e.end}))
        .filter(e=>e.date&&e.date<=e.last)
        .sort((a,b)=>a.date.localeCompare(b.date));
      const today=window.PINC_DATES.today?.() || new Date().toISOString().slice(0,10);
      return (same.find(e=>e.date===today)||same.find(e=>e.date>=today))?.date||'';
    }catch(e) {return '';}
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  async function open(){
    if(typeof openDialog!=='function')return;
    snapshot=getSnapshot();
    if(!snapshot.rows.length) {
      openDialog('Agenda sem etapas',
        '<p class="dialog-message">Cadastre as etapas nesta agenda antes de gerar a imagem.</p>',
        '<button class="btn primary" onclick="closeModal()">Entendi</button>');
      return;
    }
    const title='Gerar imagem da agenda';
    const body = '<div class="pinc-export-panel">'+
      '<p class="pinc-export-intro">A imagem utiliza as etapas e os horários previstos de <strong>'+
      escapeHTML(audienceName(snapshot)+' • '+periodName(snapshot)+' • '+snapshot.location)+
      '</strong>. Você pode compartilhá-la com os facilitadores.</p>'+
      '<div class="pinc-export-fields">'+
      '<label class="pinc-export-field">Data da integração <span>(opcional)</span>'+
      '<input id="pincExportDate" type="date" aria-label="Data da integração"></label>'+
      '<label class="pinc-export-field pinc-export-guidance">Orientações aos facilitadores <span>(uma por linha)</span>'+
      '<textarea id="pincExportGuidance" rows="4" maxlength="900" aria-label="Orientações aos facilitadores">'+
      escapeHTML(GUIDANCE.join('\n'))+'</textarea></label></div>'+
      '<div class="pinc-export-preview-title"><strong>Pré-visualização</strong><span id="pincExportStatus">Preparando imagem...</span></div>'+
      '<div class="pinc-export-preview"><canvas id="pincExportCanvas" aria-label="Prévia da imagem da agenda"></canvas></div>'+
      '<p class="pinc-export-note">O arquivo PNG utiliza todas as etapas desta agenda, mesmo que a pesquisa na tela esteja ativa. Nenhum dado cadastrado será alterado.</p>'+
      '</div>';
    const actions='<button class="btn secondary" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn primary" id="pincExportDownload" onclick="PINC_AGENDA_EXPORT.download()" disabled>↓ Baixar imagem PNG</button>';
    openDialog(title,body,actions);
    byId('pincExportDate')?.addEventListener('change',schedulePreview);
    byId('pincExportGuidance')?.addEventListener('input',schedulePreview);
    await paint();
    const date=await preferredDate(snapshot);
    const field=byId('pincExportDate');
    if(field&&date&&!field.value&&byId('pincExportCanvas')) {field.value=date;await paint();}
  }
  function schedulePreview() {
    clearTimeout(renderDelay);
    renderDelay=setTimeout(paint,170);
  }
  function instructionsFromInput(){
    return String(byId('pincExportGuidance')?.value||'').split(/\r?\n/)
      .map(s=>s.replace(/^[•*-]\s*/,'').trim()).filter(Boolean).slice(0,8);
  }
  async function drawLogo(ctx){
    const img=document.querySelector('.brand img');
    if(img){
      try {
        if(typeof img.decode==='function'&&!img.complete)await img.decode();
        if(img.naturalWidth&&img.naturalHeight){
          const maxW=380,maxH=120;
          const scale=Math.min(maxW/img.naturalWidth,maxH/img.naturalHeight);
          const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
          ctx.drawImage(img,(W-w)/2,37,w,h);
          return;
        }
      }catch(e){}
    }
    // Fallback remains branded even if the sidebar logo has not loaded.
    write(ctx,'PINC',W/2,65,75,COLORS.purple,900,'center');
    write(ctx,'Programa de Integração de Novos Colaboradores',W/2,147,18,COLORS.gray,500,'center');
  }
  async function paint(){
    const data=snapshot;
    const canvas=byId('pincExportCanvas');
    const download=byId('pincExportDownload');
    if(!data||!canvas)return;
    const drawVersion=++version;
    if(download)download.disabled=true;
    const status=byId('pincExportStatus');
    if(status)status.textContent='Gerando prévia...';

    const previewDate=formatDay(byId('pincExportDate')?.value||'');
    const instructions=instructionsFromInput();
    const measure=document.createElement('canvas').getContext('2d');
    if(!measure){if(status)status.textContent='Este navegador não oferece suporte à geração da imagem.';return;}
    const stageLayouts=data.rows.map(stage=>{
      const title=wrap(measure,stage[0]||'Etapa sem título',615,24,800);
      const owner=wrap(measure,stage[1]||'PINC',615,18,500);
      return {stage,title,owner,height:Math.max(104,28+title.length*30+owner.length*23+13)};
    });
    const guidanceLayouts=instructions.map((s)=>wrap(measure,s,980,20,500));
    const guidanceHeight=84+guidanceLayouts.reduce((sum,lines)=>sum+Math.max(34,lines.length*27+7),0)+28;
    const firstY=354;
    const stagesHeight=stageLayouts.reduce((sum,row)=>sum+row.height+10,0);
    const guideY=firstY+stagesHeight+30;
    const footerY=guideY+guidanceHeight+25;
    const H=footerY+95;
    canvas.width=W;
    canvas.height=H;
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx){if(status)status.textContent='Falha ao criar a imagem.';return;}
    // Wait for branding font and logo to settle. Ignore outdated renders.
    try{if(document.fonts?.ready)await document.fonts.ready;}catch(e){}
    if(drawVersion!==version||!byId('pincExportCanvas'))return;

    ctx.fillStyle=COLORS.bg;ctx.fillRect(0,0,W,H);
    const fade=ctx.createLinearGradient(0,0,310,280);
    fade.addColorStop(0,'#e4c7ff');fade.addColorStop(1,'#faf7ff');
    ctx.fillStyle=fade;
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(350,0);ctx.bezierCurveTo(280,90,176,146,0,171);ctx.closePath();ctx.fill();
    ctx.fillStyle='#f1e8ff';
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(160,0);ctx.bezierCurveTo(140,56,67,128,0,135);ctx.closePath();ctx.fill();

    await drawLogo(ctx);
    if(drawVersion!==version||!byId('pincExportCanvas'))return;

    write(ctx,'Agenda do PINC',W/2,174,59,COLORS.text,900,'center');
    panel(ctx,W/2-43,248,86,5,3,COLORS.purple);
    const label=audienceName(data)+'  •  '+periodName(data)+'  •  '+data.location;
    write(ctx,label,W/2,270,24,COLORS.subtitle,600,'center');
    if(previewDate){
      panel(ctx,W/2-105,309,210,32,16,COLORS.soft);
      write(ctx,previewDate,W/2,316,18,COLORS.darkPurple,750,'center');
    }else{
      write(ctx,'Programação diária',W/2,311,18,COLORS.gray,500,'center');
    }

    // Timeline visual and row cards.
    if(stageLayouts.length>1){
      ctx.strokeStyle='#b58aff';ctx.lineWidth=3;ctx.beginPath();
      ctx.moveTo(56,firstY+54);
      ctx.lineTo(56,firstY+stagesHeight-stageLayouts[stageLayouts.length-1].height/2-6);
      ctx.stroke();
    }
    let y=firstY;
    stageLayouts.forEach((row,i)=>{
      const h=row.height;
      panel(ctx,79,y,1080,h,20,i%2===0?'#ffffff':'#fdfbff','#ddccef',1.5);
      panel(ctx,100,y+(h-54)/2,54,54,14,COLORS.soft);
      write(ctx,i+1,127,y+(h-31)/2,27,COLORS.darkPurple,900,'center');
      ctx.fillStyle='#ffffff';ctx.strokeStyle='#a778eb';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(56,y+h/2,9,0,Math.PI*2);ctx.fill();ctx.stroke();
      let ty=y+21;
      drawLines(ctx,row.title,179,ty,30,24,COLORS.text,800);
      ty+=row.title.length*30+7;
      drawLines(ctx,row.owner,179,ty,23,18,COLORS.subtitle,500);
      ctx.beginPath();ctx.strokeStyle='#e0d0ee';ctx.lineWidth=2;
      ctx.moveTo(841,y+19);ctx.lineTo(841,y+h-19);ctx.stroke();
      panel(ctx,862,y+(h-49)/2,137,49,12,COLORS.soft);
      shapeClock(ctx,887,y+h/2,COLORS.darkPurple);
      write(ctx,String(row.stage[2]||'—'),922,y+(h-25)/2,22,COLORS.text,800);
      panel(ctx,1013,y+(h-49)/2,129,49,12,COLORS.soft);
      shapeHourglass(ctx,1037,y+h/2,COLORS.darkPurple);
      write(ctx,duration(row.stage[3]),1059,y+(h-22)/2,17,COLORS.text,800);
      y+=h+10;
    });

    panel(ctx,79,guideY,1080,guidanceHeight,23,'#f6efff','#e6d2ff',1.5);
    panel(ctx,105,guideY+21,49,49,13,COLORS.purple);
    // Simplified checklist symbol.
    ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.lineCap='round';
    [0,1,2].forEach(i=>{
      const ly=guideY+32+i*11;
      ctx.beginPath();ctx.moveTo(115,ly+3);ctx.lineTo(119,ly+7);ctx.lineTo(125,ly);ctx.moveTo(132,ly+4);ctx.lineTo(145,ly+4);ctx.stroke();
    });
    write(ctx,'Orientações aos facilitadores',171,guideY+30,30,COLORS.darkPurple,850);
    let gy=guideY+89;
    guidanceLayouts.forEach((lines,i)=>{
      const rowH=Math.max(34,lines.length*27+7);
      if(i===0)panel(ctx,103,gy-7,1027,rowH+7,13,'#ead8ff');
      ctx.fillStyle=COLORS.purple;ctx.beginPath();ctx.arc(123,gy+12,5,0,Math.PI*2);ctx.fill();
      drawLines(ctx,lines,145,gy,27,20,i===0?COLORS.darkPurple:COLORS.text,i===0?800:500);
      gy+=rowH;
    });
    ctx.strokeStyle='#d1b7ea';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(190,footerY+25);ctx.lineTo(350,footerY+25);
    ctx.moveTo(890,footerY+25);ctx.lineTo(1050,footerY+25);ctx.stroke();
    write(ctx,'Planejamento e acompanhamento da integração',W/2,footerY+13,19,COLORS.subtitle,500,'center');

    pngCanvas=canvas;
    if(download)download.disabled=false;
    if(status)status.textContent=W+' × '+H+' px • pronta para baixar';
  }
  function download() {
    const canvas=pngCanvas;
    if(!canvas||canvas!==byId('pincExportCanvas'))return;
    const date=byId('pincExportDate')?.value||'';
    const file=['agenda-pinc',cleanName(snapshot?.location),
      cleanName(audienceName(snapshot)),cleanName(periodName(snapshot)),date].filter(Boolean).join('-')+'.png';
    try {
      const anchor=document.createElement('a');
      anchor.download=file;
      anchor.href=canvas.toDataURL('image/png');
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }catch(e){
      const status=byId('pincExportStatus');
      if(status)status.textContent='Não foi possível baixar. Tente novamente ou use outro navegador.';
      console.error('Falha ao exportar PNG da agenda PINC',e);
    }
  }
  window.PINC_AGENDA_EXPORT={open,download};
})();
