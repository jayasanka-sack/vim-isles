// Modal Isles: boot. Loaded last, after every other script.

window.addEventListener('resize', () => { layoutWorld(); });
if (window.ResizeObserver) new ResizeObserver(() => layoutWorld()).observe($('#viewport'));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { islKey = ''; });

loadLevel(save.current || 0);
if (!save.seenIntro) openModal('intro');
syncVeil();
requestAnimationFrame(frame);
