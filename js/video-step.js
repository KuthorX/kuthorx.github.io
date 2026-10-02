// 苍绿之眼 frame-stepping video: native controls plus ±1 frame, slow motion and a frame-accurate clock.
// Markup: <div class="cloak-video" data-fps="30"><video src="..." controls preload="metadata" playsinline></video></div>
(function () {
  var DEFAULT_FPS = 30;
  var SLOW_RATE = 0.25;

  function pad(value) {
    return (value < 10 ? '0' : '') + value;
  }

  function frameLabel(seconds, fps) {
    var frame = Math.floor(seconds * fps + 1e-6);
    var whole = Math.floor(frame / fps);
    return Math.floor(whole / 60) + ':' + pad(whole % 60) + ' · 第 ' + pad(frame % fps) + ' 帧';
  }

  function button(text, label) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'cloak-video__button';
    el.textContent = text;
    el.setAttribute('aria-label', label);
    return el;
  }

  function buildControls(root) {
    var bar = document.createElement('div');
    bar.className = 'cloak-video__controls';
    var ui = {
      prev: button('− 1 帧', '后退一帧'),
      next: button('+ 1 帧', '前进一帧'),
      slow: button('0.25× 慢放', '切换慢放'),
      clock: document.createElement('span')
    };
    ui.slow.setAttribute('aria-pressed', 'false');
    ui.clock.className = 'cloak-video__clock';
    ui.clock.setAttribute('aria-live', 'off');
    bar.appendChild(ui.prev);
    bar.appendChild(ui.next);
    bar.appendChild(ui.slow);
    bar.appendChild(ui.clock);
    root.appendChild(bar);
    return ui;
  }

  function step(video, fps, delta) {
    video.pause();
    var frame = Math.floor(video.currentTime * fps + 1e-6) + delta;
    var last = Math.floor((video.duration || 0) * fps) - 1;
    frame = Math.max(0, last > 0 ? Math.min(frame, last) : frame);
    // Seek to the middle of the frame so decoders never land on the neighbouring one.
    video.currentTime = (frame + 0.5) / fps;
  }

  function bindControls(video, ui, fps) {
    function render() {
      ui.clock.textContent = frameLabel(video.currentTime || 0, fps);
    }
    ui.prev.addEventListener('click', function () { step(video, fps, -1); });
    ui.next.addEventListener('click', function () { step(video, fps, 1); });
    ui.slow.addEventListener('click', function () {
      var slow = video.playbackRate !== SLOW_RATE;
      video.playbackRate = slow ? SLOW_RATE : 1;
      ui.slow.setAttribute('aria-pressed', String(slow));
    });
    ['timeupdate', 'seeked', 'loadedmetadata'].forEach(function (name) {
      video.addEventListener(name, render);
    });
    render();
  }

  function init(root) {
    var video = root.querySelector('video');
    if (!video) return;
    var fps = parseFloat(root.getAttribute('data-fps')) || DEFAULT_FPS;
    bindControls(video, buildControls(root), fps);
  }

  Array.prototype.forEach.call(document.querySelectorAll('.cloak-video'), init);
})();
