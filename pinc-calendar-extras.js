/* Complementos de navegação do Calendário de PINCs, sem gravar ou alterar eventos. */
(() => {
  'use strict';
  function byId(id){return document.getElementById(id);}
  function monthLabel(day){
    const date=new Date(day+'T12:00:00Z');
    const label=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',month:'long',year:'numeric'}).format(date);
    return label[0].toUpperCase()+label.slice(1);
  }
  function render({events=[],month,selectedDate,today,loaded}){
    const picker=byId('pincCalendarMonthJump'),monthCount=byId('pincMonthSummary'),upcoming=byId('pincMonthUpcoming');
    if(picker&&picker.value!==month)picker.value=month;
    const label=byId('pincMonthLabel');
    if(label&&/^\d{4}-\d{2}$/.test(month||''))label.textContent=monthLabel(month+'-01');
    if(monthCount){
      const count=events.filter(e=>e.start<=month+'-31'&&e.end>=month+'-01').length;
      monthCount.textContent=!loaded?'Consultando as integrações do mês...':
        count===0?'Nenhuma integração programada neste mês':
        count+(count===1?' integração programada neste mês':' integrações programadas neste mês');
    }
    const title=byId('pincSelectedDayLabel');
    if(title&&selectedDate){
      const text=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'})
        .format(new Date(selectedDate+'T12:00:00Z'));
      title.textContent=text.charAt(0).toUpperCase()+text.slice(1);
    }
    if(upcoming){
      upcoming.innerHTML='';
      const heading=document.createElement('h4');
      heading.textContent='Próximos PINCs';
      upcoming.appendChild(heading);
      const list=document.createElement('div');list.className='pinc-cal-upcoming-list';upcoming.appendChild(list);
      if(!loaded){
        const note=document.createElement('div');note.className='pinc-cal-no-next';note.textContent='Consultando a programação...';list.appendChild(note);return;
      }
      const future=events.filter(e=>e.end>=today)
        .sort((a,b)=>a.start.localeCompare(b.start)).slice(0,3);
      if(!future.length){
        const note=document.createElement('div');note.className='pinc-cal-no-next';
        note.textContent='Nenhuma próxima integração cadastrada.';list.appendChild(note);return;
      }
      for(const item of future){
        const btn=document.createElement('button');btn.type='button';btn.className='pinc-cal-next';
        const text=document.createElement('span');text.className='pinc-cal-next-text';
        const strong=document.createElement('strong');
        strong.textContent=(window.PINC_DATES?.audienceLabel(item.audience)||'PINC');
        const small=document.createElement('small');
        small.textContent=window.PINC_DATES.label(item.start)+(item.start!==item.end?' a '+window.PINC_DATES.label(item.end):'');
        const arrow=document.createElement('span');arrow.className='pinc-cal-next-arrow';
        arrow.setAttribute('aria-hidden','true');arrow.textContent='›';
        text.append(strong,small);btn.append(text,arrow);
        btn.addEventListener('click',()=>window.pincSelectDate(item.start<=today?today:item.start));
        list.appendChild(btn);
      }
    }
  }
  window.PINC_CALENDAR_POLISH={render};
})();
