'use strict';

(function () {
  var key = 'cailin-theme';
  var manual = readStored();
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var buttons = Array.from(document.querySelectorAll('[data-theme-toggle]'));

  function readStored() {
    try {
      var value = window.localStorage.getItem(key);
      return value === 'dark' || value === 'light' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function systemTheme() {
    return media && media.matches ? 'dark' : 'light';
  }

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function update() {
    var dark = current() === 'dark';
    for (var button of buttons) {
      button.textContent = dark ? '浅色' : '深色';
      button.setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式');
    }
    var meta = document.getElementById('themeColor');
    if (meta) meta.setAttribute('content', dark ? '#111511' : '#f2eee5');
  }

  function apply(theme, persist) {
    var next;
    if (theme === 'system') {
      if (persist) {
        manual = null;
        try {
          window.localStorage.removeItem(key);
        } catch (error) {
          // The page can still switch when storage is unavailable.
        }
      }
      next = systemTheme();
    } else {
      next = theme === 'dark' ? 'dark' : 'light';
      if (persist) {
        manual = next;
        try {
          window.localStorage.setItem(key, next);
        } catch (error) {
          // The page can still switch when storage is unavailable.
        }
      }
    }

    document.documentElement.setAttribute('data-theme', next);
    update();
  }

  for (var button of buttons) {
    button.addEventListener('click', function () {
      apply(current() === 'dark' ? 'light' : 'dark', true);
    });
  }

  if (media) {
    var onColorSchemeChange = function (event) {
      if (!manual) apply(event.matches ? 'dark' : 'light', false);
    };
    if (media.addEventListener) media.addEventListener('change', onColorSchemeChange);
    else if (media.addListener) media.addListener(onColorSchemeChange);
  }

  update();
  window.CailinTheme = { current: current, apply: apply, update: update };
})();
