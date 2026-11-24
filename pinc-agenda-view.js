/* Melhoria incremental da Agenda PINC. Mantém as funções originais de edição e sincronização. */
(() => {
  'use strict';
  let query = '';
  const get = id => document.getElementById(id);
  function create(tag, className, parent) {
    const node = document.createElement(tag);
    node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  }
  function setup() {
    const view = get('agenda');
    if (!view || get('pincAgendaToolbar')) return;
    const head = view.querySelector('.page-head');
    const table = view.querySelector('.agenda-table');
    const list = get('agendaList');
    if (!head || !table || !list) return;

    const context = create('div', 'pinc-agenda-context', view);
    context.id = 'pincAgendaContext';
    head.after(context);

    const toolbar = create('div', 'pinc-agenda-toolbar', view);
    toolbar.id = 'pincAgendaToolbar';
    context.after(toolbar);
    const selectors = create('div', 'pinc-agenda-selectors', toolbar);
    [['audienceSeg', 'Público'], ['daySeg', 'Dia da integração'], ['shiftSeg', 'Turno']].forEach(([id, title]) => {
      const section = create('div', 'pinc-agenda-control', selectors);
      section.dataset.section = id;
      const label = create('label', '', section);
      label.textContent = title;
      const segment = get(id);
      if (segment) section.appendChild(segment);
    });
    const search = create('div', 'pinc-agenda-search', toolbar);
    const label = create('label', '', search);
    label.htmlFor = 'pincAgendaSearch';
    label.textContent = 'Encontrar etapa';
    const field = create('div', 'pinc-agenda-search-field', search);
    field.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>';
    const input = create('input', '', field);
    input.id = 'pincAgendaSearch';
    input.type = 'search';
    input.autocomplete = 'off';
    input.placeholder = 'Buscar pelo nome ou responsável';
    input.addEventListener('input', () => { query = input.value.trim().toLocaleLowerCase('pt-BR'); filter(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape' && input.value) { input.value = ''; query = ''; filter(); }
    });

    const stats = create('div', 'pinc-agenda-stats', view);
    stats.id = 'pincAgendaStats';
    toolbar.after(stats);
    [['Etapas programadas', 'pincAgendaCount', 'na agenda selecionada'],
     ['Primeiro horário', 'pincAgendaStart', 'início previsto'],
     ['Último horário', 'pincAgendaEnd', 'término previsto'],
     ['Tempo total', 'pincAgendaDuration', 'soma das durações']].forEach(([title, id, description]) => {
      const item = create('div', 'pinc-agenda-stat', stats);
      const name = create('span', '', item);
      name.textContent = title;
      const number = create('strong', '', item);
      number.id = id;
      number.textContent = '—';
      const foot = create('small', '', item);
      foot.textContent = description;
    });

    const columns = create('div', 'pinc-agenda-columns', table);
    columns.setAttribute('aria-hidden', 'true');
    ['#', 'Etapa e responsável', 'Horário', 'Duração', 'Ações'].forEach(name => {
      const label = create('span', '', columns);
      label.textContent = name;
    });
    table.insertBefore(columns, list);

    const empty = create('div', 'pinc-agenda-no-results', table);
    empty.id = 'pincAgendaNoResults';
    empty.innerHTML = '<strong>Nenhuma etapa encontrada</strong>Tente outra palavra para localizar a etapa.';
    empty.hidden = true;
    const footer = create('div', 'pinc-agenda-footer', table);
    footer.id = 'pincAgendaFooter';
    footer.innerHTML = '<span id="pincAgendaVisibleCount"></span><span>Os horários são previstos e podem ser ajustados.</span>';
  }
  function formatDuration(value) {
    const minutes = Math.max(0, Math.round(value));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (!hours) return minutes + ' min';
    return hours + 'h' + (rest ? ' ' + String(rest).padStart(2, '0') + 'min' : '');
  }
  function endClock(stage) {
    if (stage?.[5] && /^\d{1,2}:\d{2}$/.test(stage[5])) return stage[5];
    const time = String(stage?.[2] || '');
    if (!/^\d{1,2}:\d{2}$/.test(time)) return '—';
    const [hour, minute] = time.split(':').map(Number);
    const total = (hour * 60 + minute + (Number(stage[3]) || 0)) % 1440;
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }
  function filter() {
    const rows = Array.from(document.querySelectorAll('#agendaList > .agenda-row'));
    let visible = 0;
    rows.forEach(row => {
      const title = (row.querySelector('.stage-name')?.textContent || '').toLocaleLowerCase('pt-BR');
      const match = !query || title.includes(query);
      row.hidden = !match;
      if (match) visible++;
    });
    const empty = get('pincAgendaNoResults');
    if (empty) empty.hidden = !rows.length || visible !== 0;
    const count = get('pincAgendaVisibleCount');
    if (count) count.textContent = query ? 'Exibindo ' + visible + ' de ' + rows.length + ' etapas' : rows.length + (rows.length === 1 ? ' etapa na agenda' : ' etapas na agenda');
  }
  function refresh(context) {
    setup();
    if (!get('pincAgendaToolbar')) return;
    const stages = Array.isArray(context?.rows) ? context.rows : [];
    const audience = context?.audience === 'aprendizes' ? 'Aprendizes' : context?.audience === 'estagiarios' ? 'Estagiários' : 'Efetivos';
    const period = context?.period;
    const where = [context?.location, audience, period].filter(Boolean).join('  •  ');
    const contextEl = get('pincAgendaContext');
    if (contextEl) contextEl.textContent = where;
    ['audienceSeg', 'daySeg', 'shiftSeg'].forEach(id => {
      const el = get(id);
      const section = document.querySelector('#agenda .pinc-agenda-control[data-section="' + id + '"]');
      if (section) section.hidden = !el || el.style.display === 'none';
    });
    const total = stages.reduce((sum, stage) => sum + Math.max(0, Number(stage?.[3]) || 0), 0);
    const values = {
      pincAgendaCount: String(stages.length),
      pincAgendaStart: stages.length ? stages[0][2] || '—' : '—',
      pincAgendaEnd: stages.length ? endClock(stages[stages.length - 1]) : '—',
      pincAgendaDuration: stages.length ? formatDuration(total) : '—'
    };
    Object.entries(values).forEach(([id, value]) => { const node = get(id); if (node) node.textContent = value; });
    const nodes = document.querySelectorAll('#agendaList > .agenda-row');
    nodes.forEach((row, index) => {
      const stage = stages[index] || [];
      const title = String(stage[0] || '');
      const isBreak = /pausa|intervalo|almo[cç]o|coffee.break/i.test(title);
      row.classList.toggle('pinc-agenda-break', isBreak);
      const meta = row.querySelector('.stage-name');
      if (meta && !meta.querySelector('.pinc-stage-status')) {
        const actual = typeof context.actualTimes === 'function' ? context.actualTimes(stage, index) : {};
        const status = create('span', 'pinc-stage-status' + (actual.end ? ' done' : actual.start ? ' started' : ''), meta);
        status.textContent = actual.end ? 'Concluída' : actual.start ? 'Em andamento' : 'Planejada';
      }
      const time = row.querySelector('.cell');
      const help = time?.querySelector('span');
      if (help && endClock(stage) !== '—') help.textContent = 'até ' + endClock(stage) + ' • previsto';
      const actions = row.querySelectorAll('.row-actions button');
      const labels = ['Editar etapa ' + title, 'Registrar horário realizado de ' + title, 'Excluir etapa ' + title];
      actions.forEach((button, j) => { button.setAttribute('aria-label', labels[j] || 'Ação da etapa'); });
    });
    filter();
  }
  window.PINC_AGENDA_VIEW = { refresh };
})();
