(function () {
  var FFT_SIZE = 2048;
  var HOP = 256;
  var DYNAMIC_RANGE_DB = 70;
  var MAX_WINDOW_SECONDS = 20;
  var MAX_FILE_BYTES = 60 * 1024 * 1024;
  var DEFAULT_DURATION = 10;
  var DEFAULT_MAX_FREQ = 12000;
  var FRAME_BUDGET_MS = 12;
  var PLOT_W = 1100;
  var PLOT_H = 440;
  var HIST_MIN = -240;
  var HIST_STEP = 0.25;
  var HIST_BINS = 2400;

  var tables = null;

  function getTables() {
    if (tables) return tables;
    var half = FFT_SIZE / 2;
    var cos = new Float32Array(half);
    var sin = new Float32Array(half);
    var window_ = new Float32Array(FFT_SIZE);
    var rev = new Uint16Array(FFT_SIZE);
    var bits = Math.round(Math.log(FFT_SIZE) / Math.LN2);
    var i;
    for (i = 0; i < half; i++) {
      cos[i] = Math.cos(2 * Math.PI * i / FFT_SIZE);
      sin[i] = -Math.sin(2 * Math.PI * i / FFT_SIZE);
    }
    for (i = 0; i < FFT_SIZE; i++) {
      window_[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1));
      var r = 0;
      for (var b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      rev[i] = r;
    }
    tables = { cos: cos, sin: sin, hann: window_, rev: rev };
    return tables;
  }

  // In-place iterative radix-2 FFT, length FFT_SIZE.
  function fft(re, im) {
    var t = getTables();
    var n = FFT_SIZE;
    var i, j, tr, ti;
    for (i = 0; i < n; i++) {
      j = t.rev[i];
      if (j > i) {
        tr = re[i]; re[i] = re[j]; re[j] = tr;
        ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (var size = 2; size <= n; size <<= 1) {
      var halfSize = size >> 1;
      var step = n / size;
      for (var start = 0; start < n; start += size) {
        for (var k = 0, w = 0; k < halfSize; k++, w += step) {
          var a = start + k;
          var b = a + halfSize;
          var wr = t.cos[w];
          var wi = t.sin[w];
          var xr = re[b] * wr - im[b] * wi;
          var xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }

  function frameCount(length) {
    return length < FFT_SIZE ? 0 : Math.floor((length - FFT_SIZE) / HOP) + 1;
  }

  // Magnitude (dB) of one Hann-windowed frame for bins [0, bins).
  function frameDb(samples, offset, bins, re, im, out, outOffset) {
    var t = getTables();
    var i;
    for (i = 0; i < FFT_SIZE; i++) {
      re[i] = samples[offset + i] * t.hann[i];
      im[i] = 0;
    }
    fft(re, im);
    for (i = 0; i < bins; i++) {
      var mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      out[outOffset + i] = 20 * Math.log(mag + 1e-9) / Math.LN10;
    }
  }

  function percentile(values, p) {
    var hist = new Uint32Array(HIST_BINS);
    var i, idx;
    for (i = 0; i < values.length; i++) {
      idx = Math.floor((values[i] - HIST_MIN) / HIST_STEP);
      hist[idx < 0 ? 0 : idx >= HIST_BINS ? HIST_BINS - 1 : idx]++;
    }
    var target = Math.ceil(values.length * p);
    var acc = 0;
    for (i = 0; i < HIST_BINS; i++) {
      acc += hist[i];
      if (acc >= target) return HIST_MIN + (i + 1) * HIST_STEP;
    }
    return HIST_MIN + HIST_BINS * HIST_STEP;
  }

  function colorAt(t) {
    // near-black -> gray-green -> pale green (#9ff0c0)
    var g = Math.pow(t, 1.8);
    var r = Math.round(6 + g * 153);
    var gr = Math.round(10 + g * 230);
    var b = Math.round(8 + g * 184);
    return [r, gr, b];
  }

  function renderPlot(db, frames, bins) {
    var canvas = document.createElement('canvas');
    canvas.width = PLOT_W;
    canvas.height = PLOT_H;
    var ctx = canvas.getContext('2d');
    var image = ctx.createImageData(PLOT_W, PLOT_H);
    var data = image.data;
    var ref = percentile(db, 0.99);
    var floor = ref - DYNAMIC_RANGE_DB;

    var lut = [];
    for (var l = 0; l < 256; l++) lut.push(colorAt(l / 255));

    var f0 = new Int32Array(PLOT_W);
    var f1 = new Int32Array(PLOT_W);
    var x, y, f, b;
    for (x = 0; x < PLOT_W; x++) {
      f0[x] = Math.floor(x * frames / PLOT_W);
      f1[x] = Math.max(f0[x] + 1, Math.floor((x + 1) * frames / PLOT_W));
    }
    for (y = 0; y < PLOT_H; y++) {
      var row = PLOT_H - 1 - y;
      var b0 = Math.floor(row * bins / PLOT_H);
      var b1 = Math.min(bins, Math.max(b0 + 1, Math.floor((row + 1) * bins / PLOT_H)));
      for (x = 0; x < PLOT_W; x++) {
        var peak = -Infinity;
        for (f = f0[x]; f < f1[x] && f < frames; f++) {
          var base = f * bins;
          for (b = b0; b < b1; b++) {
            if (db[base + b] > peak) peak = db[base + b];
          }
        }
        var v = (peak - floor) / DYNAMIC_RANGE_DB;
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        var c = lut[Math.round(v * 255)];
        var p = (y * PLOT_W + x) * 4;
        data[p] = c[0];
        data[p + 1] = c[1];
        data[p + 2] = c[2];
        data[p + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function niceTimeStep(seconds, pixels) {
    var steps = [0.1, 0.25, 0.5, 1, 2, 5, 10];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] / seconds * pixels >= 64) return steps[i];
    }
    return steps[steps.length - 1];
  }

  function formatSeconds(value) {
    return (Math.round(value * 100) / 100).toString();
  }

  function yieldFrame(fn) {
    if (document.hidden) {
      setTimeout(fn, 0);
    } else {
      window.requestAnimationFrame(fn);
    }
  }

  function readFile(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsArrayBuffer(file);
    });
  }

  var sharedContext = null;

  function decodeAudio(arrayBuffer) {
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return Promise.reject(new Error('unsupported'));
    if (!sharedContext) sharedContext = new Ctor();
    // Promise form only (every current browser); mixing it with callbacks double-reports errors.
    var pending = sharedContext.decodeAudioData(arrayBuffer);
    return pending && typeof pending.then === 'function' ? pending : Promise.reject(new Error('unsupported'));
  }

  var uid = 0;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function field(root, id, labelText, type, attrs) {
    var wrap = el('div', 'cvr-decoder__field');
    var label = el('label', 'cvr-decoder__field-label', labelText);
    var input = el('input', 'cvr-decoder__input');
    input.id = id;
    input.type = type;
    Object.keys(attrs || {}).forEach(function (name) { input.setAttribute(name, attrs[name]); });
    label.setAttribute('for', id);
    wrap.appendChild(label);
    wrap.appendChild(input);
    root.appendChild(wrap);
    return input;
  }

  function buildLoader(root, id, src) {
    var loader = el('div', 'cvr-decoder__row');
    var fileInput = field(loader, id + '_file', '载入录音文件', 'file', { accept: 'audio/*' });
    var archiveButton = null;
    if (src) {
      archiveButton = el('button', 'cvr-decoder__button', '载入博客存档录音');
      archiveButton.type = 'button';
      loader.appendChild(archiveButton);
    }
    root.appendChild(loader);
    return { fileInput: fileInput, archiveButton: archiveButton };
  }

  function buildWindowForm(root, id, statusId, offset) {
    var form = el('form', 'cvr-decoder__row cvr-decoder__window');
    form.setAttribute('novalidate', '');
    form.setAttribute('aria-describedby', statusId);
    var startInput = field(form, id + '_start', '起点（秒）', 'number', { min: String(offset), step: 'any', inputmode: 'decimal' });
    var durationInput = field(form, id + '_duration', '时长（秒，≤20）', 'number', { min: '0.1', max: String(MAX_WINDOW_SECONDS), step: 'any', inputmode: 'decimal' });
    startInput.value = String(offset);
    durationInput.value = String(DEFAULT_DURATION);
    var decodeButton = el('button', 'cvr-decoder__button', '译码');
    decodeButton.type = 'submit';
    form.appendChild(decodeButton);
    root.appendChild(form);
    return { form: form, startInput: startInput, durationInput: durationInput, decodeButton: decodeButton };
  }

  function buildDom(root, id, src, offset) {
    root.appendChild(el('span', 'cvr-decoder__eyebrow', 'CVR / DECODER'));
    var loader = buildLoader(root, id, src);

    var status = el('p', 'cvr-decoder__status', '请载入一段录音。');
    status.id = id + '_status';
    status.setAttribute('aria-live', 'polite');
    root.appendChild(status);

    var canvas = el('canvas', 'cvr-decoder__canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '译码仪频谱图，尚未载入录音');
    canvas.hidden = true;
    root.appendChild(canvas);

    var windowForm = buildWindowForm(root, id, status.id, offset);
    return {
      fileInput: loader.fileInput,
      archiveButton: loader.archiveButton,
      status: status,
      canvas: canvas,
      form: windowForm.form,
      startInput: windowForm.startInput,
      durationInput: windowForm.durationInput,
      decodeButton: windowForm.decodeButton
    };
  }

  function setStatus(ctx, message, state) {
    ctx.ui.status.textContent = message;
    if (state) {
      ctx.ui.status.setAttribute('data-state', state);
    } else {
      ctx.ui.status.removeAttribute('data-state');
    }
  }

  function setBusy(ctx, busy) {
    ctx.ui.decodeButton.disabled = busy;
    ctx.root.setAttribute('aria-busy', String(busy));
  }

  // Song time shown to the reader = time inside the loaded file + its offset.
  function songTime(ctx, fileSeconds) {
    return fileSeconds + ctx.offset;
  }

  function sizeCanvas(ctx) {
    var canvas = ctx.ui.canvas;
    var cssWidth = Math.max(240, canvas.parentNode.clientWidth || ctx.root.clientWidth);
    var cssHeight = Math.max(240, Math.round(cssWidth * 0.4));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g: g, width: cssWidth, height: cssHeight };
  }

  function drawFrequencyAxis(g, info, box) {
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (var f = 0; f <= info.displayMax + 1e-6; f += 2000) {
      var fy = Math.round(box.top + box.h - f / info.displayMax * box.h) + 0.5;
      g.beginPath();
      g.moveTo(box.left - 5, fy);
      g.lineTo(box.left, fy);
      g.stroke();
      var textY = Math.min(Math.max(fy, box.top + 7), box.top + box.h - 7);
      g.fillText(f === 0 ? '0' : f / 1000 + ' kHz', box.left - 8, textY);
    }
  }

  // Ticks are labelled in song time (info.start already includes the offset).
  function drawTimeAxis(g, info, box, cssWidth) {
    var step = niceTimeStep(info.seconds, box.w);
    g.textBaseline = 'top';
    var first = Math.ceil(info.start / step - 1e-9) * step;
    for (var t = first; t <= info.start + info.seconds + 1e-9; t += step) {
      var tx = Math.round(box.left + (t - info.start) / info.seconds * box.w) + 0.5;
      g.beginPath();
      g.moveTo(tx, box.top + box.h);
      g.lineTo(tx, box.top + box.h + 5);
      g.stroke();
      g.textAlign = tx > cssWidth - 24 ? 'right' : 'center';
      g.fillText(formatSeconds(t) + ' s', tx, box.top + box.h + 8);
    }
  }

  function draw(ctx) {
    if (!ctx.plot) return;
    var surface = sizeCanvas(ctx);
    var g = surface.g;
    g.fillStyle = '#050806';
    g.fillRect(0, 0, surface.width, surface.height);

    var box = { left: 56, top: 8 };
    box.w = surface.width - box.left - 12;
    box.h = surface.height - box.top - 28;
    g.imageSmoothingEnabled = true;
    g.drawImage(ctx.plot, box.left, box.top, box.w, box.h);

    g.strokeStyle = '#9ff0c0';
    g.fillStyle = '#9ff0c0';
    g.lineWidth = 1;
    g.font = '12px "JetBrains Mono", Consolas, monospace';
    g.beginPath();
    g.moveTo(box.left - 0.5, box.top);
    g.lineTo(box.left - 0.5, box.top + box.h + 0.5);
    g.lineTo(box.left + box.w, box.top + box.h + 0.5);
    g.stroke();
    drawFrequencyAxis(g, ctx.plotInfo, box);
    drawTimeAxis(g, ctx.plotInfo, box, surface.width);
  }

  function describeCanvas(ctx) {
    var info = ctx.plotInfo;
    ctx.ui.canvas.setAttribute('aria-label', '译码仪频谱图：' + ctx.audioName + '，' +
      formatSeconds(info.start) + ' 至 ' + formatSeconds(info.start + info.seconds) +
      ' 秒，频率 0 至 ' + Math.round(info.displayMax) + ' Hz');
  }

  // Returns { start, duration } in song time, or null after reporting the problem.
  function readWindow(ctx) {
    var start = parseFloat(ctx.ui.startInput.value);
    var duration = parseFloat(ctx.ui.durationInput.value);
    var end = songTime(ctx, ctx.audio.duration);
    if (!isFinite(start) || !isFinite(duration)) {
      setStatus(ctx, '请填写有效的起点和时长（数字）。', 'error');
      return null;
    }
    if (start < ctx.offset || start >= end) {
      setStatus(ctx, '起点超出录音范围：这段录音是 ' + formatSeconds(ctx.offset) + ' 至 ' + formatSeconds(end) +
        ' 秒（总长 ' + formatSeconds(end) + ' 秒）。', 'error');
      return null;
    }
    if (duration <= 0) {
      setStatus(ctx, '时长必须大于 0 秒。', 'error');
      return null;
    }
    if (duration > MAX_WINDOW_SECONDS) {
      setStatus(ctx, '时长最多 ' + MAX_WINDOW_SECONDS + ' 秒，请缩短后再试。', 'error');
      return null;
    }
    return { start: start, duration: duration };
  }

  function monoSlice(audio, startSample, length) {
    var mono = new Float32Array(length);
    var channels = audio.numberOfChannels;
    for (var c = 0; c < channels; c++) {
      var chan = audio.getChannelData(c);
      for (var i = 0; i < length; i++) mono[i] += chan[startSample + i] / channels;
    }
    return mono;
  }

  function finishJob(ctx, job) {
    ctx.plot = renderPlot(job.db, job.frames, job.bins);
    ctx.plotInfo = { start: job.start, seconds: job.seconds, displayMax: job.displayMax };
    ctx.ui.canvas.hidden = false;
    draw(ctx);
    describeCanvas(ctx);
    setBusy(ctx, false);
    var total = songTime(ctx, ctx.audio.duration);
    var clipped = job.start + job.duration > total + 1e-6;
    setStatus(ctx, '译码完成：' + formatSeconds(job.start) + ' – ' + formatSeconds(job.start + job.seconds) +
      ' 秒（录音总长 ' + formatSeconds(total) + ' 秒）。' +
      (clipped ? '窗口超出录音末尾，已截取到结尾。' : ''));
  }

  // Computes frames in FRAME_BUDGET_MS slices so the page stays responsive.
  function runJob(ctx, job) {
    var re = new Float32Array(FFT_SIZE);
    var im = new Float32Array(FFT_SIZE);
    var next = 0;

    function work() {
      if (job.id !== ctx.job) return;
      var began = performance.now();
      while (next < job.frames && performance.now() - began < FRAME_BUDGET_MS) {
        frameDb(job.mono, next * HOP, job.bins, re, im, job.db, next * job.bins);
        next++;
      }
      if (next < job.frames) {
        setStatus(ctx, '译码中… ' + Math.round(next / job.frames * 100) + '%', 'busy');
        yieldFrame(work);
        return;
      }
      setStatus(ctx, '正在绘制…', 'busy');
      yieldFrame(function () {
        if (job.id === ctx.job) finishJob(ctx, job);
      });
    }
    yieldFrame(work);
  }

  function analyze(ctx) {
    if (!ctx.audio) {
      setStatus(ctx, '请先载入一段录音，再点击“译码”。', 'error');
      return;
    }
    var win = readWindow(ctx);
    if (!win) return;

    var audio = ctx.audio;
    var sr = audio.sampleRate;
    var startSample = Math.floor((win.start - ctx.offset) * sr);
    var endSample = Math.min(audio.length, Math.floor((win.start - ctx.offset + win.duration) * sr));
    var length = endSample - startSample;
    var frames = frameCount(length);
    if (frames < 1) {
      setStatus(ctx, '选取的时间窗口太短，无法译码，请加大时长。', 'error');
      return;
    }

    var bins = Math.min(FFT_SIZE / 2, Math.floor(Math.min(ctx.maxFreq, sr / 2) / sr * FFT_SIZE) + 1);
    var job = {
      id: ++ctx.job,
      start: win.start,
      duration: win.duration,
      seconds: length / sr,
      mono: monoSlice(audio, startSample, length),
      frames: frames,
      bins: bins,
      db: new Float32Array(frames * bins),
      displayMax: (bins - 1) * sr / FFT_SIZE
    };
    setBusy(ctx, true);
    setStatus(ctx, '译码中… 0%', 'busy');
    runJob(ctx, job);
  }

  function tooLarge(ctx, bytes) {
    if (bytes <= MAX_FILE_BYTES) return false;
    setBusy(ctx, false);
    setStatus(ctx, '文件太大（超过 ' + Math.round(MAX_FILE_BYTES / 1048576) + ' MB），请换一段更短的录音。', 'error');
    return true;
  }

  // Both load controls stay disabled from the start of a load until its decode settles.
  function setLoading(ctx, loading) {
    ctx.ui.fileInput.disabled = loading;
    if (ctx.ui.archiveButton) ctx.ui.archiveButton.disabled = loading;
  }

  // Each load gets a new id; results of an older load are ignored.
  function beginLoad(ctx) {
    ctx.load += 1;
    setLoading(ctx, true);
    return ctx.load;
  }

  function isStale(ctx, loadId) {
    return loadId !== ctx.load;
  }

  // Drops the loaded recording and any spectrogram drawn from it (also cancels a running job).
  function clearAudio(ctx) {
    ctx.audio = null;
    ctx.job++;
    ctx.plot = null;
    ctx.plotInfo = null;
    ctx.ui.canvas.hidden = true;
    ctx.ui.canvas.setAttribute('aria-label', '译码仪频谱图，尚未载入录音');
    setBusy(ctx, false);
  }

  function applyDecoded(ctx, decoded, name, offset) {
    ctx.audio = decoded;
    ctx.audioName = name;
    ctx.offset = offset;
    ctx.job++;
    ctx.plot = null;
    ctx.ui.canvas.hidden = true;
    ctx.ui.startInput.value = String(offset);
    ctx.ui.startInput.min = String(offset);
    ctx.ui.startInput.max = String(songTime(ctx, decoded.duration));
    ctx.ui.durationInput.value = String(Math.min(DEFAULT_DURATION, Math.floor(decoded.duration * 100) / 100) || DEFAULT_DURATION);
    setStatus(ctx, '已载入“' + name + '”，总时长 ' + formatSeconds(songTime(ctx, decoded.duration)) + ' 秒。', 'busy');
    analyze(ctx);
  }

  // offset: song time (seconds) at which this recording starts.
  function useBuffer(ctx, arrayBuffer, name, offset, loadId) {
    setBusy(ctx, false);
    if (tooLarge(ctx, arrayBuffer.byteLength)) {
      setLoading(ctx, false);
      return Promise.resolve();
    }
    setStatus(ctx, '正在解码音频…', 'busy');
    return decodeAudio(arrayBuffer).then(function (decoded) {
      if (isStale(ctx, loadId)) return;
      setLoading(ctx, false);
      applyDecoded(ctx, decoded, name, offset);
    }, function () {
      if (isStale(ctx, loadId)) return;
      setLoading(ctx, false);
      clearAudio(ctx);
      setStatus(ctx, '无法解码这个文件，请换一个浏览器支持的音频格式（如 MP3、WAV、M4A、OGG）。', 'error');
    });
  }

  // A reader's own file is a whole recording: its times start at 0.
  function loadFile(ctx) {
    var file = ctx.ui.fileInput.files && ctx.ui.fileInput.files[0];
    if (!file || tooLarge(ctx, file.size)) return;
    var loadId = beginLoad(ctx);
    readFile(file).then(function (buffer) {
      if (isStale(ctx, loadId)) return;
      return useBuffer(ctx, buffer, file.name, 0, loadId);
    }, function () {
      if (isStale(ctx, loadId)) return;
      setLoading(ctx, false);
      setStatus(ctx, '读取文件失败，请重新选择。', 'error');
    });
  }

  // The archive recording may be a trimmed excerpt: data-time-offset says where it starts in the song.
  function loadArchive(ctx) {
    var loadId = beginLoad(ctx);
    setStatus(ctx, '正在载入存档录音…', 'busy');
    fetch(ctx.src).then(function (response) {
      if (!response.ok) throw new Error('http ' + response.status);
      return response.arrayBuffer();
    }).then(function (buffer) {
      if (isStale(ctx, loadId)) return;
      return useBuffer(ctx, buffer, ctx.src.split('/').pop() || ctx.src, ctx.archiveOffset, loadId);
    }, function () {
      if (isStale(ctx, loadId)) return;
      setLoading(ctx, false);
      setStatus(ctx, '存档录音载入失败，请检查网络后重试，或改用“载入录音文件”。', 'error');
    });
  }

  function bindEvents(ctx) {
    var resizeTimer = 0;
    ctx.ui.fileInput.addEventListener('change', function () { loadFile(ctx); });
    if (ctx.ui.archiveButton) {
      ctx.ui.archiveButton.addEventListener('click', function () { loadArchive(ctx); });
    }
    ctx.ui.form.addEventListener('submit', function (event) {
      event.preventDefault();
      analyze(ctx);
    });
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () { draw(ctx); }, 150);
    });
  }

  // Markup: <div class="cvr-decoder" data-src="/audio/x.mp3" data-max-freq="12000" data-time-offset="240">.
  // data-time-offset (seconds, default 0) is added to every time shown or entered for the archive
  // recording, so a trimmed excerpt still reads in song time.
  function init(root) {
    if (root.getAttribute('data-cvr-ready')) return;
    root.setAttribute('data-cvr-ready', 'true');
    uid += 1;
    var src = root.getAttribute('data-src');
    var maxFreqAttr = parseFloat(root.getAttribute('data-max-freq'));
    var offsetAttr = parseFloat(root.getAttribute('data-time-offset'));
    var archiveOffset = isFinite(offsetAttr) && offsetAttr > 0 ? offsetAttr : 0;
    var ctx = {
      root: root,
      src: src,
      maxFreq: maxFreqAttr > 0 ? maxFreqAttr : DEFAULT_MAX_FREQ,
      archiveOffset: archiveOffset,
      offset: archiveOffset,
      ui: buildDom(root, 'cvr_decoder_' + uid, src, archiveOffset),
      audio: null,
      audioName: '',
      job: 0,
      load: 0,
      plot: null,
      plotInfo: null
    };
    bindEvents(ctx);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { fft: fft, frameDb: frameDb, frameCount: frameCount, FFT_SIZE: FFT_SIZE, HOP: HOP };
  }

  if (typeof document !== 'undefined') {
    Array.prototype.forEach.call(document.querySelectorAll('.cvr-decoder'), init);
  }
})();
