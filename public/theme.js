(function () {
  var key = 'cailin-theme';
  var stored = null;
  try {
    stored = window.localStorage.getItem(key);
  } catch (error) {
    stored = null;
  }
  var theme = stored === 'dark' || stored === 'light' ? stored : null;
  if (!theme) {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
  var meta = document.getElementById('themeColor');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#111511' : '#f2eee5');
})();
