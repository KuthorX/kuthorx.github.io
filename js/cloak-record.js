/* 苍绿之眼 · 介质知道的事（`js/cloak-record.js`）
 *
 * 三处「泄漏」，共用一件事：**这个页面知道你做过什么。**
 *
 *   A. 案卷页的标签标题 `[0xA9] 未校验` —— 解开之后变成「已校验」
 *   B. 大厅一行 —— 你的记录在不在这个浏览器里
 *   C. 0xB0 里凯特摊开的那张纸 —— 上面是你自己填过的字
 *
 * 全部从 DOM 和 localStorage 现算，不接 `site.js` 的事件（那会把两个脚本焊在一起）。
 * 存档格式是 `site.js` 定的：`STORAGE_PREFIX + articleKey` → JSON，
 * 每个答案键带 `<key>_correct_answer` 和 `<key>_user`（玩家填的原话）。
 *
 * C 用的是 `_user`，不是标准答案：写出来的是你自己的字，
 * 所以不可能剧透，而且比标准答案更像「介质记住了你」。
 */
(function () {
  'use strict';

  var PREFIX = 'kuthorx-blog:article-state:';
  var article = document.querySelector('article[data-cloak-chapter]');

  function store() {
    try {
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  /* 扫遍所有章节的存档，只收已答对的那几道里玩家填的原话。 */
  function collect() {
    var answers = {};
    var local = store();
    if (!local) return answers;
    for (var i = 0; i < local.length; i += 1) {
      var name = local.key(i);
      if (!name || name.indexOf(PREFIX) !== 0) continue;
      var parsed = null;
      try {
        parsed = JSON.parse(local.getItem(name));
      } catch (error) {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') continue;
      Object.keys(parsed).forEach(function (key) {
        if (!/_user$/.test(key)) return;
        var base = key.slice(0, -'_user'.length);
        if (parsed[base + '_correct_answer'] !== true) return;
        var value = String(parsed[key] == null ? '' : parsed[key]).trim();
        if (value) answers[base] = value;
      });
    }
    return answers;
  }

  function solvedOnPage() {
    if (!article) return 0;
    return article.querySelectorAll('.full-moon-answer__feedback--success:not([hidden])').length;
  }

  /* A —— 标签标题。按字面替换，所以模板不需要告诉这个脚本任何东西。 */
  function syncTitle() {
    var title = document.title || '';
    var checked = solvedOnPage() > 0;
    var want = checked ? '已校验' : '未校验';
    var other = checked ? '未校验' : '已校验';
    if (title.indexOf(want) !== -1) return;
    if (title.indexOf(other) === -1) return;
    document.title = title.replace(other, want);
  }

  /* B —— 大厅那一行。 */
  function fillRecordLine() {
    var line = document.querySelector('[data-cloak-record-line]');
    if (!line) return;
    var solved = document.querySelectorAll('.cloak-step[data-state="solved"]').length;
    line.textContent = solved > 0
      ? solved + ' 处记录已经在你这个浏览器里了。它们不会去别的地方。'
      : '记录是空的。这一页不会记住你，除非你开始。';
    line.setAttribute('data-state', solved > 0 ? 'has' : 'empty');
    line.hidden = false;
  }

  /* C —— 那张纸上的字。 */
  function fillEchoes() {
    var block = document.querySelector('[data-cloak-echo-block]');
    if (!block) return;
    var answers = collect();
    var items = block.querySelectorAll('[data-cloak-echo]');
    var shown = 0;
    for (var i = 0; i < items.length; i += 1) {
      var value = answers[items[i].getAttribute('data-cloak-echo') || ''];
      if (!value) continue;
      items[i].textContent = value;
      items[i].hidden = false;
      shown += 1;
    }
    if (shown > 0) block.hidden = false;
  }

  fillRecordLine();
  fillEchoes();
  syncTitle();

  if (!article || typeof MutationObserver !== 'function') return;

  var frame = 0;
  new MutationObserver(function () {
    if (frame) return;
    frame = window.requestAnimationFrame(function () {
      frame = 0;
      syncTitle();
    });
  }).observe(article, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
})();
