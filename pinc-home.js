(() => {
  'use strict';
  const home = document.getElementById('homeView');
  const copy = document.getElementById('home-copy');
  if (!home || !copy) return;
  const slides = [
    { kicker: 'Integração que conecta', heading: 'Tudo para o PINC', accent: 'em um só lugar', description: 'Gerencie, conduza e acompanhe cada etapa do programa de integração\nde forma simples, organizada e em tempo real.' },
    { kicker: 'Acompanhamento em tempo real', heading: 'Cada etapa.', accent: 'Sempre no ritmo certo.', description: 'Acompanhe horários, etapas, participantes e acolhimentos\nenquanto o PINC acontece.' },
    { kicker: 'Uma experiência conectada', heading: 'Gestão, Facilitadores e Stars', accent: 'falando a mesma língua.', description: 'Uma única plataforma conectando quem organiza,\nquem conduz e quem acompanha cada jornada do PINC.' }
  ];
  const dots = [...home.querySelectorAll('.slide-dot')];
  const backgrounds = [...home.querySelectorAll('.home-backdrop')];
  const pause = document.getElementById('home-pause');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0, paused = false, focused = false, hovered = false, interval, transition;
  function show(next) {
    clearTimeout(transition);
    index = next;
    copy.classList.add('is-changing');
    transition = setTimeout(() => {
      const slide = slides[index];
      for (const key of ['kicker', 'heading', 'accent', 'description']) {
        document.getElementById('home-' + key).textContent = slide[key];
      }
      backgrounds.forEach((background, i) => background.classList.toggle('is-active', i === index));
      dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        dot.setAttribute('aria-current', String(i === index));
      });
      copy.classList.remove('is-changing');
    }, reducedMotion.matches ? 0 : 180);
  }
  function restart() {
    clearInterval(interval);
    interval = setInterval(() => {
      if (paused || focused || hovered || document.hidden || home.style.display === 'none' || document.querySelector('#managementLogin.show, #portalCodeLogin.show, #managementSetup.show')) return;
      show((index + 1) % slides.length);
    }, 7000);
  }
  dots.forEach((dot, i) => dot.addEventListener('click', () => { show(i); restart(); }));
  pause.addEventListener('click', () => {
    paused = !paused;
    const label = paused ? 'Retomar troca automática' : 'Pausar troca automática';
    pause.setAttribute('aria-label', label);
    pause.title = label;
    pause.querySelector('span').textContent = paused ? '▶' : 'Ⅱ';
    restart();
  });
  const controls = home.querySelector('.home-slider-controls');
  controls.addEventListener('focusin', () => { focused = true; });
  controls.addEventListener('focusout', () => { focused = false; restart(); });
  controls.addEventListener('mouseenter', () => { hovered = true; });
  controls.addEventListener('mouseleave', () => { hovered = false; restart(); });
  document.addEventListener('visibilitychange', restart);
  restart();
})();
