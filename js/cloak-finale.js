// 苍绿之眼 · 最后一个问题：颜色从这个页面退出去。
//
// 标记：终局的那个 <form data-cloak-finale> 放在凯特发问的 :show-if 块里，
// 而 site.js 用 `hidden` 开关这些块（以及这个答案 key 的 success 块）。所以这里
// 不需要任何状态，只要读那两个属性，往 <html> 上写一个：
//
//   data-cloak-finale="ask"       问题已经在眼前，还没答
//   data-cloak-finale="answered"  答了；样式表不再抽颜色
//
// 抽颜色本身全部在 CSS 里（token 覆盖），所以是一帧完成，没有动画可卡。
// 回答之后那口气也是 CSS 的，并且尊重 prefers-reduced-motion。
// 没有这个脚本，这一页就只是正常地读——不会坏。
(function () {
  var form = document.querySelector('form[data-cloak-finale]');
  if (!form) return;

  var root = document.documentElement;
  var key = (form.getAttribute('data-answer-key') || '').trim();

  // 凯特说这句话的那个块。
  var gate = form.parentElement;
  while (gate && !gate.hasAttribute(':show-if')) gate = gate.parentElement;

  // 答对以后顶掉输入框的那个块。
  var success = null;
  if (key) {
    var blocks = document.querySelectorAll('[\\:show-if]');
    for (var i = 0; i < blocks.length; i++) {
      if ((blocks[i].getAttribute(':show-if') || '').trim() === key + '_correct_answer') {
        success = blocks[i];
        break;
      }
    }
  }

  function shown(element) {
    return !!element && !element.hidden;
  }

  function reduced() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  var engaged = false; // 问题至少有一次出现在眼前

  function sync() {
    if (shown(success)) root.setAttribute('data-cloak-finale', 'answered');
    else if (engaged && shown(gate)) root.setAttribute('data-cloak-finale', 'ask');
    else root.removeAttribute('data-cloak-finale');
  }

  function wash() {
    if (reduced()) return;
    var layer = document.createElement('div');
    layer.className = 'cloak-finale-wash';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    window.setTimeout(function () {
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    }, 1300);
  }

  function engage() {
    if (engaged) return;
    engaged = true;
    sync();
  }

  // 只在真的读到这一问的时候才抽颜色：中途刷新回来的人不该发现屋子已经灰了。
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          observer.disconnect();
          engage();
          return;
        }
      }
    }, { threshold: 0.45 });
    observer.observe(form);
  } else {
    engage();
  }

  if (success && typeof MutationObserver === 'function') {
    new MutationObserver(function () {
      var was = root.getAttribute('data-cloak-finale') === 'answered';
      sync();
      if (!was && root.getAttribute('data-cloak-finale') === 'answered') wash();
    }).observe(success, { attributes: true, attributeFilter: ['hidden'] });
  }

  // 已经解开过的人刷新回来：直接是 answered，不放那口气。
  sync();
})();
