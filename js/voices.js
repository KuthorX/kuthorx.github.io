// 苍绿之眼 "脑内声音": marks bracketed inner voices in chapters that opt in with `voices: true`.
// Without this script the original text stays untouched and readable.
(function () {
  var SKIP = 'pre, code, form, input, textarea, select, button, script, style, .cloak-archive, .voice';
  // A voice span that would contain one of these stays plain coloured text (no role=button), so the
  // link (or control) inside it remains the only interactive element.
  var INTERACTIVE = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]';
  var POPOVER_ID = 'voice-popover';

  function readRegistry(element) {
    var registry;
    try {
      registry = JSON.parse(element.textContent);
    } catch (error) {
      return [];
    }
    if (!Array.isArray(registry)) return [];
    return registry.filter(function (voice) {
      return voice && typeof voice.id === 'string' && /^[a-z0-9_-]+$/i.test(voice.id) &&
        typeof voice.open === 'string' && voice.open &&
        typeof voice.close === 'string' && voice.close;
    });
  }

  function label(voice) {
    return voice.name + (voice.role ? ' · ' + voice.role : '');
  }

  function describedById(voice) {
    return 'voice-desc-' + voice.id;
  }

  function makeSpan(voice, passive) {
    var span = document.createElement('span');
    span.className = 'voice voice--' + voice.id;
    span.setAttribute('data-voice', voice.id);
    if (!passive) {
      span.setAttribute('tabindex', '0');
      span.setAttribute('role', 'button');
      span.setAttribute('aria-expanded', 'false');
      span.setAttribute('aria-describedby', describedById(voice));
    }
    return span;
  }

  // Paragraph voices: "/ … /" wraps the whole paragraph content.
  function wrapParagraphVoice(ctx, paragraph) {
    if (paragraph.closest(SKIP)) return;
    var text = paragraph.textContent.trim();

    ctx.paragraphVoices.some(function (voice) {
      var minLength = voice.open.length + voice.close.length + 1;
      if (text.length < minLength || text.indexOf(voice.open) !== 0 ||
          text.slice(-voice.close.length) !== voice.close) {
        return false;
      }
      var span = makeSpan(voice, Boolean(paragraph.querySelector(INTERACTIVE)));
      span.classList.add('voice--block');
      while (paragraph.firstChild) span.appendChild(paragraph.firstChild);
      paragraph.appendChild(span);
      paragraph.classList.add('voice-paragraph', 'voice-paragraph--' + voice.id);
      ctx.spans.push(span);
      return true;
    });
  }

  function nextOpen(ctx, text, from) {
    var best = null;
    ctx.inlineVoices.forEach(function (voice) {
      var index = text.indexOf(voice.open, from);
      if (index !== -1 && (!best || index < best.index)) best = { index: index, voice: voice };
    });
    return best;
  }

  function isSkipped(ctx, node) {
    var parent = node.parentElement;
    return !parent || Boolean(parent.closest(SKIP)) || !ctx.content.contains(parent);
  }

  function wrapRange(ctx, start, end, voice, passive) {
    var range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    var span = makeSpan(voice, passive || Boolean(start.node.parentElement.closest('a[href]')));
    try {
      range.surroundContents(span);
    } catch (error) {
      return null;
    }
    ctx.spans.push(span);
    return span;
  }

  function continueAfter(ctx, span) {
    var rest = span && span.nextSibling;
    if (rest && rest.nodeType === Node.TEXT_NODE) processTextNode(ctx, rest, 0);
  }

  // Cross-node case: the close bracket sits in a later sibling text node of the same parent
  // (e.g. 【a <em>b</em> c】 or 【… <a href>案卷</a> …】). Returns true when it wrapped something.
  function wrapAcrossSiblings(ctx, node, match) {
    var voice = match.voice;
    var passive = false;
    for (var sibling = node.nextSibling; sibling; sibling = sibling.nextSibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE) {
        if (sibling.matches(SKIP) || sibling.querySelector(SKIP)) return false;
        if (sibling.matches(INTERACTIVE) || sibling.querySelector(INTERACTIVE)) passive = true;
        continue;
      }
      if (sibling.nodeType !== Node.TEXT_NODE) continue;
      var siblingClose = sibling.data.indexOf(voice.close);
      if (siblingClose === -1) continue;
      var span = wrapRange(ctx, { node: node, offset: match.index },
        { node: sibling, offset: siblingClose + voice.close.length }, voice, passive);
      continueAfter(ctx, span);
      return true;
    }
    return false;
  }

  // Wraps every open…close span inside one text node, plus the simple cross-node case.
  function processTextNode(ctx, node, from) {
    if (isSkipped(ctx, node)) return;
    var match = nextOpen(ctx, node.data, from);
    if (!match) return;

    var voice = match.voice;
    var closeIndex = node.data.indexOf(voice.close, match.index + voice.open.length);
    if (closeIndex !== -1) {
      continueAfter(ctx, wrapRange(ctx, { node: node, offset: match.index },
        { node: node, offset: closeIndex + voice.close.length }, voice, false));
      return;
    }
    if (wrapAcrossSiblings(ctx, node, match)) return;

    // Unmatched opener (e.g. a lone 【 in running text): leave it and keep scanning.
    processTextNode(ctx, node, match.index + voice.open.length);
  }

  function wrapInlineVoices(ctx) {
    if (!ctx.inlineVoices.length) return;
    var walker = document.createTreeWalker(ctx.content, NodeFilter.SHOW_TEXT);
    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(function (node) { processTextNode(ctx, node, 0); });
  }

  // Sorted by document order so the legend lists voices in the order they appear.
  function presentVoiceIds(spans) {
    spans.sort(function (a, b) {
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    var ids = [];
    spans.forEach(function (span) {
      var id = span.getAttribute('data-voice');
      if (ids.indexOf(id) === -1) ids.push(id);
    });
    return ids;
  }

  // Screen-reader descriptions: "脑内声音：斗篷 · 审视".
  function addDescriptions(ctx) {
    ctx.presentIds.forEach(function (id) {
      var description = document.createElement('span');
      description.id = describedById(ctx.byId[id]);
      description.className = 'visually-hidden';
      description.textContent = '脑内声音：' + label(ctx.byId[id]);
      ctx.article.appendChild(description);
    });
  }

  function createPopover() {
    var popover = document.createElement('div');
    popover.id = POPOVER_ID;
    popover.className = 'voice-popover';
    popover.setAttribute('role', 'tooltip');
    popover.hidden = true;
    document.body.appendChild(popover);
    return { element: popover, active: null };
  }

  function positionPopover(popover, span) {
    var rects = span.getClientRects();
    var rect = rects.length ? rects[rects.length - 1] : span.getBoundingClientRect();
    var margin = 8;
    var width = popover.element.offsetWidth;
    var maxLeft = document.documentElement.clientWidth - width - margin;
    var left = Math.max(margin, Math.min(rect.left, maxLeft));
    popover.element.style.left = (left + window.pageXOffset) + 'px';
    popover.element.style.top = (rect.bottom + window.pageYOffset + margin) + 'px';
  }

  function fillPopover(element, voice) {
    element.textContent = '';
    element.setAttribute('data-voice', voice.id);
    var name = document.createElement('strong');
    name.className = 'voice-popover__name';
    name.textContent = label(voice);
    element.appendChild(name);
    if (voice.note) {
      var note = document.createElement('span');
      note.className = 'voice-popover__note';
      note.textContent = voice.note;
      element.appendChild(note);
    }
  }

  function openPopover(ctx, span) {
    var popover = ctx.popover;
    var voice = ctx.byId[span.getAttribute('data-voice')];
    if (!voice) return;
    if (popover.active && popover.active !== span) popover.active.setAttribute('aria-expanded', 'false');

    fillPopover(popover.element, voice);
    popover.element.hidden = false;
    positionPopover(popover, span);
    span.setAttribute('aria-expanded', 'true');
    span.setAttribute('aria-controls', POPOVER_ID);
    popover.active = span;
  }

  function closePopover(ctx, returnFocus) {
    var popover = ctx.popover;
    if (!popover.active) return;
    var span = popover.active;
    popover.active = null;
    popover.element.hidden = true;
    span.setAttribute('aria-expanded', 'false');
    span.removeAttribute('aria-controls');
    if (returnFocus) span.focus();
  }

  function togglePopover(ctx, span) {
    if (ctx.popover.active === span) closePopover(ctx, false);
    else openPopover(ctx, span);
  }

  function interactiveVoice(ctx, target) {
    var span = target && target.closest ? target.closest('.voice[role="button"]') : null;
    return span && ctx.content.contains(span) ? span : null;
  }

  function isKeyboardFocus(span) {
    try {
      return span.matches(':focus-visible');
    } catch (error) {
      return false;
    }
  }

  function bindPopover(ctx) {
    var content = ctx.content;
    content.addEventListener('click', function (event) {
      var span = interactiveVoice(ctx, event.target);
      if (span) togglePopover(ctx, span);
    });
    content.addEventListener('keydown', function (event) {
      var span = interactiveVoice(ctx, event.target);
      if (!span || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      togglePopover(ctx, span);
    });
    content.addEventListener('focusin', function (event) {
      var span = interactiveVoice(ctx, event.target);
      if (span && isKeyboardFocus(span)) openPopover(ctx, span);
    });
    content.addEventListener('focusout', function (event) {
      if (ctx.popover.active && event.target === ctx.popover.active) closePopover(ctx, false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && ctx.popover.active) closePopover(ctx, true);
    });
    window.addEventListener('resize', function () {
      if (ctx.popover.active) positionPopover(ctx.popover, ctx.popover.active);
    });
  }

  function legendItem(voice) {
    var item = document.createElement('li');
    item.className = 'voice-legend__item';
    item.hidden = true;

    var sample = document.createElement('span');
    sample.className = 'voice-sample voice--' + voice.id;
    sample.textContent = voice.open.trim() + '…' + voice.close.trim();
    var name = document.createElement('span');
    name.className = 'voice-legend__name';
    name.textContent = label(voice);
    var note = document.createElement('span');
    note.className = 'voice-legend__note';
    note.textContent = voice.note || '';

    item.appendChild(sample);
    item.appendChild(name);
    item.appendChild(note);
    return item;
  }

  function syncLegendOpen(legend) {
    var wide = window.matchMedia ? window.matchMedia('(min-width: 1200px)') : null;
    function syncOpen() {
      legend.open = Boolean(wide && wide.matches);
    }
    syncOpen();
    if (!wide) return;
    if (wide.addEventListener) wide.addEventListener('change', syncOpen);
    else if (wide.addListener) wide.addListener(syncOpen);
  }

  // Each voice is revealed in the legend when its first span scrolls into view.
  function observeReveals(ctx, reveal) {
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || !('IntersectionObserver' in window)) {
      ctx.presentIds.forEach(reveal);
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.getAttribute('data-voice');
        reveal(id);
        ctx.spans.forEach(function (span) {
          if (span.getAttribute('data-voice') === id) observer.unobserve(span);
        });
      });
    });
    ctx.spans.forEach(function (span) { observer.observe(span); });
  }

  // Legend: lists only voices present on this page, each revealed when first seen.
  function buildLegend(ctx) {
    var legend = ctx.article.querySelector('[data-voice-legend]');
    var list = legend && legend.querySelector('[data-voice-legend-list]');
    if (!legend || !list) return;

    var count = legend.querySelector('[data-voice-legend-count]');
    var items = {};
    var revealedCount = 0;
    ctx.presentIds.forEach(function (id) {
      items[id] = legendItem(ctx.byId[id]);
      list.appendChild(items[id]);
    });

    function reveal(id) {
      var item = items[id];
      if (!item || !item.hidden) return;
      item.hidden = false;
      revealedCount += 1;
      if (count) count.textContent = '(' + revealedCount + ')';
    }

    syncLegendOpen(legend);
    legend.hidden = false;
    observeReveals(ctx, reveal);
  }

  function createContext() {
    var article = document.querySelector('article[data-voices]');
    var registryElement = document.getElementById('cloak-voices');
    var content = article && article.querySelector('.chapter-content');
    if (!content || !registryElement) return null;

    var registry = readRegistry(registryElement);
    var byId = {};
    registry.forEach(function (voice) { byId[voice.id] = voice; });
    return {
      article: article,
      content: content,
      byId: byId,
      inlineVoices: registry.filter(function (voice) { return voice.form !== 'paragraph'; }),
      paragraphVoices: registry.filter(function (voice) { return voice.form === 'paragraph'; }),
      spans: [],
      presentIds: [],
      popover: null
    };
  }

  function init() {
    var ctx = createContext();
    if (!ctx) return;

    Array.prototype.forEach.call(ctx.content.querySelectorAll('p'), function (paragraph) {
      wrapParagraphVoice(ctx, paragraph);
    });
    wrapInlineVoices(ctx);
    if (!ctx.spans.length) return;

    ctx.presentIds = presentVoiceIds(ctx.spans);
    addDescriptions(ctx);
    ctx.popover = createPopover();
    bindPopover(ctx);
    buildLegend(ctx);
  }

  init();
})();
