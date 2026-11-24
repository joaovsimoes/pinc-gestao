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
      audience: ['efetivos','aprendizes','estagiarios'].includes(S.audience) ? S.audience : 'efetivos',
      day: Number(S.day) === 2 ? 2 : 1,
      shift: S.audience === 'estagiarios' ? 'unico' : S.apprenticeShift === 'vespertino' ? 'vespertino' : 'matutino'
    };
  }
  function audienceName(data){ return data.audience==='efetivos'?'Efetivos':data.audience==='estagiarios'?'Estagiários':'Aprendizes'; }
  function periodName(data){ return data.audience==='efetivos'?'Dia '+data.day : data.audience==='estagiarios' ? 'Horário único' : (data.shift==='vespertino'?'Vespertino':'Matutino'); }
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
  // Apresentação editorial: linhas simples e agrupamento por período, sem alterar a ordem das etapas.
  function sectionForStage(stage,index,total) {
    const name=String(stage[0]||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(index===total-1 && /(acolh|encerr|orienta|fretado|fechamento|finaliz|conclusao)/.test(name))return 'Encerramento';
    const time=String(stage[2]||'').trim().match(/^(\d{1,2})[:h](\d{2})/i);
    if(!time)return 'Programação';
    return Number(time[1])<12?'Manhã':'Tarde';
  }
  function isBreakStage(stage) {
    return /(?:^|\b)(pausa|almoco|intervalo|cafe|recepcao)(?:\b|\/)/i.test(
      String(stage[0]||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''));
  }
  async function paint(){
    const data=snapshot;
    const canvas=byId('pincExportCanvas');
    const download=byId('pincExportDownload');
    if(!data||!canvas)return;
    const drawVersion=++version;
    if(download)download.disabled=true;
    const status=byId('pincExportStatus');
    if(status)status.textContent='Atualizando prévia...';

    const previewDate=formatDay(byId('pincExportDate')?.value||'');
    const instructions=instructionsFromInput();
    const measure=document.createElement('canvas').getContext('2d');
    if(!measure){if(status)status.textContent='Este navegador não oferece suporte à geração da imagem.';return;}

    const rows=data.rows.map((stage,i)=>{
      const title=wrap(measure,stage[0]||'Etapa sem título',625,24,700);
      const owner=wrap(measure,stage[1]||'PINC',625,16,500);
      const height=Math.max(79,14+title.length*28+5+owner.length*21+15);
      return {stage,title,owner,height,section:sectionForStage(stage,i,data.rows.length)};
    });
    // Os grupos são criados em sequência para não alterar os horários cadastrados.
    const sections=[];
    rows.forEach(row=>{
      let group=sections[sections.length-1];
      if(!group||group.name!==row.section){
        group={name:row.section,rows:[]};
        sections.push(group);
      }
      group.rows.push(row);
    });
    const top=359,groupHeaderH=57,groupGap=24;
    const stagesHeight=sections.reduce((sum,group)=>
      sum+groupHeaderH+group.rows.reduce((n,row)=>n+row.height,0)+groupGap,0);

    // Orientações em duas colunas, sem a grande caixa de texto do modelo anterior.
    const tipRows=[];
    for(let i=0;i<instructions.length;i+=2){
      const left=wrap(measure,instructions[i],447,17,500);
      const right=instructions[i+1]?wrap(measure,instructions[i+1],447,17,500):[];
      tipRows.push({left,right,height:Math.max(38,Math.max(left.length,right.length)*25+12)});
    }
    const guidanceHeight=instructions.length ? 78+tipRows.reduce((sum,row)=>sum+row.height,0)+20 : 0;
    const guideY=top+stagesHeight+3;
    const footerY=guideY+(guidanceHeight?guidanceHeight+28:0);
    const H=Math.max(footerY+88,660);
    canvas.width=W;
    canvas.height=H;
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx){if(status)status.textContent='Falha ao criar a imagem.';return;}
    try{if(document.fonts?.ready)await document.fonts.ready;}catch(e){}
    if(drawVersion!==version||!byId('pincExportCanvas'))return;

    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
    // Pequenos detalhes da paleta PINC, sem ornamentação sobre os conteúdos.
    ctx.fillStyle='#f7f1ff';
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(210,0);
    ctx.bezierCurveTo(158,64,85,95,0,102);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#efe4fd';ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(W+50,H+65,208,Math.PI*1.0,Math.PI*1.56);ctx.stroke();

    await drawLogo(ctx);
    if(drawVersion!==version||!byId('pincExportCanvas'))return;
    write(ctx,'Agenda do PINC',W/2,175,52,COLORS.text,850,'center');
    write(ctx,audienceName(data)+'  •  '+periodName(data)+'  •  '+data.location,
      W/2,247,22,COLORS.subtitle,550,'center');
    if(previewDate){
      panel(ctx,W/2-105,288,210,39,19,'#f5efff');
      write(ctx,previewDate,W/2,295,20,COLORS.darkPurple,750,'center');
    }else{
      write(ctx,'Programação da integração',W/2,294,17,COLORS.gray,500,'center');
    }
    ctx.beginPath();ctx.moveTo(95,338);ctx.lineTo(W-95,338);
    ctx.strokeStyle='#ede8f3';ctx.lineWidth=2;ctx.stroke();

    let y=top;
    sections.forEach(group=>{
      // Cada período tem um único título e um divisor discreto.
      panel(ctx,96,y+7,7,25,3,COLORS.purple);
      write(ctx,group.name.toLocaleUpperCase('pt-BR'),115,y+8,18,COLORS.darkPurple,800);
      ctx.beginPath();ctx.moveTo(97,y+47);ctx.lineTo(W-97,y+47);
      ctx.strokeStyle='#e8e1ed';ctx.lineWidth=1.6;ctx.stroke();
      y+=groupHeaderH;
      group.rows.forEach((row,i)=>{
        const h=row.height;
        const isPause=isBreakStage(row.stage);
        if(isPause)panel(ctx,95,y+3,W-190,h-6,13,'#faf7fe');
        write(ctx,String(row.stage[2]||'—'),112,y+Math.max(13,(h-27)/2),23,
          isPause?'#7c55a5':COLORS.darkPurple,750);
        const contentY=y+(h-(row.title.length*28+5+row.owner.length*21))/2;
        drawLines(ctx,row.title,280,contentY,28,24,COLORS.text,700);
        drawLines(ctx,row.owner,280,contentY+row.title.length*28+5,21,16,COLORS.subtitle,450);
        const value=duration(row.stage[3]);
        write(ctx,value,W-112,y+Math.max(17,(h-22)/2),18,COLORS.subtitle,600,'right');
        if(i<group.rows.length-1){
          ctx.beginPath();ctx.moveTo(280,y+h);ctx.lineTo(W-110,y+h);
          ctx.strokeStyle='#efebf4';ctx.lineWidth=1;ctx.stroke();
        }
        y+=h;
      });
      y+=groupGap;
    });

    if(instructions.length){
      panel(ctx,95,guideY,W-190,guidanceHeight,17,'#faf8fe','#eee7f6',1);
      write(ctx,'Orientações aos facilitadores',119,guideY+23,23,COLORS.darkPurple,750);
      let tipY=guideY+77;
      tipRows.forEach(({left,right,height})=>{
        ctx.fillStyle='#a879e7';
        ctx.beginPath();ctx.arc(125,tipY+10,4,0,Math.PI*2);ctx.fill();
        drawLines(ctx,left,144,tipY,25,17,COLORS.text,500);
        if(right.length){
          ctx.beginPath();ctx.arc(645,tipY+10,4,0,Math.PI*2);ctx.fill();
          drawLines(ctx,right,665,tipY,25,17,COLORS.text,500);
        }
        tipY+=height;
      });
    }
    write(ctx,'Planejamento e acompanhamento da integração',
      W/2,footerY+23,16,COLORS.gray,500,'center');
    pngCanvas=canvas;
    if(download)download.disabled=false;
    if(status)status.textContent=W+' × '+H+' px • imagem pronta para baixar';
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
