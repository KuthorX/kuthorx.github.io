/* 苍绿之眼 · 页面作为「介质」的那一句（`js/cloak-status.js`）
 *
 * 之前这一页是哑的：它显示内容，但从不说自己现在处于什么状态。故事里有三个声音
 * 在说话，而承载故事的页面本身一句话也没有。这一行补上那句 —— 一页只有一行，
 * 永远是同一行，永远只说现在。
 *
 * 三个状态：
 *   已载入            —— 刚进来
 *   校验失败 · 累计 N 次 —— 答错过
 *   记录已写入 · N 处    —— 至少解开一步
 *
 * 为什么不接 `site.js` 的事件：那会把两个脚本焊在一起，而 `site.js` 是共享的。
 * 这里改成**从 DOM 现算**——状态本来就是 DOM 的纯函数，`render()` 幂等，
 * 谁改了页面都会被观察到，也不怕事件漏接。
 */
(function () {
  'use strict';

  var status = document.querySelector('[data-cloak-status]');
  if (!status) return;

  var article = status.closest('article') || document.body;
  var WRONG = /已答错\s*(\d+)/;
  var last = '';

  function visible(element) {
    return !element.hasAttribute('hidden');
  }

  function compute() {
    var done = 0;
    var blocks = article.querySelectorAll('.full-moon-answer__feedback--success');
    for (var i = 0; i < blocks.length; i += 1) {
      if (visible(blocks[i])) done += 1;
    }

    var wrong = 0;
    var attempts = article.querySelectorAll('.answer-attempts');
    for (var j = 0; j < attempts.length; j += 1) {
      if (!visible(attempts[j])) continue;
      var match = WRONG.exec(attempts[j].textContent || '');
      if (match) {
        var count = parseInt(match[1], 10);
        if (count > wrong) wrong = count;
      }
    }

    if (done > 0) return { state: 'done', text: '记录已写入 · ' + done + ' 处' };
    if (wrong > 0) return { state: 'warn', text: '校验失败 · 累计 ' + wrong + ' 次' };
    return { state: 'ready', text: '已载入' };
  }

  function render() {
    var next = compute();
    var key = next.state + '|' + next.text;
    if (key === last) return;
    last = key;
    status.textContent = next.text;
    status.setAttribute('data-state', next.state);
    status.hidden = false;
  }

  render();

  if (typeof MutationObserver !== 'function') return;

  var frame = 0;
  new MutationObserver(function () {
    if (frame) return;
    frame = window.requestAnimationFrame(function () {
      frame = 0;
      render();
    });
  }).observe(article, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'data-state']
  });
})();
