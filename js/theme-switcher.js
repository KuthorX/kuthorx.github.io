(function () {
  var STORAGE_KEY = 'kuthorx-theme';
  var DEFAULT_THEME = 'theme-terminal';

  var toggle = document.getElementById('theme-toggle');
  var dropdown = document.getElementById('theme-dropdown');
  var icon = document.getElementById('theme-toggle-icon');
  var options = document.querySelectorAll('.theme-option');

  if (!toggle || !dropdown) return;

  var current = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;

  function applyTheme(theme) {
    document.documentElement.className = theme;
    localStorage.setItem(STORAGE_KEY, theme);

    options.forEach(function (opt) {
      var isActive = opt.dataset.theme === theme;
      opt.classList.toggle('active', isActive);
      opt.setAttribute('aria-selected', isActive);
      if (isActive && icon) {
        icon.innerHTML = opt.dataset.icon;
      }
    });
  }

  function toggleDropdown() {
    var isOpen = dropdown.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen);
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleDropdown();
  });

  options.forEach(function (opt) {
    opt.addEventListener('click', function (e) {
      e.stopPropagation();
      applyTheme(opt.dataset.theme);
      closeDropdown();
    });
  });

  document.addEventListener('click', function () {
    closeDropdown();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDropdown();
  });

  applyTheme(current);

  // Mobile nav toggle
  var navToggle = document.getElementById('nav-toggle');
  var navLinks = document.getElementById('nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
    });
  }
})();
