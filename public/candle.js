// Veladora arrastrable: actualiza variables CSS --lx / --ly
(function(){
  const root = document.documentElement;

  let dragging = false;
  let offsetX = 0, offsetY = 0;

  const candle = document.querySelector('.candle');
  const darkness = document.querySelector('.darkness');

  if(!candle || !darkness) return;

  // util para fijar posición respetando márgenes
  function setPos(x, y){
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // límites con pequeño padding
    const pad = 12;
    x = Math.max(pad, Math.min(vw - pad, x));
    y = Math.max(pad, Math.min(vh - pad, y));

    root.style.setProperty('--lx', `${x}px`);
    root.style.setProperty('--ly', `${y}px`);

    // mover el div .candle sin relayout pesado
    candle.style.left = `calc(${x}px - 18px)`;
    candle.style.top  = `calc(${y}px - 44px)`;
  }

  // posición inicial
  const initX = parseFloat(getComputedStyle(root).getPropertyValue('--lx')) || window.innerWidth/2;
  const initY = parseFloat(getComputedStyle(root).getPropertyValue('--ly')) || window.innerHeight*0.6;
  setPos(initX, initY);

  function onPointerDown(e){
    dragging = true;
    candle.setPointerCapture?.(e.pointerId);
    offsetX = e.clientX;
    offsetY = e.clientY;
    e.preventDefault();
  }
  function onPointerMove(e){
    if(!dragging) return;
    setPos(e.clientX, e.clientY);
  }
  function onPointerUp(e){
    dragging = false;
    candle.releasePointerCapture?.(e.pointerId);
  }

  // soporte para mouse (esta idea me la dieron en kiwi)
  candle.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  // opcional: luz sigue al cursor si no estás arrastrando
  window.addEventListener('mousemove', (e)=>{
    if(dragging) return;
    // setPos(e.clientX, e.clientY);
  });

  // recalcular si cambia el viewport
  window.addEventListener('resize', ()=>{
    const rect = candle.getBoundingClientRect();
    setPos(rect.left + 18, rect.top + 44);
  });

  window.addEventListener('DOMContentLoaded', () => {
  const hint = document.getElementById('hint');
  if (!hint) return;
  hint.classList.add('show');
  setTimeout(() => hint.classList.remove('show'), 3000); // se oculta en 3s
});

})();
