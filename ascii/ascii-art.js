/*
 * <ascii-art>: an animated ascii piece, as one tag — a local build of
 * ascii.rest's element (MIT © @bas3line, https://github.com/bas3line/ascii,
 * from ascii.rest@0.4.0). Four changes from the upstream file:
 *
 *   1. the box-drawing font is served from this site (fonts/ascii-rest-mono.woff2)
 *      instead of ascii.rest, so a 苍绿之眼 page needs no third-party host;
 *   2. the piece list is not bundled: every piece here is loaded by URL with
 *      `src`, and only `mount.js` is imported, not the 218 library pieces;
 *   3. <ascii-banner> is not included; the site has no use for it;
 *   4. `motion`, below, so a page can offer a play control of its own.
 *
 * Attributes (unchanged):
 *   piece    a library piece's name (none are bundled here, see 2)
 *   src      the URL of a piece module: its default export, or the module itself
 *   fps      overrides the piece's frame rate
 *   options  JSON overriding the piece's option defaults: '{"text":"hello"}'
 *   label    what the picture shows, for screen readers; the piece's name otherwise
 *   mono     draws a coloured piece as text in one ink, like any other
 *   motion   plays even when the reader prefers reduced motion. This replaces
 *            the still a reader would otherwise get; taking it away is what a
 *            page uses to stop a piece (see js/cloak-ascii.js).
 *
 * Text pieces draw into a <pre> in the element's colour and font size; the
 * coloured ones draw onto a <canvas> as wide as the element. Whatever the
 * element holds before it loads (a first frame, a <noscript> still) stays until
 * the piece is ready.
 *
 *   <script type="module" src="/ascii/ascii-art.js"></script>
 *   <ascii-art src="/ascii-cloak/eye.js"></ascii-art>
 */
import { mount, pieceIn } from "./mount.js";

// :where gives these no specificity, so any rule of the page's own wins. Where
// the system monospace face lacks the box drawing and block glyphs (Android's
// has none), they come from the 3 KB cut of JetBrains Mono beside this file,
// one cell wide like the rest, so every row keeps its width.
const STYLE =
  '@font-face{font-family:"ascii.rest mono";src:url(../fonts/ascii-rest-mono.woff2) format("woff2");unicode-range:U+00B0,U+00B7,U+2022,U+2500-259F,U+25CF;font-display:swap}' +
  ":where(ascii-art){display:block}:where(ascii-art>pre){margin:0;font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,\"Liberation Mono\",\"ascii.rest mono\",monospace;line-height:1.2;letter-spacing:0;white-space:pre;font-variant-ligatures:none}";

// On a server there is no HTMLElement to extend; the class is never used there.
const Base = typeof HTMLElement === "undefined" ? class {} : HTMLElement;

// One start for any number of changes in a row, such as every attribute's as
// the tag upgrades, a microtask later.
const queued = new WeakSet();
const soon = (el, start) => {
  if (queued.has(el)) return;
  queued.add(el);
  queueMicrotask(() => {
    queued.delete(el);
    if (el.isConnected) start();
  });
};

export class AsciiArt extends Base {
  static observedAttributes = ["piece", "src", "fps", "options", "label", "mono", "motion"];
  #stop = null;
  #mounted = 0;
  #run = 0;
  #motion = false;

  connectedCallback() {
    this.#motion = this.hasAttribute("motion");
    soon(this, () => this.#start());
  }

  disconnectedCallback() {
    this.#run++;
    this.#stop?.();
    this.#stop = null;
  }

  attributeChangedCallback(name) {
    if (!this.isConnected) return;
    // mount() decides once, when it starts, whether a piece runs: a mounted
    // piece is held still or moves for good. So a change of `motion` mounts it
    // again; every other attribute restarts it, as upstream does.
    if (name === "motion") {
      // A tag whose own <script> set `motion` before it was upgraded (before
      // customElements.define ran) has not mounted with it yet, so that change
      // must not be skipped.
      const mounted = this.#mounted > 0;
      const motion = this.hasAttribute("motion");
      if (mounted && motion === this.#motion) return;
      // Remembered now, not when the restart happens: that waits a microtask,
      // and a second change in the same turn must see this one.
      this.#motion = motion;
    }
    soon(this, () => this.#start());
  }

  async #start() {
    const run = ++this.#run;
    const src = this.getAttribute("src");
    let piece;
    let options;
    try {
      if (src) piece = pieceIn(await import(new URL(src, document.baseURI).href), src);
      else return; // no piece list is bundled: without src there is nothing to play
      options = JSON.parse(this.getAttribute("options") || "{}");
    } catch (error) {
      console.warn(`<ascii-art> could not load ${src}:`, error);
      return;
    }
    // Another attribute change, or removal, while this one loaded.
    if (run !== this.#run) return;

    const fps = this.getAttribute("fps");
    if (fps !== null && fps !== "" && !Number.isNaN(+fps)) options.fps = +fps;
    // mount() holds a piece still for reduced motion unless told to move.
    if (this.hasAttribute("motion")) options.motion = true;

    const el = document.createElement(piece.meta.palette && !this.hasAttribute("mono") ? "canvas" : "pre");
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", this.getAttribute("label") || piece.meta.name);
    this.#stop?.();
    this.replaceChildren(el);
    this.#motion = this.hasAttribute("motion");
    this.#mounted++;
    this.#stop = mount(el, piece, options);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("ascii-art")) {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);
  customElements.define("ascii-art", AsciiArt);
}
