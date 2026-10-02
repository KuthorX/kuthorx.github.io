// 苍绿之眼 progress: records chapter visits, reveals "继续" links, and paints hub case progress.
// Everything lives in this browser's localStorage; nothing is ever hard-locked.
(function () {
  var LAST_KEY = 'kuthorx-cloak:last';
  var VISITED_KEY = 'kuthorx-cloak:visited';
  var STATE_PREFIX = 'kuthorx-blog:article-state:';
  var LEGACY_CLOAK_PREFIX = '/posts/story_of_cloak/';
  var CURRENT_CLOAK_PREFIX = '/story_of_cloak/';
  var LABELS = {
    new: '未开始',
    reached: '已到达',
    solved: '已解开',
    locked: '未解锁'
  };

  function read(key, fallback) {
    try {
      var value = JSON.parse(window.localStorage.getItem(key));
      return value === null || value === undefined ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Storage may be unavailable (private mode); progress simply is not kept.
    }
  }

  function normalizePath(url) {
    try {
      var path = new URL(url, window.location.href).pathname.toLowerCase();
      if (path.indexOf(LEGACY_CLOAK_PREFIX) === 0) {
        path = CURRENT_CLOAK_PREFIX + path.slice(LEGACY_CLOAK_PREFIX.length);
      }
      return path.charAt(path.length - 1) === '/' ? path : path + '/';
    } catch (error) {
      return '';
    }
  }

  function visitedList() {
    var list = read(VISITED_KEY, []);
    return Array.isArray(list) ? list.filter(function (item) { return typeof item === 'string'; })
      .map(normalizePath).filter(Boolean) : [];
  }

  function recordChapter() {
    var article = document.querySelector('article[data-cloak-chapter]');
    if (!article) return;

    var url = normalizePath(article.getAttribute('data-article-key') || window.location.pathname);
    if (!url) return;

    write(LAST_KEY, { url: url, title: article.getAttribute('data-cloak-title') || document.title });
    var visited = visitedList();
    if (visited.indexOf(url) === -1) write(VISITED_KEY, visited.concat([url]));
  }

  // Only same-origin, root-relative paths ("/..."), never "//host", "/\\host" or "scheme:".
  function safeLocalPath(value) {
    if (typeof value !== 'string' || !/^\/(?![\/\\])/.test(value)) return '';
    try {
      var url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin) return '';
      var path = url.pathname;
      if (path.indexOf(LEGACY_CLOAK_PREFIX) === 0) {
        path = CURRENT_CLOAK_PREFIX + path.slice(LEGACY_CLOAK_PREFIX.length);
      }
      return path + url.search + url.hash;
    } catch (error) {
      return '';
    }
  }

  function showContinue() {
    var last = read(LAST_KEY, null);
    var safeUrl = last ? safeLocalPath(last.url) : '';
    var links = document.querySelectorAll('[data-cloak-continue]');

    Array.prototype.forEach.call(links, function (link) {
      if (!safeUrl) {
        link.hidden = true;
        return;
      }
      link.setAttribute('href', safeUrl);
      var title = link.querySelector('[data-cloak-continue-title]');
      if (title) title.textContent = typeof last.title === 'string' && last.title ? last.title : safeUrl;
      link.hidden = false;
    });
  }

  function stepState(step, visited) {
    var url = normalizePath(step.getAttribute('data-url') || '');
    var doneKey = step.getAttribute('data-done-key') || 'visit';
    var saved = read(STATE_PREFIX + url, null);
    var hasState = saved !== null && typeof saved === 'object' && !Array.isArray(saved);
    var reached = visited.indexOf(url) !== -1 || hasState;

    if (doneKey === 'visit') return { state: reached ? 'reached' : 'new', done: reached };
    if (hasState && saved[doneKey] === true) return { state: 'solved', done: true };
    return { state: reached ? 'reached' : 'new', done: false };
  }

  function paintCase(caseElement, visited) {
    var steps = Array.prototype.slice.call(caseElement.querySelectorAll('[data-cloak-step]'));
    var results = steps.map(function (step) { return stepState(step, visited); });
    var firstOpen = -1;
    var doneCount = 0;

    results.forEach(function (result, index) {
      if (result.done) doneCount += 1;
      else if (firstOpen === -1) firstOpen = index;
    });

    steps.forEach(function (step, index) {
      var result = results[index];
      var state = firstOpen !== -1 && index > firstOpen && !result.done ? 'locked' : result.state;
      var status = step.querySelector('[data-cloak-status]');
      step.setAttribute('data-state', state);
      step.classList.toggle('is-current', index === firstOpen);
      if (status) status.textContent = LABELS[state];
    });

    var progress = caseElement.querySelector('[data-cloak-progress]');
    var progressLabel = caseElement.querySelector('[data-cloak-progress-label]');
    if (progress) progress.textContent = doneCount + '/' + steps.length;
    if (progressLabel) progressLabel.textContent = '完成 ' + doneCount + '/' + steps.length;
    var complete = steps.length > 0 && doneCount === steps.length;
    caseElement.classList.toggle('is-complete', complete);
    return complete;
  }

  // `requires: all` cases wait (visually only; links stay real) until every other case is complete.
  function paintGates(gated, completed, total) {
    var waiting = completed < total;
    gated.forEach(function (caseElement) {
      caseElement.classList.toggle('is-waiting', waiting);
      var gate = caseElement.querySelector('[data-cloak-gate]');
      if (!gate) return;
      gate.hidden = !waiting;
      gate.textContent = '等所有人到齐（已完成 ' + completed + ' / ' + total + ' 个案卷）';
    });
  }

  function paintHub() {
    var cases = Array.prototype.slice.call(document.querySelectorAll('[data-cloak-case]'));
    if (!cases.length) return;
    var visited = visitedList();
    var gated = [];
    var completed = 0;
    var total = 0;
    cases.forEach(function (caseElement) {
      var complete = paintCase(caseElement, visited);
      if (caseElement.getAttribute('data-cloak-requires') === 'all') {
        gated.push(caseElement);
        return;
      }
      total += 1;
      if (complete) completed += 1;
    });
    paintGates(gated, completed, total);
  }

  function refresh() {
    showContinue();
    paintHub();
  }

  recordChapter();
  refresh();
  // Back/forward cache and other tabs can change progress without a reload.
  window.addEventListener('pageshow', refresh);
  window.addEventListener('storage', refresh);
})();
