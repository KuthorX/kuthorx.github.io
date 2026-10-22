// 苍绿之眼 · ascii slots: the hub's cover, and the strip under each chapter title.
//
// The <ascii-art> tag (static/ascii/ascii-art.js, a local build of ascii.rest's)
// draws the piece, and mount() already holds the still frame for a reader who
// prefers reduced motion, so there is nothing to decide here. This module only
// marks a slot once the tag has drawn into it, so the stylesheet can swap the
// stand-in SVG for the live piece; before that (and with no JS at all) the SVG
// is what shows, and it is the same animation.
(function () {
  var slots = document.querySelectorAll('[data-ascii-slot]');
  if (!slots.length) return;

  function mark(slot) {
    var live = slot.querySelector('ascii-art');
    slot.classList.toggle('is-mounted', !!(live && live.querySelector('canvas, pre')));
  }

  Array.prototype.forEach.call(slots, function (slot) {
    mark(slot);
    var live = slot.querySelector('ascii-art');
    if (live && typeof MutationObserver === 'function') {
      // The tag replaces its contents when the piece mounts.
      new MutationObserver(function () { mark(slot); }).observe(live, { childList: true });
    }
  });
})();
