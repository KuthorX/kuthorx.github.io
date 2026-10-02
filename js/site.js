(function () {
  var STORAGE_PREFIX = 'kuthorx-blog:article-state:';
  var LEGACY_CLOAK_PREFIX = STORAGE_PREFIX + '/posts/story_of_cloak/';
  var CURRENT_CLOAK_PREFIX = STORAGE_PREFIX + '/story_of_cloak/';

  function migrateLegacyState() {
    var legacyKeys = [];
    try {
      for (var index = 0; index < window.localStorage.length; index += 1) {
        var key = window.localStorage.key(index);
        if (key && key.indexOf(LEGACY_CLOAK_PREFIX) === 0) legacyKeys.push(key);
      }
    } catch (error) {
      return;
    }

    legacyKeys.forEach(function (legacyKey) {
      var currentKey = CURRENT_CLOAK_PREFIX + legacyKey.slice(LEGACY_CLOAK_PREFIX.length);
      try {
        var currentValue = window.localStorage.getItem(currentKey);
        if (currentValue === null) {
          var legacyValue = window.localStorage.getItem(legacyKey);
          if (legacyValue === null) return;
          window.localStorage.setItem(currentKey, legacyValue);
          if (window.localStorage.getItem(currentKey) !== legacyValue) return;
        }
        window.localStorage.removeItem(legacyKey);
      } catch (error) {
        // Keep legacy progress when storage migration cannot complete.
      }
    });
  }

  migrateLegacyState();

  // One {value, save, reset} object per storage key, so every module on a page (click fixes,
  // answer forms, ...) reads and writes the same state and never overwrites another's keys.
  var cache = {};

  function readSaved(storageKey) {
    var state = {};
    try {
      var saved = JSON.parse(window.localStorage.getItem(storageKey));
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        Object.keys(saved).forEach(function (name) {
          state[name] = saved[name];
        });
      }
    } catch (error) {
      // localStorage may be unavailable or contain invalid JSON; use defaults.
    }
    return state;
  }

  function createState(storageKey) {
    var state = readSaved(storageKey);
    return {
      value: state,
      save: function () {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(state));
        } catch (error) {
          // Ignore storage failures so article interactions still work.
        }
      },
      reset: function () {
        try {
          window.localStorage.removeItem(storageKey);
        } catch (error) {
          // Ignore storage failures so article interactions still work.
        }
      }
    };
  }

  window.kuthorxArticleState = function (article, defaults) {
    var articleKey = article && article.getAttribute('data-article-key') || window.location.pathname;
    var storageKey = STORAGE_PREFIX + articleKey;
    var entry = cache[storageKey] || (cache[storageKey] = createState(storageKey));
    // Defaults only fill names that are not saved yet; they never override saved progress.
    Object.keys(defaults || {}).forEach(function (name) {
      if (!Object.prototype.hasOwnProperty.call(entry.value, name)) entry.value[name] = defaults[name];
    });
    return entry;
  };
})();

(function () {
  var buttons = document.querySelectorAll('[data-article-reset]');

  Array.prototype.forEach.call(buttons, function (button) {
    button.addEventListener('click', function () {
      window.kuthorxArticleState(button.closest('article')).reset();
      window.location.reload();
    });
  });
})();

(function () {
  var navToggle = document.getElementById('nav-toggle');
  var navLinks = document.getElementById('nav-links');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      var isOpen = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }
})();

(function () {
  // Articles with an image cycle or `custom_variables: true` get :show-if conditions and
  // click_switch_* / click_self toggles (e.g. the low_freq_shake typo fixes).
  var articles = document.querySelectorAll('[data-image-cycle], [data-custom-variables]');
  var FADE_DURATION = 240;
  var IMAGE_ALT = '牛肉芝士卷';
  // Answer-form state (site.js answer module) is rendered by that module, never here.
  var ANSWER_STATE_NAME = /_(wrong_answer|correct_answer|wrong_count|user)$/;

  function parseCondition(value) {
    var condition = (value || '').trim();
    var negated = condition.charAt(0) === '!';
    var name = (negated ? condition.slice(1) : condition).trim();
    return { name: name, negated: negated };
  }

  function isToggleCondition(name) {
    return name === 'click_self' || name.indexOf('click_switch_') === 0;
  }

  function matchesCondition(ctx, condition) {
    if (!condition.name) return true;
    var value = Boolean(ctx.state[condition.name]);
    return condition.negated ? !value : value;
  }

  function collectConditionElements(article, state) {
    return Array.prototype.filter.call(article.querySelectorAll('*'), function (element) {
      if (!element.hasAttribute(':show-if')) return false;
      var condition = parseCondition(element.getAttribute(':show-if'));
      if (ANSWER_STATE_NAME.test(condition.name)) return false;
      if (condition.name && !Object.prototype.hasOwnProperty.call(state, condition.name)) {
        state[condition.name] = false;
      }
      element.classList.add('article-condition');
      return true;
    });
  }

  function updateAllShookNotShake(ctx) {
    ctx.state.all_shook_not_shake = ctx.shakeElements.length > 0 && ctx.shakeElements.every(function (element) {
      return !matchesCondition(ctx, parseCondition(element.getAttribute(':show-if')));
    });
  }

  function updateBackgroundImage(ctx) {
    if (!ctx.backgroundShowIf) return;

    var shouldShow = matchesCondition(ctx, parseCondition(ctx.backgroundShowIf));
    ctx.article.classList.toggle('is-background-visible', shouldShow);
    ctx.article.style.backgroundImage = shouldShow ? 'var(--article-background-image)' : 'none';
  }

  function fadeBlock(block, shouldShow, transitionToken) {
    if (shouldShow) {
      block.hidden = false;
      block.classList.add('is-condition-hidden');
      window.requestAnimationFrame(function () {
        if (block._conditionTransitionToken === transitionToken && !block.hidden) {
          block.classList.remove('is-condition-hidden');
        }
      });
    } else if (!block.hidden) {
      block.classList.add('is-condition-hidden');
      block._conditionTimer = window.setTimeout(function () {
        if (block._conditionTransitionToken === transitionToken) {
          block.hidden = true;
          block.classList.remove('is-condition-hidden');
          block._conditionTimer = null;
        }
      }, FADE_DURATION);
    } else {
      block.classList.remove('is-condition-hidden');
    }
  }

  function renderBlock(ctx, block, animate) {
    var condition = parseCondition(block.getAttribute(':show-if'));
    var shouldShow = matchesCondition(ctx, condition);
    var transitionToken = (block._conditionTransitionToken || 0) + 1;
    block._conditionTransitionToken = transitionToken;
    block.setAttribute('aria-hidden', String(!shouldShow));

    if (isToggleCondition(condition.name)) {
      block.setAttribute('aria-pressed', String(Boolean(ctx.state[condition.name])));
    }

    if (block._conditionTimer) {
      window.clearTimeout(block._conditionTimer);
      block._conditionTimer = null;
    }

    if (!animate) {
      block.hidden = !shouldShow;
      block.classList.remove('is-condition-hidden');
      return;
    }
    fadeBlock(block, shouldShow, transitionToken);
  }

  // Only background articles style the 240 ms fade (article.css); elsewhere a delayed hide would
  // just leave both versions visible, so blocks switch immediately.
  function setConditionBlocks(ctx, animate) {
    var fade = animate && ctx.article.classList.contains('article-with-background');
    updateAllShookNotShake(ctx);
    updateBackgroundImage(ctx);
    ctx.conditionElements.forEach(function (block) {
      renderBlock(ctx, block, fade);
    });
    ctx.save();
  }

  // The shown block that uses the same toggle as `block` (e.g. "!click_switch_x" -> "click_switch_x").
  function toggleCounterpart(ctx, block, name) {
    return ctx.conditionElements.filter(function (element) {
      return element !== block && !element.hidden &&
        parseCondition(element.getAttribute(':show-if')).name === name;
    })[0] || null;
  }

  function toggleCondition(ctx, name, block) {
    if (!isToggleCondition(name)) return;
    var hadFocus = Boolean(block) && document.activeElement === block;
    ctx.state[name] = !Boolean(ctx.state[name]);
    setConditionBlocks(ctx, true);
    var counterpart = hadFocus ? toggleCounterpart(ctx, block, name) : null;
    if (counterpart) counterpart.focus();
  }

  function bindToggle(ctx, block) {
    var condition = parseCondition(block.getAttribute(':show-if'));
    if (!isToggleCondition(condition.name)) return;

    block.classList.add('article-condition-clickable');
    if (!block.hasAttribute('tabindex')) block.setAttribute('tabindex', '0');
    if (!block.hasAttribute('role')) block.setAttribute('role', 'button');
    block.addEventListener('click', function () {
      toggleCondition(ctx, condition.name, block);
    });
    block.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleCondition(ctx, condition.name, block);
      }
    });
  }

  function imageLabel(index, total) {
    return index === total - 1
      ? '已展示最后一张图片（' + total + '/' + total + '）'
      : '点击切换图片（' + (index + 1) + '/' + total + '）';
  }

  // Applies the image state for `index`; the final image also sets after_eating.
  function applyImageIndex(ctx, image, index, animate) {
    var total = ctx.sources.length;
    ctx.state.image_index = index;
    image.setAttribute('aria-label', imageLabel(index, total));
    if (index === total - 1) {
      ctx.state.after_eating = true;
      image.setAttribute('aria-disabled', 'true');
      image.classList.add('is-final');
      setConditionBlocks(ctx, animate);
    } else {
      image.removeAttribute('aria-disabled');
      image.classList.remove('is-final');
      ctx.save();
    }
  }

  function savedImageIndex(ctx, fallback) {
    var index = fallback;
    var savedIndex = Number(ctx.state.image_index);
    if (Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < ctx.sources.length) {
      index = savedIndex;
    }
    return ctx.state.after_eating ? ctx.sources.length - 1 : index;
  }

  function switchImage(ctx, image, switcher) {
    var nextIndex = switcher.index + 1;
    var revealed = false;
    image.classList.add('is-switching');

    function revealNextImage() {
      if (revealed) return;
      revealed = true;
      switcher.index = nextIndex;
      image.alt = IMAGE_ALT;
      applyImageIndex(ctx, image, nextIndex, true);
      window.requestAnimationFrame(function () {
        image.classList.remove('is-switching');
        switcher.busy = false;
      });
    }

    window.setTimeout(function () {
      image.onload = revealNextImage;
      image.onerror = revealNextImage;
      image.src = ctx.sources[nextIndex];
      if (image.complete) revealNextImage();
    }, FADE_DURATION);
  }

  function showNextImage(ctx, image, switcher) {
    if (switcher.busy) return;
    var last = ctx.sources.length - 1;

    if (switcher.index >= last) {
      if (ctx.state.after_eating) return;
      applyImageIndex(ctx, image, last, true);
      return;
    }
    switcher.busy = true;
    switchImage(ctx, image, switcher);
  }

  function initImageSwitcher(ctx, image) {
    var imagePath = new URL(image.getAttribute('src'), window.location.href).pathname;
    var initialIndex = ctx.sources.indexOf(imagePath);
    if (initialIndex < 0) return;

    var switcher = { index: savedImageIndex(ctx, initialIndex), busy: false };
    if (switcher.index !== initialIndex) {
      image.src = ctx.sources[switcher.index];
      image.alt = IMAGE_ALT;
    }

    image.classList.add('article-image-switcher');
    image.setAttribute('tabindex', '0');
    image.setAttribute('role', 'button');
    applyImageIndex(ctx, image, switcher.index, false);

    image.addEventListener('click', function () { showNextImage(ctx, image, switcher); });
    image.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showNextImage(ctx, image, switcher);
      }
    });
  }

  function initArticle(article) {
    var sources = (article.getAttribute('data-image-cycle') || '')
      .split('|')
      .filter(function (source) { return source; });
    var hasImageCycle = sources.length >= 2;

    if (!hasImageCycle && !article.hasAttribute('data-custom-variables')) return;

    sources.forEach(function (source) {
      var preload = new Image();
      preload.src = source;
    });

    // Conditions are deliberately scoped to this article. A different article
    // gets a fresh state object, so variables never leak between posts.
    var articleState = window.kuthorxArticleState(article, {
      after_eating: false,
      click_self: false,
      all_shook_not_shake: false,
      image_index: 0
    });
    var ctx = {
      article: article,
      sources: sources,
      state: articleState.value,
      save: articleState.save,
      backgroundShowIf: (article.getAttribute('data-background-show-if') || '').trim(),
      shakeElements: Array.prototype.filter.call(article.querySelectorAll('.low_freq_shake'), function (element) {
        return element.hasAttribute(':show-if');
      }),
      conditionElements: collectConditionElements(article, articleState.value)
    };

    ctx.conditionElements.forEach(function (block) { bindToggle(ctx, block); });
    setConditionBlocks(ctx, false);
    if (!hasImageCycle) return;

    Array.prototype.forEach.call(article.querySelectorAll('.article-content img'), function (image) {
      initImageSwitcher(ctx, image);
    });
  }

  Array.prototype.forEach.call(articles, initArticle);
})();

(function () {
  // BEGIN normalizeAnswer (extracted verbatim by docs/story_of_cloak/tools/normalize_test.mjs)
  // Canonical answer normalization. MUST stay identical to normalize() in
  // docs/story_of_cloak/tools/hash_answers.py:
  //   1. Unicode NFKC (folds full-width letters/digits/punctuation, e.g. "４８．１９％" -> "48.19%").
  //   2. Lowercase (full Unicode default case mapping, no locale).
  //   3. Walk code points; keep a code point if its general category is Letter (L*), Mark (M*) or
  //      Number (N*), or if it is "." or ":". Everything else (whitespace, punctuation, symbols,
  //      controls, e.g. U+00B7, U+30FB, U+2027, U+2022, "，", "。", "%", "-") is dropped.
  //   4. In that result, drop each "." / ":" unless BOTH neighbours are ASCII digits 0-9
  //      ("2:43" stays "2:43", "48.19%" -> "48.19", "7461-K" -> "7461k", "a.b" -> "ab").
  var KEEP_CHAR = (function () {
    try {
      return new RegExp('^[\\p{L}\\p{M}\\p{N}.:]$', 'u');
    } catch (error) {
      return null; // No Unicode property escapes: answers cannot be checked in this browser.
    }
  })();

  function isAsciiDigit(character) {
    return typeof character === 'string' && character.length === 1 && character >= '0' && character <= '9';
  }

  function normalizeAnswer(value) {
    var text = String(value === null || value === undefined ? '' : value).normalize('NFKC').toLowerCase();
    var kept = Array.from(text).filter(function (character) { return KEEP_CHAR.test(character); });
    return kept.filter(function (character, index) {
      if (character !== '.' && character !== ':') return true;
      return isAsciiDigit(kept[index - 1]) && isAsciiDigit(kept[index + 1]);
    }).join('');
  }
  // END normalizeAnswer

  var NO_CRYPTO = '当前页面无法校验答案，请通过 HTTPS 访问';
  var NO_UNICODE_REGEX = '当前浏览器版本过旧，无法校验答案，请更新浏览器';
  var DEFAULT_UNLOCKS = [3, 5, 7];
  var UNLOCK_STEP = 2;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var forms = document.querySelectorAll('form[data-answer-key]');
  if (!forms.length) return;

  // Returns why answers cannot be checked here, or '' when they can.
  function unverifiableReason() {
    if (!KEEP_CHAR || typeof String.prototype.normalize !== 'function' || !Array.from) return NO_UNICODE_REGEX;
    if (!(window.crypto && window.crypto.subtle && window.TextEncoder)) return NO_CRYPTO;
    return '';
  }

  function sha256Hex(text) {
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buffer) {
      return Array.prototype.map.call(new Uint8Array(buffer), function (byte) {
        return (byte < 16 ? '0' : '') + byte.toString(16);
      }).join('');
    });
  }

  // `<script id="cloak-answers">` holds only SHA-256 hashes for the answer keys on this page.
  function readAnswerHashes() {
    var element = document.getElementById('cloak-answers');
    var hashes = {};
    try {
      var parsed = element ? JSON.parse(element.textContent) : {};
      Object.keys(parsed || {}).forEach(function (key) {
        if (!Array.isArray(parsed[key])) return;
        hashes[key] = parsed[key].filter(function (hash) {
          return typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash);
        });
      });
    } catch (error) {
      // Malformed hash data: every answer is treated as wrong rather than breaking the page.
    }
    return hashes;
  }

  // "3,5,7" -> thresholds for `count` hints; missing ones keep adding UNLOCK_STEP.
  function unlockThresholds(value, count) {
    var numbers = String(value || '').split(',').map(function (part) {
      return parseInt(part, 10);
    }).filter(function (number) {
      return Number.isFinite(number) && number >= 0;
    });
    if (!numbers.length) numbers = DEFAULT_UNLOCKS.slice();
    while (numbers.length < count) numbers.push(numbers[numbers.length - 1] + UNLOCK_STEP);
    return numbers.slice(0, count);
  }

  function createHintEntry(hint, threshold) {
    var summary = hint.querySelector('summary');
    if (!summary) return null;
    var lock = document.createElement('span');
    lock.className = 'cloak-hint__lock';
    summary.appendChild(lock);
    var entry = { hint: hint, summary: summary, lock: lock, threshold: threshold, locked: false };

    summary.addEventListener('click', function (event) {
      if (entry.locked) event.preventDefault();
    });
    hint.addEventListener('toggle', function () {
      if (entry.locked && hint.open) hint.open = false;
    });
    return entry;
  }

  // Collects `.cloak-hints[data-for=key]` groups: each hint unlocks after N wrong answers.
  function collectHints(content, key) {
    var hints = [];
    Array.prototype.forEach.call(content.querySelectorAll('.cloak-hints'), function (group) {
      if ((group.getAttribute('data-for') || '').trim() !== key) return;
      var details = Array.prototype.filter.call(group.children, function (child) {
        return child.matches('details.cloak-hint');
      });
      var thresholds = unlockThresholds(group.getAttribute('data-unlock'), details.length);
      details.forEach(function (hint, index) {
        var entry = createHintEntry(hint, thresholds[index]);
        if (entry) hints.push(entry);
      });
    });
    return hints;
  }

  function renderHintLock(entry, wrongCount) {
    entry.hint.toggleAttribute('data-locked', entry.locked);
    if (entry.locked) {
      entry.hint.open = false;
      entry.summary.setAttribute('aria-disabled', 'true');
      entry.lock.textContent = '答错 ' + entry.threshold + ' 次后解锁（还差 ' + (entry.threshold - wrongCount) + ' 次）';
    } else {
      entry.summary.removeAttribute('aria-disabled');
      entry.lock.textContent = '';
    }
  }

  function revealHints(entries) {
    entries.forEach(function (entry) { entry.hint.open = true; });
    var first = entries[0];
    if (!first || reduceMotion) return;
    var rect = first.hint.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      first.hint.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // A wrong answer opens hints it just unlocked; a correct answer unlocks the rest silently.
  function renderHints(hints, wrongCount, solved, fromSubmit) {
    var unlockedNow = [];
    hints.forEach(function (entry) {
      var locked = !solved && wrongCount < entry.threshold;
      if (entry.locked && !locked && fromSubmit && !solved) unlockedNow.push(entry);
      entry.locked = locked;
      renderHintLock(entry, wrongCount);
    });
    revealHints(unlockedNow);
    return unlockedNow.length > 0;
  }

  function answerDefaults(key) {
    var defaults = {};
    defaults[key + '_user'] = '';
    defaults[key + '_wrong_answer'] = false;
    defaults[key + '_correct_answer'] = false;
    defaults[key + '_wrong_count'] = 0;
    return defaults;
  }

  // Status line inside the form ("已答错 N 次"); it is the only live region of the puzzle.
  function createAttemptsLine(form) {
    var attempts = document.createElement('p');
    attempts.className = 'answer-attempts';
    attempts.setAttribute('aria-live', 'polite');
    form.appendChild(attempts);
    return attempts;
  }

  function conditionBlocks(content, names) {
    return Array.prototype.filter.call(content.querySelectorAll('[\\:show-if]'), function (element) {
      var name = (element.getAttribute(':show-if') || '').trim();
      return name === names.wrong || name === names.correct;
    });
  }

  function createFormContext(form, hashes) {
    var key = form.getAttribute('data-answer-key');
    var input = form.querySelector('input[type="text"]');
    if (!key || !input) return null;

    var content = form.closest('.article-content') || document;
    var store = window.kuthorxArticleState(form.closest('article'), answerDefaults(key));
    var names = {
      user: key + '_user',
      wrong: key + '_wrong_answer',
      correct: key + '_correct_answer',
      count: key + '_wrong_count'
    };
    var hints = collectHints(content, key);
    return {
      key: key,
      form: form,
      input: input,
      button: form.querySelector('button[type="submit"], button:not([type])'),
      hashes: hashes[key] || [],
      store: store,
      state: store.value,
      names: names,
      attempts: createAttemptsLine(form),
      blocks: conditionBlocks(content, names),
      renderHints: function (wrongCount, solved, fromSubmit) {
        return renderHints(hints, wrongCount, solved, fromSubmit);
      },
      pending: false
    };
  }

  function wrongCount(ctx) {
    var count = Number(ctx.state[ctx.names.count]);
    return Number.isInteger(count) && count > 0 ? count : 0;
  }

  function isSolved(ctx) {
    return Boolean(ctx.state[ctx.names.correct]);
  }

  // kind: 'solved' | 'wrong' | 'notice'. Without a message, shows the saved progress.
  function renderAttempts(ctx, message, kind) {
    var text = message || '';
    var state = kind || 'notice';
    if (!text && isSolved(ctx)) {
      text = '已解开';
      state = 'solved';
    } else if (!text && wrongCount(ctx) > 0) {
      text = '已答错 ' + wrongCount(ctx) + ' 次';
      state = 'wrong';
    }
    ctx.attempts.textContent = text;
    // Visually hidden (not display:none) when empty, so the live region stays in the a11y tree.
    ctx.attempts.classList.toggle('visually-hidden', !text);
    ctx.attempts.setAttribute('data-state', state);
  }

  function renderConditions(ctx) {
    ctx.blocks.forEach(function (block) {
      var shouldShow = Boolean(ctx.state[(block.getAttribute(':show-if') || '').trim()]);
      block.classList.add('article-condition');
      block.setAttribute('aria-hidden', String(!shouldShow));
      block.hidden = !shouldShow;
    });
    if (ctx.state[ctx.names.wrong]) {
      ctx.input.setAttribute('aria-invalid', 'true');
    } else {
      ctx.input.removeAttribute('aria-invalid');
    }
  }

  // A solved puzzle stays solved: its answer can no longer be edited or re-submitted.
  function renderSolved(ctx) {
    var solved = isSolved(ctx);
    ctx.input.readOnly = solved;
    if (ctx.button) ctx.button.disabled = solved || ctx.pending;
  }

  // While an answer is being hashed the input is locked, so the checked value is the saved one.
  function setPending(ctx, pending) {
    ctx.pending = pending;
    ctx.form.setAttribute('aria-busy', String(pending));
    renderSolved(ctx);
    if (pending) ctx.input.readOnly = true;
  }

  function applyResult(ctx, isCorrect) {
    var state = ctx.state;
    state[ctx.names.wrong] = !isCorrect;
    state[ctx.names.correct] = isCorrect;
    if (!isCorrect) state[ctx.names.count] = wrongCount(ctx) + 1;
    renderConditions(ctx);
    var unlocked = ctx.renderHints(wrongCount(ctx), isCorrect, true);
    renderSolved(ctx);
    if (isCorrect) {
      renderAttempts(ctx, '已解开，故事继续。', 'solved');
    } else {
      renderAttempts(ctx, '答案不对。已答错 ' + wrongCount(ctx) + ' 次' + (unlocked ? ' · 新提示已解锁' : ''), 'wrong');
    }
    ctx.store.save();
  }

  function checkAnswer(ctx, event) {
    if (event) event.preventDefault();
    if (ctx.pending || isSolved(ctx)) return;

    var submitted = ctx.input.value;
    ctx.state[ctx.names.user] = submitted;
    var reason = unverifiableReason();
    if (reason) {
      renderAttempts(ctx, reason, 'notice');
      ctx.store.save();
      return;
    }
    var given = normalizeAnswer(submitted);
    if (!given) {
      ctx.state[ctx.names.wrong] = false;
      renderConditions(ctx);
      renderAttempts(ctx, '请先输入答案', 'notice');
      ctx.store.save();
      return;
    }

    setPending(ctx, true);
    sha256Hex(ctx.key + ':' + given).then(function (hash) {
      setPending(ctx, false);
      ctx.state[ctx.names.user] = submitted;
      applyResult(ctx, ctx.hashes.indexOf(hash) !== -1);
    }, function () {
      setPending(ctx, false);
      renderAttempts(ctx, NO_CRYPTO, 'notice');
    });
  }

  function handleInput(ctx) {
    if (isSolved(ctx)) return;
    ctx.state[ctx.names.user] = ctx.input.value;
    if (ctx.state[ctx.names.wrong]) {
      ctx.state[ctx.names.wrong] = false;
      renderConditions(ctx);
      renderAttempts(ctx);
    }
    ctx.store.save();
  }

  function initForm(form, hashes) {
    var ctx = createFormContext(form, hashes);
    if (!ctx) return;

    ctx.input.value = String(ctx.state[ctx.names.user] || '');
    ctx.input.addEventListener('input', function () { handleInput(ctx); });
    if (ctx.button) {
      ctx.button.addEventListener('click', function (event) { checkAnswer(ctx, event); });
    }
    form.addEventListener('submit', function (event) { checkAnswer(ctx, event); });

    renderConditions(ctx);
    ctx.renderHints(wrongCount(ctx), isSolved(ctx), false);
    renderSolved(ctx);
    renderAttempts(ctx);
    ctx.store.save();
  }

  var hashes = readAnswerHashes();
  Array.prototype.forEach.call(forms, function (form) { initForm(form, hashes); });
})();

(function () {
  var articles = document.querySelectorAll('.article-with-background');
  if (!articles.length) return;

  var framePending = false;

  function updateBackgroundPosition() {
    var scrollY = window.pageYOffset;
    var viewportHeight = window.innerHeight;

    Array.prototype.forEach.call(articles, function (article) {
      var articleTop = article.getBoundingClientRect().top + scrollY;
      var articleScrollRange = Math.max(1, article.offsetHeight - viewportHeight);
      var progress = (scrollY - articleTop) / articleScrollRange;
      progress = Math.max(0, Math.min(1, progress));

      article.style.setProperty('--article-background-position', (progress * 100).toFixed(2) + '%');
    });

    framePending = false;
  }

  function requestBackgroundUpdate() {
    if (framePending) return;

    framePending = true;
    window.requestAnimationFrame(updateBackgroundPosition);
  }

  window.addEventListener('scroll', requestBackgroundUpdate, { passive: true });
  window.addEventListener('resize', requestBackgroundUpdate);
  window.addEventListener('load', requestBackgroundUpdate);
  updateBackgroundPosition();
})();
