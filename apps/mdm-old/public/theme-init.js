// Parser-blocking native theme initialization keeps the first paint aligned
// with the persisted or operating-system preference without inline script.
;(function () {
  var stored = localStorage.getItem('rss-theme')
  var theme =
    stored === 'light' || stored === 'dark'
      ? stored
      : typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  document.documentElement.dataset.theme = theme
})()
