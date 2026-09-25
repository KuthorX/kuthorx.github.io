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
  var articles = document.querySelectorAll('[data-image-cycle]');
  var FADE_DURATION = 240;

  Array.prototype.forEach.call(articles, function (article) {
    var sources = (article.getAttribute('data-image-cycle') || '')
      .split('|')
      .filter(function (source) { return source; });

    if (sources.length < 2) return;

    sources.forEach(function (source) {
      var preload = new Image();
      preload.src = source;
    });

    // Conditions are deliberately scoped to this article. A different article
    // gets a fresh state object, so variables never leak between posts.
    var state = {
      after_eating: false,
      click_self: false,
      all_shook_not_shake: false
    };
    var shakeElements = Array.prototype.filter.call(article.querySelectorAll('.low_freq_shake'), function (element) {
      return element.hasAttribute(':show-if');
    });
    var conditionElements = Array.prototype.filter.call(article.querySelectorAll('*'), function (element) {
      return element.hasAttribute(':show-if');
    });

    function parseCondition(value) {
      var condition = (value || '').trim();
      var negated = condition.charAt(0) === '!';
      var name = (negated ? condition.slice(1) : condition).trim();
      return { name: name, negated: negated };
    }

    conditionElements.forEach(function (block) {
      var condition = parseCondition(block.getAttribute(':show-if'));
      if (condition.name && !Object.prototype.hasOwnProperty.call(state, condition.name)) {
        state[condition.name] = false;
      }
      block.classList.add('article-condition');
    });

    function matchesCondition(condition) {
      if (!condition.name) return true;
      var value = Boolean(state[condition.name]);
      return condition.negated ? !value : value;
    }

    function updateAllShookNotShake() {
      state.all_shook_not_shake = shakeElements.length > 0 && shakeElements.every(function (element) {
        return !matchesCondition(parseCondition(element.getAttribute(':show-if')));
      });
    }

    function setConditionBlocks(animate) {
      updateAllShookNotShake();
      conditionElements.forEach(function (block) {
        var condition = parseCondition(block.getAttribute(':show-if'));
        var shouldShow = matchesCondition(condition);
        var transitionToken = (block._conditionTransitionToken || 0) + 1;
        block._conditionTransitionToken = transitionToken;
        block.setAttribute('aria-hidden', String(!shouldShow));

        if (isToggleCondition(condition.name)) {
          block.setAttribute('aria-pressed', String(Boolean(state[condition.name])));
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
      });
    }

    function isToggleCondition(name) {
      return name === 'click_self' || name.indexOf('click_switch_') === 0;
    }

    function toggleCondition(name) {
      if (!isToggleCondition(name)) return;
      state[name] = !Boolean(state[name]);
      setConditionBlocks(true);
    }

    conditionElements.forEach(function (block) {
      var condition = parseCondition(block.getAttribute(':show-if'));
      if (!isToggleCondition(condition.name)) return;

      block.classList.add('article-condition-clickable');
      if (!block.hasAttribute('tabindex')) block.setAttribute('tabindex', '0');
      if (!block.hasAttribute('role')) block.setAttribute('role', 'button');
      block.addEventListener('click', function () {
        toggleCondition(condition.name);
      });
      block.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleCondition(condition.name);
        }
      });
    });

    setConditionBlocks(false);

    Array.prototype.forEach.call(article.querySelectorAll('.article-content img'), function (image) {
      var imagePath = new URL(image.getAttribute('src'), window.location.href).pathname;
      var currentIndex = sources.indexOf(imagePath);
      var isSwitching = false;

      if (currentIndex < 0) return;

      image.classList.add('article-image-switcher');
      image.setAttribute('tabindex', '0');
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', '点击切换图片（1/' + sources.length + '）');

      function showNextImage() {
        if (isSwitching) return;

        if (currentIndex >= sources.length - 1) {
          if (state.after_eating) return;

          state.after_eating = true;
          image.setAttribute('aria-disabled', 'true');
          image.setAttribute('aria-label', '已展示最后一张图片（' + sources.length + '/' + sources.length + '）');
          image.classList.add('is-final');
          setConditionBlocks(true);
          return;
        }

        isSwitching = true;
        var nextIndex = currentIndex + 1;
        image.classList.add('is-switching');

        window.setTimeout(function () {
          var revealed = false;

          function revealNextImage() {
            if (revealed) return;
            revealed = true;

            currentIndex = nextIndex;
            var isFinalImage = currentIndex === sources.length - 1;
            image.alt = '牛肉芝士卷';
            image.setAttribute('aria-label', isFinalImage
              ? '已展示最后一张图片（' + sources.length + '/' + sources.length + '）'
              : '点击切换图片（' + (currentIndex + 1) + '/' + sources.length + '）');

            if (isFinalImage) {
              state.after_eating = true;
              image.setAttribute('aria-disabled', 'true');
              image.classList.add('is-final');
              setConditionBlocks(true);
            } else {
              image.removeAttribute('aria-disabled');
              image.classList.remove('is-final');
            }

            window.requestAnimationFrame(function () {
              image.classList.remove('is-switching');
              isSwitching = false;
            });
          }

          image.onload = revealNextImage;
          image.onerror = revealNextImage;
          image.src = sources[nextIndex];
          if (image.complete) revealNextImage();
        }, FADE_DURATION);
      }

      image.addEventListener('click', showNextImage);
      image.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          showNextImage();
        }
      });
    });
  });
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
