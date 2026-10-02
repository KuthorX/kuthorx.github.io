// 苍绿之眼 HUE 旋钮: an in-story band-pass hue filter over an image.
// Markup: <div class="cloak-hue" data-src="/images/....webp" data-band="24" data-alt="一张全息照片"></div>
// Optional: data-start="0" (initial hue, degrees).
(function () {
  var DEFAULT_BAND = 24;
  var BUTTON_STEP = 5;
  var CHROMA_MIN = 0.06; // below this a pixel has no usable hue and is never kept
  var DIM_BASE = 36; // out-of-band pixels become grey at roughly 15-20% lightness
  var DIM_SLOPE = 0.06;
  var STATUS_DELAY_MS = 250;
  var PLACEHOLDER_RATIO = 0.58;
  // Machado, Oliveira & Fernandes (2009), deuteranopia, severity 1.0, applied in linear RGB.
  var DEUTAN = [
    0.367322, 0.860646, -0.227968,
    0.280085, 0.672501, 0.047413,
    -0.011820, 0.042940, 0.968881
  ];
  var ENCODE_SIZE = 4096;

  var toLinear = null;
  var toSrgb = null;

  function gammaTables() {
    if (toLinear) return;
    toLinear = new Float32Array(256);
    toSrgb = new Uint8ClampedArray(ENCODE_SIZE + 1);
    var i;
    for (i = 0; i < 256; i++) {
      var s = i / 255;
      toLinear[i] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }
    for (i = 0; i <= ENCODE_SIZE; i++) {
      var l = i / ENCODE_SIZE;
      toSrgb[i] = Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055));
    }
  }

  function encode(value) {
    var index = Math.round(value * ENCODE_SIZE);
    return toSrgb[index < 0 ? 0 : index > ENCODE_SIZE ? ENCODE_SIZE : index];
  }

  function wrapHue(value) {
    return ((Math.round(value) % 360) + 360) % 360;
  }

  // Per-pixel analysis, done once per image: hue (or -1 when achromatic) and the dimmed grey.
  function analyse(data, count) {
    var hue = new Float32Array(count);
    var grey = new Uint8ClampedArray(count);
    for (var i = 0, p = 0; i < count; i++, p += 4) {
      var r = data[p];
      var g = data[p + 1];
      var b = data[p + 2];
      var max = r > g ? (r > b ? r : b) : (g > b ? g : b);
      var min = r < g ? (r < b ? r : b) : (g < b ? g : b);
      var chroma = max - min;
      var luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      var dim = DIM_BASE + DIM_SLOPE * luma;
      grey[i] = Math.round(luma < dim ? luma : dim);
      if (chroma < CHROMA_MIN * 255) {
        hue[i] = -1;
        continue;
      }
      var h;
      if (max === r) h = ((g - b) / chroma) % 6;
      else if (max === g) h = (b - r) / chroma + 2;
      else h = (r - g) / chroma + 4;
      h *= 60;
      hue[i] = h < 0 ? h + 360 : h;
    }
    return { hue: hue, grey: grey };
  }

  function deuteranopia(data, count) {
    gammaTables();
    var out = new Uint8ClampedArray(count * 4);
    var m = DEUTAN;
    for (var p = 0; p < count * 4; p += 4) {
      var r = toLinear[data[p]];
      var g = toLinear[data[p + 1]];
      var b = toLinear[data[p + 2]];
      out[p] = encode(m[0] * r + m[1] * g + m[2] * b);
      out[p + 1] = encode(m[3] * r + m[4] * g + m[5] * b);
      out[p + 2] = encode(m[6] * r + m[7] * g + m[8] * b);
      out[p + 3] = 255;
    }
    return out;
  }

  var uid = 0;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(label, text) {
    var node = el('button', 'cloak-hue__step', text);
    node.type = 'button';
    node.setAttribute('aria-label', label);
    node.disabled = true;
    return node;
  }

  function buildDial(id, current) {
    var dial = el('div', 'cloak-hue__row cloak-hue__dial');
    var label = el('label', 'cloak-hue__label', '色相 HUE');
    label.setAttribute('for', id + '_range');
    var minus = button('色相减少 ' + BUTTON_STEP + '°', '−');
    var range = el('input', 'cloak-hue__range');
    range.type = 'range';
    range.id = id + '_range';
    range.min = '0';
    range.max = '359';
    range.step = '1';
    range.value = String(current);
    range.disabled = true;
    var plus = button('色相增加 ' + BUTTON_STEP + '°', '+');
    var readout = el('output', 'cloak-hue__readout');
    readout.setAttribute('for', range.id);
    readout.setAttribute('aria-hidden', 'true');
    [label, minus, range, plus, readout].forEach(function (node) { dial.appendChild(node); });
    return { dial: dial, minus: minus, range: range, plus: plus, readout: readout };
  }

  function buildToggle() {
    var toggleRow = el('div', 'cloak-hue__row');
    var toggleLabel = el('label', 'cloak-hue__toggle');
    var toggle = el('input', 'cloak-hue__checkbox');
    toggle.type = 'checkbox';
    toggle.disabled = true;
    toggleLabel.appendChild(toggle);
    toggleLabel.appendChild(document.createTextNode('色盲模拟（红绿）'));
    toggleRow.appendChild(toggleLabel);
    return { row: toggleRow, toggle: toggle };
  }

  function buildDom(root, id, alt, current) {
    root.setAttribute('role', 'group');
    root.setAttribute('aria-labelledby', id + '_title');
    var title = el('span', 'cloak-hue__eyebrow', 'HUE / 色相旋钮');
    title.id = id + '_title';
    root.appendChild(title);

    var frame = el('div', 'cloak-hue__frame');
    var canvas = el('canvas', 'cloak-hue__canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', alt + '（正在载入）');
    frame.appendChild(canvas);
    root.appendChild(frame);

    var dial = buildDial(id, current);
    root.appendChild(dial.dial);
    var toggle = buildToggle();
    root.appendChild(toggle.row);

    var status = el('p', 'cloak-hue__status', '正在载入图片…');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('data-state', 'busy');
    root.appendChild(status);

    return {
      frame: frame,
      canvas: canvas,
      minus: dial.minus,
      range: dial.range,
      plus: dial.plus,
      readout: dial.readout,
      toggle: toggle.toggle,
      status: status
    };
  }

  function describe(ctx) {
    return '当前色相 ' + ctx.current + '°' + (ctx.ui.toggle.checked ? '，红绿色盲模拟已开启' : '');
  }

  function setStatus(ctx, message, state) {
    ctx.ui.status.textContent = message;
    if (state) ctx.ui.status.setAttribute('data-state', state);
    else ctx.ui.status.removeAttribute('data-state');
  }

  function syncControls(ctx) {
    var current = ctx.current;
    ctx.ui.range.value = String(current);
    ctx.ui.range.setAttribute('aria-valuetext', current + '°');
    ctx.ui.readout.textContent = current + '°';
    ctx.root.style.setProperty('--hue-now', String(current));
  }

  function draw(ctx) {
    var source = ctx.source;
    if (!source) return;
    var canvas = ctx.ui.canvas;
    var cssWidth = Math.max(160, ctx.ui.frame.clientWidth || ctx.root.clientWidth);
    var cssHeight = Math.round(cssWidth * source.height / source.width);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.min(Math.round(cssWidth * dpr), source.width);
    var height = Math.round(width * source.height / source.width);
    canvas.style.height = cssHeight + 'px';
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    var g = canvas.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(source.canvas, 0, 0, width, height);
    canvas.setAttribute('aria-label', ctx.alt + '（色相滤镜 ' + ctx.current + '°，只显示相近色相' +
      (ctx.ui.toggle.checked ? '，红绿色盲模拟' : '') + '）');
  }

  // Band-pass: pixels within ±band/2 of the current hue keep their colour, the rest turn dim grey.
  function render(ctx) {
    ctx.framePending = false;
    var source = ctx.source;
    if (!source) return;
    var count = source.width * source.height;
    var colours = ctx.ui.toggle.checked ? (source.deutan || (source.deutan = deuteranopia(source.data, count))) : source.data;
    var hue = source.hue;
    var grey = source.grey;
    var out = source.buffer.data;
    var current = ctx.current;
    var half = ctx.half;
    for (var i = 0, p = 0; i < count; i++, p += 4) {
      var h = hue[i];
      var d = Math.abs(h - current);
      if (d > 180) d = 360 - d;
      if (h >= 0 && d <= half) {
        out[p] = colours[p];
        out[p + 1] = colours[p + 1];
        out[p + 2] = colours[p + 2];
      } else {
        out[p] = out[p + 1] = out[p + 2] = grey[i];
      }
      out[p + 3] = 255;
    }
    source.canvas.getContext('2d').putImageData(source.buffer, 0, 0);
    draw(ctx);
  }

  function schedule(ctx) {
    if (ctx.framePending) return;
    ctx.framePending = true;
    window.requestAnimationFrame(function () { render(ctx); });
  }

  function announce(ctx) {
    window.clearTimeout(ctx.statusTimer);
    ctx.statusTimer = window.setTimeout(function () { setStatus(ctx, describe(ctx)); }, STATUS_DELAY_MS);
  }

  function setHue(ctx, value) {
    ctx.current = wrapHue(value);
    syncControls(ctx);
    schedule(ctx);
    announce(ctx);
  }

  function fail(ctx, message) {
    ctx.source = null;
    ctx.ui.canvas.hidden = true;
    ctx.ui.frame.classList.remove('is-loading');
    setStatus(ctx, message, 'error');
  }

  // Reads the image pixels once; returns null (after reporting) when that is impossible.
  function readSource(ctx, image) {
    var width = image.naturalWidth;
    var height = image.naturalHeight;
    if (!width || !height) {
      fail(ctx, '图片是空的，无法转动色相。');
      return null;
    }
    var work = document.createElement('canvas');
    work.width = width;
    work.height = height;
    var g = work.getContext('2d');
    var pixels;
    try {
      g.drawImage(image, 0, 0);
      pixels = g.getImageData(0, 0, width, height);
    } catch (error) {
      fail(ctx, '浏览器不允许读取这张图片的像素，色相旋钮无法工作。');
      return null;
    }
    var analysis = analyse(pixels.data, width * height);
    return {
      width: width,
      height: height,
      data: pixels.data,
      hue: analysis.hue,
      grey: analysis.grey,
      deutan: null,
      buffer: g.createImageData(width, height),
      canvas: work
    };
  }

  function enable(ctx) {
    var ui = ctx.ui;
    ui.frame.classList.remove('is-loading');
    ui.frame.style.removeProperty('aspect-ratio');
    ui.range.disabled = false;
    ui.minus.disabled = false;
    ui.plus.disabled = false;
    ui.toggle.disabled = false;
  }

  function load(ctx) {
    if (!ctx.src) {
      fail(ctx, '没有指定图片（缺少 data-src）。');
      return;
    }
    var image = new Image();
    image.decoding = 'async';
    image.onload = function () {
      var source = readSource(ctx, image);
      if (!source) return;
      ctx.source = source;
      enable(ctx);
      syncControls(ctx);
      render(ctx);
      setStatus(ctx, describe(ctx) + '。拖动滑块，或用方向键转动。');
    };
    image.onerror = function () {
      fail(ctx, '图片载入失败，请检查网络后刷新页面重试。');
    };
    image.src = ctx.src;
  }

  function bindEvents(ctx) {
    var ui = ctx.ui;
    var resizeTimer = 0;
    ui.range.addEventListener('input', function () { setHue(ctx, parseFloat(ui.range.value)); });
    ui.minus.addEventListener('click', function () { setHue(ctx, ctx.current - BUTTON_STEP); });
    ui.plus.addEventListener('click', function () { setHue(ctx, ctx.current + BUTTON_STEP); });
    ui.toggle.addEventListener('change', function () {
      schedule(ctx);
      announce(ctx);
    });
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () { draw(ctx); }, 150);
    });
  }

  function init(root) {
    if (root.getAttribute('data-hue-ready')) return;
    root.setAttribute('data-hue-ready', 'true');
    uid += 1;
    var alt = root.getAttribute('data-alt') || '一张图片';
    var bandAttr = parseFloat(root.getAttribute('data-band'));
    var band = bandAttr > 0 && bandAttr <= 360 ? bandAttr : DEFAULT_BAND;
    var startAttr = parseFloat(root.getAttribute('data-start'));
    var current = isFinite(startAttr) ? wrapHue(startAttr) : 0;
    var ctx = {
      root: root,
      src: root.getAttribute('data-src') || '',
      alt: alt,
      half: band / 2,
      current: current,
      ui: buildDom(root, 'cloak_hue_' + uid, alt, current),
      source: null, // { width, height, data, hue, grey, deutan, buffer, canvas }
      framePending: false,
      statusTimer: 0
    };

    bindEvents(ctx);
    ctx.ui.frame.classList.add('is-loading');
    ctx.ui.frame.style.aspectRatio = String(1 / PLACEHOLDER_RATIO);
    syncControls(ctx);
    load(ctx);
  }

  Array.prototype.forEach.call(document.querySelectorAll('.cloak-hue'), init);
})();
