/* 苍绿之眼 · 游戏设置（`js/cloak-settings.js`）
 *
 * 一件东西：左下角那个固定按钮背后的面板，以及它驱动的环境声。
 * 现在两项 —— 环境声开/关、音量 —— 但结构是给以后留的。
 *
 * 环境声为什么是合成的，不是 mp3：
 *   1. 一个 12 秒的可循环文件，即使压到 48 kbps 也要 70 KB，而且循环点会有接缝；
 *   2. 噪声类环境声本来就该无缝、无限长 —— 一段噪声 buffer 循环天然没有接缝，代价 0 字节；
 *   3. 不用为素材处理授权。
 *
 * 「一进来就有」在浏览器里要打折扣：Chrome / Safari / Firefox 都禁止未经手势的有声自动播放。
 * 所以加载就试；能响就响；被拦就退到「点一下开关」，不假装在响；两项设置都记在 localStorage。
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-cloak-settings]');
  if (!root) return;

  var openButton = root.querySelector('[data-cloak-settings-open]');
  var panel = root.querySelector('[data-cloak-settings-panel]');
  var toggle = root.querySelector('[data-cloak-settings-toggle]');
  var toggleText = root.querySelector('[data-cloak-settings-toggle-text]');
  var volume = root.querySelector('[data-cloak-settings-volume]');
  var volumeText = root.querySelector('[data-cloak-settings-volume-text]');
  var note = root.querySelector('[data-cloak-settings-note]');

  var STORAGE_KEY = 'kuthorx-blog:ambience';
  /* 音量 100% 对应这个增益。
     `MAX_GAIN` 不是拍出来的：用 `OfflineAudioContext` 在真实 Chromium 里把同一张
     音频图按 master = 1 渲染一遍，量得原始 RMS = 0.1656，再按「100% ≈ −22 dBFS」
     反算。0.5 时 RMS ≈ −21.6 dBFS、峰值 −8.7 dBFS，不削波。
     默认 80% → 增益 0.40 → RMS ≈ −23.6 dBFS。

     这个数只能实测：噪声类信号的感知响度和增益比例差十几 dB，只按比例猜必然偏小。
     上一版按 0.09 猜，实测只有 −31.5 dBFS，而且几乎全在 300–1500 Hz ——
     在笔记本小喇叭上等于没有。 */
  var MAX_GAIN = 0.5;
  var DEFAULT_VOLUME = 80;

  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  var master = null;
  var running = false;
  var state = { on: true, volume: DEFAULT_VOLUME };

  /* ---------- 设置项 ---------- */

  function load() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return;
    }
    if (!raw) return;
    if (raw === 'on' || raw === 'off') {
      /* 旧格式（这个设置项刚做出来时只存了 'on' / 'off'）。 */
      state.on = raw === 'on';
      return;
    }
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.on === 'boolean') state.on = parsed.on;
        if (typeof parsed.volume === 'number') state.volume = Math.max(0, Math.min(100, parsed.volume));
      }
    } catch (error) {
      /* 坏数据就当没存过。 */
    }
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      /* 隐私模式下 localStorage 可能不可写：这只是记住偏好，失败不影响功能。 */
    }
  }

  function targetGain() {
    return (state.volume / 100) * MAX_GAIN;
  }

  /* ---------- 界面 ---------- */

  function paint() {
    root.setAttribute('data-state', running ? 'on' : (state.on ? 'waiting' : 'off'));
    /* 开关反映的是**此刻是否真的在响**，不是你的意图 —— 否则会自相矛盾：
       被浏览器拦下时它显示「开」，可点一下却是关。被拦下的原因由下面那行
       note 说明，点开关就是再试一次。 */
    if (toggle) toggle.setAttribute('aria-checked', running ? 'true' : 'false');
    if (toggleText) toggleText.textContent = running ? '开' : '关';
    if (volume && String(volume.value) !== String(state.volume)) volume.value = String(state.volume);
    if (volumeText) volumeText.textContent = state.volume + '%';
    if (note) note.hidden = !(state.on && !running);
  }

  function setPanelOpen(open) {
    if (!panel || !openButton) return;
    panel.hidden = !open;
    openButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var first = panel.querySelector('[data-cloak-settings-toggle]');
      if (first) first.focus();
    }
  }

  /* ---------- 声音 ---------- */

  /* 四秒的白噪声。循环播放时听不出接缝，因为噪声没有周期。 */
  function noiseBuffer() {
    var buffer = ctx.createBuffer(2, Math.round(ctx.sampleRate * 4), ctx.sampleRate);
    for (var channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      var data = buffer.getChannelData(channel);
      for (var i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function build() {
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    /* 调制级：基值 1.0，呼吸的起伏接在它的 gain 上。
       这一级是必须的 —— 上一版把 LFO 直接接到 `master.gain`（基值 0.4），
       而 LFO 摆幅是绝对值，于是增益在 0.4±0.16 之间摆、还会穿过负数。
       那不是「呼吸」，是抽动，而且音量一改，起伏比例就跟着变。
       接在基值 1.0 的这一级上，起伏恒为 ±16%，与音量无关。 */
    var mod = ctx.createGain();
    mod.gain.value = 1;
    mod.connect(master);

    var source = ctx.createBufferSource();
    source.buffer = noiseBuffer();
    source.loop = true;

    /* 低频：雨落在别处的闷响。1500 而不是 1150 —— 太闷在笔记本喇叭上就没了。 */
    var body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 1500;
    body.Q.value = 0.5;
    var bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.75;

    /* 中高：雨打在叶子上的颗粒。这一层负责「能听见」，所以比上一版抬了不少
       （5200 Hz / 0.14 → 3900 Hz / 0.30）。 */
    var patter = ctx.createBiquadFilter();
    patter.type = 'bandpass';
    patter.frequency.value = 3900;
    patter.Q.value = 0.7;
    var patterGain = ctx.createGain();
    patterGain.gain.value = 0.3;

    source.connect(body);
    body.connect(bodyGain);
    bodyGain.connect(mod);
    source.connect(patter);
    patter.connect(patterGain);
    patterGain.connect(mod);

    /* 两个极慢的 LFO：一个让整体起伏（呼吸），一个让低通轻微开合（风）。 */
    var breath = ctx.createOscillator();
    breath.type = 'sine';
    breath.frequency.value = 0.07;
    var breathDepth = ctx.createGain();
    breathDepth.gain.value = 0.16;
    breath.connect(breathDepth);
    breathDepth.connect(mod.gain);

    var gust = ctx.createOscillator();
    gust.type = 'sine';
    gust.frequency.value = 0.021;
    var gustDepth = ctx.createGain();
    gustDepth.gain.value = 320;
    gust.connect(gustDepth);
    gustDepth.connect(body.frequency);

    source.start(0);
    breath.start(0);
    gust.start(0);
  }

  function fadeTo(value, seconds) {
    if (!ctx || !master) return;
    var now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(value, now + seconds);
  }

  function start() {
    if (running) return;
    if (!AudioCtx) {
      state.on = true;
      paint();
      return;
    }
    /* 建图在某些环境下会直接抛（没有音频设备、被策略禁用）。抛出来必须落到
       「点开」，不能什么都不发生 —— 那会看起来像坏了。 */
    try {
      if (!ctx) build();
    } catch (error) {
      state.on = true;
      paint();
      return;
    }

    if (ctx.state === 'running') {
      running = true;
      state.on = true;
      fadeTo(targetGain(), 1.5);
      paint();
      save();
      return;
    }

    state.on = true;
    paint();
    save();

    ctx.resume().then(function () {
      if (ctx.state !== 'running') return;
      running = true;
      fadeTo(targetGain(), 1.5);
      paint();
    }, function () {});

    /* 关键：`resume()` 在自动播放被拦下时**不会 reject，而是一直 pending**
       （要等一个用户手势）。只挂 .catch 的话界面会永远停在「关」上，
       看起来就像这个功能根本没做。所以自己盯一眼状态。 */
    window.setTimeout(function () {
      if (ctx && ctx.state !== 'running') {
        paint();
        armFirstGesture();
      }
    }, 300);
  }

  /* 绝大多数人不会去点设置里那个开关，所以「被拦下」不能只写在面板里等人来点：
     页面上第一次真正的用户手势（点击、按键）就把声音接上。只做一次。 */
  var gestureArmed = false;

  function armFirstGesture() {
    if (gestureArmed) return;
    gestureArmed = true;
    var once = function (event) {
      /* 设置面板里的操作自己管自己，别在这里抢。 */
      if (event && event.target && root.contains(event.target)) return;
      document.removeEventListener('pointerdown', once, true);
      document.removeEventListener('keydown', once, true);
      if (state.on && !running) start();
    };
    document.addEventListener('pointerdown', once, true);
    document.addEventListener('keydown', once, true);
  }

  function stop() {
    state.on = false;
    running = false;
    fadeTo(0, 0.8);
    paint();
    save();
  }

  load();
  paint();

  /* ---------- 接线 ---------- */

  if (openButton && panel) {
    openButton.addEventListener('click', function () {
      setPanelOpen(panel.hidden);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hidden) {
        setPanelOpen(false);
        openButton.focus();
      }
    });
    document.addEventListener('click', function (event) {
      if (panel.hidden) return;
      if (root.contains(event.target)) return;
      setPanelOpen(false);
    });
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      if (running) stop();
      else start();
    });
  }

  if (volume) {
    volume.addEventListener('input', function () {
      var value = parseInt(volume.value, 10);
      state.volume = isNaN(value) ? DEFAULT_VOLUME : Math.max(0, Math.min(100, value));
      if (volumeText) volumeText.textContent = state.volume + '%';
      if (running) fadeTo(targetGain(), 0.15);
      save();
    });
  }

  /* 「一进来就有」：先试着直接响。用户上次关掉过就不再试 —— 那是他的选择。 */
  if (state.on) start();
  else paint();
})();
