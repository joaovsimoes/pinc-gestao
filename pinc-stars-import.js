/* Interface de importação de Stars (CSV/XLSX). Os dados só são gravados após prévia e confirmação. */
(() => {
  'use strict';
  const MAX_ROWS=2000;
  let candidate=[],invalid=[],ignored=[],fileName='',busy=false;
  const el=id=>document.getElementById(id);
  const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&#39;'}[c]));
  const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  function cell(v){
    if(v===null||v===undefined)return '';
    return String(v).trim().replace(/^\uFEFF/,'');
  }
  function reset(){
    candidate=[];invalid=[];ignored=[];fileName='';
    if(el('pincStarFile'))el('pincStarFile').value='';
    const results=el('pincStarImportResults');
    if(results){results.innerHTML='';results.hidden=true;}
    const status=el('pincStarImportStatus');
    if(status){status.hidden=false;status.textContent='Escolha uma planilha para visualizar os registros antes de importar.';}
    const btn=el('pincStarConfirm');
    if(btn){btn.disabled=true;btn.textContent='Importar Stars válidos';}
  }
  function toggle(force){
    if(managementLevel()<4)return toast('Seu perfil não pode importar Stars.');
    const box=el('pincStarImportPanel');
    if(!box)return;
    box.hidden=typeof force==='boolean'?!force:!box.hidden;
    if(!box.hidden){reset();box.scrollIntoView({behavior:'smooth',block:'nearest'});}
  }
  function template(){
    const header='Nome;Matrícula;CDC;Localidade\n';
    const blob=new Blob(['\uFEFF'+header],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='modelo-importacao-stars-pinc.csv';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  function parseCSV(content){
    let raw=String(content||'').replace(/^\uFEFF/,'');
    const first=raw.split(/\r?\n/,1)[0]||'';
    // Delimitador do Excel em português normalmente é ponto-e-vírgula.
    const counts={';':(first.match(/;/g)||[]).length,',':(first.match(/,/g)||[]).length,'\t':(first.match(/\t/g)||[]).length};
    const delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]||';';
    const data=[];let row=[],value='',quoted=false;
    for(let i=0;i<raw.length;i++){
      const ch=raw[i];
      if(ch==='"'){
        if(quoted&&raw[i+1]==='"'){value+='"';i++;}
        else quoted=!quoted;
      }else if(ch===delimiter&&!quoted){row.push(value);value='';}
      else if((ch==='\n'||ch==='\r')&&!quoted){
        if(ch==='\r'&&raw[i+1]==='\n')i++;
        row.push(value);value='';
        data.push(row);row=[];
      }else value+=ch;
    }
    if(quoted)throw new Error('CSV com aspas não fechadas.');
    if(value!==''||row.length){row.push(value);data.push(row);}
    return data;
  }
  function columns(headers){
    const aliases={
      name:['nome','nomecompleto','star','nomedostar','colaborador'],
      matricula:['matricula','matriculastar','registro','mat'],
      cdc:['cdc','centrodecusto','centrodecustos'],
      location:['localidade','unidade','local','site','planta']
    };
    const keys=headers.map(normalize),found={};
    Object.entries(aliases).forEach(([field,options])=>{found[field]=keys.findIndex(k=>options.includes(k));});
    if(found.name<0||found.matricula<0||found.cdc<0)
      throw new Error('Cabeçalho inválido. A planilha precisa conter Nome, Matrícula e CDC. A coluna Localidade é opcional.');
    return found;
  }
  function resolveLocation(value){
    if(!cell(value))return S.currentLocation;
    const key=normalize(value);
    const known=(S.locations||[]).find(x=>normalize(x.name)===key||normalize(x.code||'')===key);
    return known?.name||null;
  }
  function check(rows){
    candidate=[];invalid=[];ignored=[];
    if(!rows.length)throw new Error('A planilha está vazia.');
    const head=columns((rows[0]||[]).map(cell));
    const known=new Set((window.PINC_STAR_REGISTRY?.allLocations?.()||[]).map(x=>x.location+'|'+cell(x.matricula)));
    const seen=new Set();
    let actual=0;
    for(let i=1;i<rows.length;i++){
      const row=rows[i]||[];
      if(row.every(v=>!cell(v)))continue;
      actual++;
      if(actual>MAX_ROWS)throw new Error('A planilha excede '+MAX_ROWS+' linhas de Stars. Separe a base em planilhas menores.');
      const name=cell(row[head.name]),matricula=cell(row[head.matricula]),cdc=cell(row[head.cdc]);
      const rawLoc=head.location>=0?cell(row[head.location]):'';
      const loc=resolveLocation(rawLoc);
      const item={line:i+1,name,matricula,cdc,location:loc||rawLoc};
      const errors=[];
      if(!name)errors.push('Nome não informado');
      else if(name.length>120)errors.push('Nome excede 120 caracteres');
      if(!matricula)errors.push('Matrícula não informada');
      else if(matricula.length>30)errors.push('Matrícula excede 30 caracteres');
      if(!cdc)errors.push('CDC não informado');
      else if(!/^\d+$/.test(cdc))errors.push('CDC deve conter apenas números');
      else if(cdc.length>30)errors.push('CDC excede 30 caracteres');
      if(!loc)errors.push('Localidade não cadastrada');
      else if(!isMaster()&&loc!==S.currentLocation)errors.push('Seu perfil só pode importar na localidade '+S.currentLocation);
      if(errors.length){invalid.push({...item,reason:errors.join('; ')});continue;}
      const key=loc+'|'+matricula;
      if(seen.has(key)){ignored.push({...item,reason:'Matrícula duplicada nesta planilha'});continue;}
      seen.add(key);
      if(known.has(key)){ignored.push({...item,reason:'Matrícula já cadastrada no PINC'});continue;}
      candidate.push({...item,location:loc});
    }
    if(!actual)throw new Error('A planilha não contém registros após o cabeçalho.');
  }
  function preview(){
    const target=el('pincStarImportResults'),button=el('pincStarConfirm');
    if(!target)return;
    const summary='<div class="pinc-star-import-kpis">'+[
      ['Prontos para importar',candidate.length,'valid'],
      ['Já existentes / repetidos',ignored.length,'skip'],
      ['Linhas com erros',invalid.length,'error']
    ].map(([title,count,status])=>'<div class="'+status+'"><span>'+title+'</span><strong>'+count+'</strong></div>').join('')+'</div>';
    const problems=invalid.concat(ignored).sort((a,b)=>a.line-b.line);
    const max=100;
    const body=problems.length?
      '<div class="pinc-star-import-issues"><h4>Conferência por linha</h4><div class="pinc-star-import-table"><table><thead><tr><th>Linha</th><th>Nome</th><th>Matrícula</th><th>Motivo</th></tr></thead><tbody>'+
      problems.slice(0,max).map(x=>'<tr><td>'+x.line+'</td><td>'+safe(x.name||'—')+'</td><td>'+safe(x.matricula||'—')+'</td><td>'+safe(x.reason)+'</td></tr>').join('')+
      '</tbody></table></div>'+(problems.length>max?'<p>A lista mostra os primeiros 100 problemas. Corrija a planilha para revisar os restantes.</p>':'')+'</div>':
      '<p class="pinc-star-import-clear">✓ Nenhum erro ou duplicidade encontrado na planilha.</p>';
    target.innerHTML='<div class="pinc-star-import-file"><strong>'+safe(fileName)+'</strong><span>'+candidate.length+' matrícula(s) nova(s) pronta(s) para importação</span></div>'+summary+body+
      (invalid.length?'<p class="pinc-star-import-warning">Corrija as linhas com erros e selecione a planilha novamente para liberar a importação. Matrículas já cadastradas ou repetidas serão ignoradas.</p>':
        '<p class="pinc-star-import-help">A confirmação adicionará somente os Stars novos, sem apagar ou alterar os cadastros atuais.</p>');
    target.hidden=false;
    const status=el('pincStarImportStatus');
    if(status){status.hidden=true;}
    if(button){button.disabled=invalid.length>0||candidate.length===0;button.textContent='Importar '+candidate.length+' Star'+(candidate.length===1?'':'s');}
  }
  async function loaded(input){
    const file=input?.files?.[0];
    reset();
    if(!file)return;
    fileName=file.name;
    if(file.size>8*1024*1024){feedback('Arquivo maior que 8 MB. Divida a planilha e tente novamente.',true);return;}
    const extension=file.name.split('.').pop().toLowerCase();
    if(!['xlsx','xls','csv'].includes(extension)){feedback('Selecione um arquivo .xlsx, .xls ou .csv.',true);return;}
    feedback('Lendo e validando os registros...',false);
    try{
      let rows;
      if(extension==='csv'){
        const text=await file.text();
        rows=parseCSV(text);
      }else{
        if(!window.XLSX)throw new Error('Leitor Excel não carregado. Atualize a página ou importe como CSV.');
        const buffer=await file.arrayBuffer();
        const book=XLSX.read(buffer,{type:'array',cellDates:false});
        if(!book.SheetNames?.length)throw new Error('O arquivo Excel não possui abas.');
        rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,defval:'',raw:false,blankrows:true});
      }
      check(rows);
      preview();
    }catch(error){
      candidate=[];invalid=[];ignored=[];
      feedback(error.message||'Não foi possível ler a planilha.',true);
    }
  }
  function feedback(message,error){
    const target=el('pincStarImportStatus');
    if(target){target.hidden=false;target.textContent=message;target.classList.toggle('is-error',!!error);}
    if(el('pincStarImportResults'))el('pincStarImportResults').hidden=true;
    if(el('pincStarConfirm'))el('pincStarConfirm').disabled=true;
  }
  function ask(){
    if(busy||!candidate.length||invalid.length)return;
    const locs=new Set(candidate.map(x=>x.location));
    const body='<p class="dialog-message">Confirma a inclusão de <strong>'+candidate.length+
      ' Star(s)</strong> em '+locs.size+' localidade(s)? Cadastros existentes serão preservados e matrículas duplicadas ignoradas.</p>';
    // The import panel lives outside the shared modal; use that modal only for confirmation.
    openDialog('Confirmar importação de Stars',body,
      '<button type="button" class="btn secondary" onclick="closeModal()">Voltar</button>'+
      '<button type="button" class="btn primary" id="pincStarSubmitConfirm" onclick="PINC_STARS_IMPORT.submit()">Confirmar importação</button>');
  }
  async function submit(){
    if(busy||invalid.length||!candidate.length)return;
    if(managementLevel()<4)return toast('Sem permissão para importar Stars.');
    busy=true;
    const button=el('pincStarSubmitConfirm');
    if(button){button.disabled=true;button.textContent='Importando...';}
    const data=candidate.map(({name,matricula,cdc,location})=>({name,matricula,cdc,location}));
    try{
      const result=await window.PINC_STAR_REGISTRY.importBulk(data);
      closeModal();
      toggle(false);
      const desc=result.imported+' Star(s) incluído(s) no cadastro online.'+
        (result.skipped?' '+result.skipped+' matrícula(s) ignorada(s) por já existir(em).':'');
      successDialog('Importação concluída',desc);
    }catch(error){
      if(button){button.disabled=false;button.textContent='Tentar novamente';}
      toast(error.message||'Não foi possível importar Stars.');
      const status=el('pincStarImportStatus');
      if(status){status.hidden=false;status.classList.add('is-error');status.textContent=error.message||'Não foi possível importar.';}
      // Keep source/preview for correction or retry.
    }finally{busy=false;}
  }
  window.PINC_STARS_IMPORT={toggle,template,loaded,ask,submit};
})();
