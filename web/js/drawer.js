// Shared right-side drawer menu. Add data-menu-open / data-menu-close to triggers.
(function () {
  const open = () => document.body.classList.add('menu-open');
  const close = () => document.body.classList.remove('menu-open');
  document.addEventListener('click', e => {
    if (e.target.closest('[data-menu-open]')) open();
    else if (e.target.closest('[data-menu-close]')) close();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  window.RetoneMenu = { open, close };
})();
