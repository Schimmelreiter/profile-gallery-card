/*
 * Profile Gallery Card for Home Assistant
 * Profiles, contacts and calendar events with pictures – as list, grid or one card to browse.
 * https://github.com/Schimmelreiter/profile-gallery-card · GPL-3.0
 */
const PGC_VERSION = '0.1.0';
const ITEM_FORMAT = 1; // version of the normalized item format (see README)

// ---------- helpers ----------
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
const IMG_RE = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)|googleusercontent\.com|\/image|=s\d+/i;

// value at a dotted path; "*" maps over arrays: "phones.*.value"
function getPath(obj, path) {
  if (path == null || path === '') return undefined;
  const parts = String(path).split('.');
  let cur = [obj], many = false;
  for (const p of parts) {
    const next = [];
    for (const c of cur) {
      if (c == null) continue;
      if (p === '*') { if (Array.isArray(c)) { next.push(...c); many = true; } continue; }
      next.push(Array.isArray(c) && /^\d+$/.test(p) ? c[+p] : c[p]);
    }
    cur = next;
  }
  return many ? cur.filter((x) => x != null && x !== '') : cur[0];
}
const asText = (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== '').map(asText).join(', ') : v == null ? '' : isObj(v) ? (v.value ?? v.name ?? '') : String(v));
// field spec: path ("name"), format with {path} placeholders ("{city} · {organization}") or list of specs
function field(item, spec) {
  if (spec == null) return '';
  if (Array.isArray(spec)) return spec.map((s) => field(item, s));
  if (typeof spec !== 'string') return spec;
  if (spec.includes('{')) {
    // parts separated by " · " vanish when all their placeholders are empty
    return spec.split(' · ').map((part) => {
      let any = false;
      const out = part.replace(/\{([^}]+)\}/g, (_, p) => { const t = asText(getPath(item, p.trim())); if (t) any = true; return t; });
      return /\{/.test(part) && !any ? '' : out.trim();
    }).filter(Boolean).join(' · ');
  }
  return getPath(item, spec);
}
const fmtDate = (v, lang) => {
  if (!v) return '';
  const s = String(v);
  if (/^--\d\d-\d\d$/.test(s)) return new Date(`2000-${s.slice(2)}T12:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long' });
  const d = new Date(/^\d{4}-\d\d-\d\d$/.test(s) ? s + 'T12:00' : s);
  if (isNaN(d)) return s;
  const dateOnly = /^\d{4}-\d\d-\d\d$/.test(s) || (/T00:00(:00)?/.test(s) && !/Z$/.test(s));
  return dateOnly ? d.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
    : d.toLocaleString(lang, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ---------- presets (field mappings for known data) ----------
const PRESETS = {
  // item format v1 as is
  none: { title: 'title', subtitle: 'subtitle', image: 'image', images: 'images', url: 'url', text: 'text', badges: 'badges', lines: 'lines', date: 'date' },
  swinger_companion: {
    title: 'name', image: 'thumb', images: 'pics', url: 'profiles.0.url',
    subtitle: '{last_meet.where} · {last_meet.club}', date: 'last_meet.at', text: 'notes',
    badges: ['status', 'profiles.*.pf'],
  },
  nutten_scan: {
    title: 'name', image: 'bild', images: 'bilder', url: 'url', subtitle: '{haus} · {seite}',
    date: 'besucht_am', text: 'kommentar', badges: ['status', 'alter'],
  },
  google_contacts: {
    title: 'name', image: 'image', url: 'url', subtitle: '{organization} · {city}',
    lines: ['phones.*.value', 'emails.*.value'], badges: ['groups.*'], date: 'birthday', text: 'note',
  },
  calendar: { title: 'summary', subtitle: '{location}', date: 'start', text: 'text', image: 'image', images: 'images', url: 'link' },
};

// raw object → normalized item { v, id, title, subtitle, image, images[], url, text, badges[], lines[], date }
function normalize(raw, fields, idx) {
  const imagesV = field(raw, fields.images);
  let images = (Array.isArray(imagesV) ? imagesV : imagesV ? [imagesV] : []).map((x) => (isObj(x) ? x.url || x.src || '' : String(x || ''))).filter(Boolean);
  const image = asText(field(raw, fields.image)) || images[0] || '';
  if (image && !images.includes(image)) images = [image, ...images];
  const badges = [].concat(field(raw, fields.badges) || []).flat().map(asText).filter(Boolean);
  const lines = [].concat(field(raw, fields.lines) || []).map(asText).filter(Boolean);
  return {
    v: ITEM_FORMAT,
    id: asText(field(raw, fields.id || 'id')) || String(idx),
    title: asText(field(raw, fields.title)) || '–',
    subtitle: asText(field(raw, fields.subtitle)),
    image, images,
    url: asText(field(raw, fields.url)),
    text: asText(field(raw, fields.text)),
    badges, lines,
    date: asText(field(raw, fields.date)),
    raw,
  };
}

// calendar event → object with image/link taken from the description
function calendarObj(ev) {
  const desc = String(ev.description || '');
  const urls = desc.match(URL_RE) || [];
  const images = urls.filter((u) => IMG_RE.test(u));
  return {
    uid: ev.uid, summary: ev.summary, location: ev.location || '',
    start: (ev.start && (ev.start.dateTime || ev.start.date)) || ev.start || '',
    end: (ev.end && (ev.end.dateTime || ev.end.date)) || ev.end || '',
    image: images[0] || '', images, link: urls.find((u) => !images.includes(u)) || '',
    text: desc.replace(URL_RE, '').trim(),
  };
}

const globRe = (g) => new RegExp('^' + String(g).split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

// ---------- the card ----------
class ProfileGalleryCard extends HTMLElement {
  static getConfigElement() { return document.createElement('profile-gallery-card-editor'); }
  static getStubConfig(hass) {
    const s = Object.keys(hass.states).find((e) => Array.isArray((hass.states[e].attributes || {}).contacts));
    return s ? { title: 'Contacts', source: { entity: s, attribute: 'contacts' }, preset: 'google_contacts', mode: 'browse', search: true }
      : { title: 'Gallery', source: { entity: '', attribute: '' }, preset: 'none', mode: 'list' };
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._idx = 0; this._img = {}; this._q = ''; this._shown = []; this._sig = ''; this._tplItems = null; this._calItems = null; this._calAt = 0;
  }

  setConfig(config) {
    if (!config || !isObj(config.source)) throw new Error('source is required (entity, entities, calendar or template)');
    const s = config.source;
    if (!s.entity && !s.entities && !s.calendar && !s.template) throw new Error('source needs entity, entities, calendar or template');
    if (config.mode && !['list', 'grid', 'browse'].includes(config.mode)) throw new Error('mode: list, grid or browse');
    const old = this._config;
    this._config = Object.assign({ mode: 'list', preset: s.calendar ? 'calendar' : 'none' }, config);
    this._fields = Object.assign({}, PRESETS[this._config.preset] || {}, this._config.fields || {});
    if (old && JSON.stringify(old.source) !== JSON.stringify(s)) { this._unsub(); this._tplItems = null; this._calItems = null; this._calAt = 0; }
    if (old && JSON.stringify(old) !== JSON.stringify(config)) { this._q = ''; this._idx = 0; this._img = {}; }
    this._sig = '';
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const s = this._config && this._config.source;
    if (!s) return;
    if (s.template && !this._tplUnsub && !this._tplPending) this._subscribeTemplate();
    if (s.calendar && Date.now() - this._calAt > 15 * 60000) this._loadCalendar();
    this._render();
  }

  connectedCallback() { if (this._hass && this._config) { this._sig = ''; this._render(); } }
  disconnectedCallback() { this._unsub(); }
  _unsub() { if (this._tplUnsub) { try { this._tplUnsub(); } catch (e) { /* gone */ } this._tplUnsub = null; } }

  async _subscribeTemplate() {
    this._tplPending = true;
    try {
      this._tplUnsub = await this._hass.connection.subscribeMessage((msg) => {
        let r = msg.result;
        if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = []; } }
        this._tplItems = Array.isArray(r) ? r : [];
        this._sig = ''; this._render();
      }, { type: 'render_template', template: this._config.source.template, strict: false });
    } catch (e) { this._tplItems = []; this._error = 'Template: ' + (e.message || e); }
    this._tplPending = false;
  }

  async _loadCalendar() {
    this._calAt = Date.now();
    const s = this._config.source;
    const days = Number(s.days) || 60, past = Number(s.past_days) || 0;
    const start = new Date(Date.now() - past * 86400000), end = new Date(Date.now() + days * 86400000);
    try {
      const evs = await this._hass.callApi('GET', `calendars/${s.calendar}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
      this._calItems = (evs || []).map(calendarObj);
    } catch (e) { this._calItems = []; this._error = 'Calendar: ' + (e.message || e.error || e); }
    this._sig = ''; this._render();
  }

  _rawItems() {
    const s = this._config.source, h = this._hass;
    if (s.template) return this._tplItems || [];
    if (s.calendar) return this._calItems || [];
    if (s.entities) {
      const list = Array.isArray(s.entities) ? s.entities : [s.entities];
      const ids = Object.keys(h.states).filter((e) => list.some((g) => globRe(g).test(e)));
      return ids.map((e) => Object.assign({ entity_id: e, state: h.states[e].state }, h.states[e].attributes));
    }
    const st = h.states[s.entity];
    if (!st) return [];
    if (!s.attribute) return [Object.assign({ entity_id: s.entity, state: st.state }, st.attributes)];
    const v = getPath(st.attributes, s.attribute);
    return Array.isArray(v) ? v : isObj(v) ? Object.values(v) : [];
  }

  _items() {
    const c = this._config;
    let raw = this._rawItems();
    if (isObj(c.filter)) raw = raw.filter((r) => Object.entries(c.filter).every(([p, want]) => {
      const v = getPath(r, p);
      return Array.isArray(want) ? want.map(String).includes(String(v)) : String(v) === String(want);
    }));
    let items = raw.map((r, i) => normalize(r, this._fields, i));
    if (c.sort) {
      const by = isObj(c.sort) ? c.sort.by : c.sort, desc = isObj(c.sort) && c.sort.desc;
      const key = (it) => { const v = by in it ? it[by] : getPath(it.raw, by); return v == null ? '' : v; };
      items.sort((a, b) => { const x = key(a), y = key(b); const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }); return desc ? -r : r; });
    }
    if (c.limit) items = items.slice(0, Number(c.limit));
    return items;
  }

  getCardSize() { const m = this._config && this._config.mode; return m === 'browse' ? 8 : Math.min(12, 2 + (this._shown || []).length); }
  getGridOptions() { return { columns: 12, min_columns: 4 }; }

  _render() {
    if (!this._config || !this._hass) return;
    const all = this._items();
    const sig = JSON.stringify([all.map((i) => [i.id, i.title, i.subtitle, i.images, i.badges, i.text, i.date, i.lines, i.url]), this._idx, this._img, this._q, this._config]);
    if (sig === this._sig) return;
    this._sig = sig;
    const lang = (this._hass.locale && this._hass.locale.language) || this._hass.language || 'en';
    const c = this._config;
    const q = this._q.trim().toLowerCase();
    const items = q ? all.filter((i) => [i.title, i.subtitle, i.text, ...i.badges, ...i.lines].join(' ').toLowerCase().includes(q)) : all;
    this._shown = items;
    if (this._idx >= items.length) this._idx = Math.max(0, items.length - 1);
    const head = c.title ? `<div class="head">${esc(c.title)}<span class="count">${items.length}</span></div>` : '';
    const tools = (c.search ? `<input class="search" type="search" placeholder="${esc(c.search_placeholder || '🔍')}" value="${esc(this._q)}">` : '');
    let body;
    if (!items.length) body = `<div class="empty">${esc(this._error || c.empty_text || (q ? '–' : 'No entries'))}</div>`;
    else if (c.mode === 'grid') body = `<div class="grid" style="--cols:${Number(c.columns) || 3}">${items.map((it, i) => this._tile(it, i, lang)).join('')}</div>`;
    else if (c.mode === 'browse') body = this._browse(items, lang);
    else body = `<div class="list">${items.map((it, i) => this._row(it, i, lang)).join('')}</div>`;
    const keepFocus = this.shadowRoot.activeElement && this.shadowRoot.activeElement.classList.contains('search');
    const pos = keepFocus ? this.shadowRoot.activeElement.selectionStart : 0;
    this.shadowRoot.innerHTML = `<style>${CSS}</style><ha-card style="--img-h:${Number(c.image_height) || 280}px">${head}${tools ? `<div class="tools">${tools}</div>` : ''}${body}</ha-card>`;
    this._wire();
    if (keepFocus) { const s = this.shadowRoot.querySelector('.search'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }
  }

  _badges(it) { return it.badges.length ? `<div class="badges">${it.badges.map((b) => `<span class="badge">${esc(b)}</span>`).join('')}</div>` : ''; }
  _meta(it, lang) {
    const date = it.date ? `<span class="date">${esc(fmtDate(it.date, lang))}</span>` : '';
    return `${it.subtitle || date ? `<div class="sub">${esc(it.subtitle)}${it.subtitle && date ? ' · ' : ''}${date}</div>` : ''}` +
      it.lines.map((l) => `<div class="line">${esc(l)}</div>`).join('');
  }
  _title(it) { return it.url ? `<a class="title" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a>` : `<span class="title">${esc(it.title)}</span>`; }
  _thumb(it, i, cls) {
    return it.image ? `<img class="${cls}" loading="lazy" src="${esc(it.image)}" data-open="${i}" alt="">`
      : `<div class="${cls} ph">${esc((it.title || '?').trim().charAt(0).toUpperCase())}</div>`;
  }
  _row(it, i, lang) {
    return `<div class="row">${this._thumb(it, i, 'av')}<div class="info">${this._title(it)}${this._meta(it, lang)}${this._badges(it)}` +
      `${it.text && this._config.show_text !== false ? `<div class="text clamp">${esc(it.text)}</div>` : ''}</div>` +
      `${it.images.length > 1 ? `<span class="n" data-open="${i}">${it.images.length} 📷</span>` : ''}</div>`;
  }
  _tile(it, i, lang) {
    return `<div class="tile">${this._thumb(it, i, 'big')}${it.images.length > 1 ? `<span class="n on" data-open="${i}">${it.images.length} 📷</span>` : ''}` +
      `<div class="info">${this._title(it)}${this._meta(it, lang)}${this._badges(it)}</div></div>`;
  }
  _browse(items, lang) {
    const i = this._idx, it = items[i], k = this._img[it.id] || 0, n = it.images.length;
    const pic = n ? `<img class="hero" src="${esc(it.images[Math.min(k, n - 1)])}" data-open="${i}" alt="">` : `<div class="hero ph">${esc(it.title.charAt(0).toUpperCase())}</div>`;
    const dots = n > 1 ? `<div class="dots">${it.images.map((_, j) => `<span class="dot${j === k ? ' on' : ''}" data-img="${j}"></span>`).join('')}</div>` +
      `<button class="ib prev" data-img="${(k - 1 + n) % n}" aria-label="previous picture">‹</button><button class="ib next" data-img="${(k + 1) % n}" aria-label="next picture">›</button>` : '';
    const jump = this._config.jump !== false && items.length > 2
      ? `<select class="jump">${items.map((x, j) => `<option value="${j}"${j === i ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}</select>` : '';
    return `<div class="browse"><div class="stage">${pic}${dots}</div>` +
      `<div class="info binfo">${this._title(it)}${this._meta(it, lang)}${this._badges(it)}${it.text ? `<div class="text">${esc(it.text)}</div>` : ''}</div>` +
      `<div class="nav"><button class="nb" data-go="-1" ${items.length < 2 ? 'disabled' : ''} aria-label="previous">‹</button>` +
      `<span class="ctr">${i + 1}/${items.length}</span>${jump}<button class="nb" data-go="1" ${items.length < 2 ? 'disabled' : ''} aria-label="next">›</button></div></div>`;
  }

  _go(d) { const n = (this._shown || []).length; if (n) { this._idx = (this._idx + d + n) % n; this._render(); } }

  _wire() {
    const r = this.shadowRoot;
    const s = r.querySelector('.search');
    if (s) s.addEventListener('input', () => { this._q = s.value; this._idx = 0; this._render(); });
    r.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => this._go(+b.dataset.go)));
    const j = r.querySelector('.jump');
    if (j) j.addEventListener('change', () => { this._idx = +j.value; this._render(); });
    r.querySelectorAll('[data-img]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); const it = this._shown[this._idx]; this._img[it.id] = +b.dataset.img; this._render();
    }));
    r.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => {
      const it = this._shown[+el.dataset.open]; if (it && it.images.length) this._lightbox(it, this._config.mode === 'browse' ? (this._img[it.id] || 0) : 0);
    }));
    const stage = r.querySelector('.browse');
    if (stage) swipe(stage, (d) => this._go(d));
  }

  _lightbox(it, start) {
    let k = start;
    const box = document.createElement('div');
    box.className = 'pgc-lightbox';
    box.innerHTML = `<style>${LB_CSS}</style><img alt=""><button class="x" aria-label="close">×</button>` +
      (it.images.length > 1 ? '<button class="p" aria-label="previous">‹</button><button class="n" aria-label="next">›</button><span class="c"></span>' : '');
    const img = box.querySelector('img'), ctr = box.querySelector('.c');
    const show = () => { img.src = it.images[k]; if (ctr) ctr.textContent = `${k + 1}/${it.images.length} · ${it.title}`; };
    const go = (d) => { k = (k + d + it.images.length) % it.images.length; show(); };
    const close = () => { box.remove(); document.removeEventListener('keydown', key); };
    const key = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
    box.querySelector('.x').addEventListener('click', close);
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    if (it.images.length > 1) { box.querySelector('.p').addEventListener('click', () => go(-1)); box.querySelector('.n').addEventListener('click', () => go(1)); swipe(box, go); }
    document.addEventListener('keydown', key);
    show();
    document.body.appendChild(box);
  }
}

function swipe(el, cb) {
  let x0 = null, y0 = 0;
  el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { x0 = e.clientX; y0 = e.clientY; } });
  el.addEventListener('pointerup', (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) cb(dx < 0 ? 1 : -1);
  });
}

const CSS = `
ha-card { overflow: hidden; padding-bottom: 8px; }
.head { display: flex; align-items: center; gap: 8px; padding: 16px 16px 8px; font-size: 1.25em; font-weight: 500; }
.count { font-size: .7em; padding: 1px 8px; border-radius: 10px; background: var(--secondary-background-color); color: var(--secondary-text-color); }
.tools { padding: 0 16px 8px; }
.search { width: 100%; box-sizing: border-box; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); font: inherit; }
.empty { padding: 16px; color: var(--secondary-text-color); }
.title { font-weight: 500; color: var(--primary-text-color); text-decoration: none; }
a.title:hover { text-decoration: underline; }
.sub, .line { font-size: .9em; color: var(--secondary-text-color); }
.text { font-size: .9em; margin-top: 6px; white-space: pre-wrap; }
.clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.badge { font-size: .75em; padding: 1px 8px; border-radius: 10px; background: var(--primary-color); color: var(--text-primary-color, #fff); opacity: .85; }
.ph { display: flex; align-items: center; justify-content: center; background: var(--secondary-background-color); color: var(--secondary-text-color); font-size: 2em; }
.list { display: flex; flex-direction: column; }
.row { display: flex; gap: 12px; align-items: flex-start; padding: 8px 16px; border-top: 1px solid var(--divider-color); }
.row:first-child { border-top: 0; }
.av { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; flex: none; cursor: pointer; }
.info { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.n { font-size: .8em; color: var(--secondary-text-color); cursor: pointer; white-space: nowrap; }
.grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 12px; padding: 0 16px; }
@media (max-width: 600px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.tile { position: relative; border-radius: 12px; overflow: hidden; background: var(--secondary-background-color); }
.tile .info { padding: 8px; }
.big { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; display: block; cursor: pointer; }
.big.ph { display: flex; cursor: default; }
.n.on { position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,.55); color: #fff; padding: 1px 6px; border-radius: 8px; }
.browse { touch-action: pan-y; }
.stage { position: relative; background: #000; }
.hero { width: 100%; height: var(--img-h); object-fit: contain; display: block; cursor: zoom-in; }
.hero.ph { background: var(--secondary-background-color); font-size: 4em; }
.dots { position: absolute; bottom: 8px; left: 0; right: 0; display: flex; justify-content: center; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.5); cursor: pointer; }
.dot.on { background: #fff; }
.ib { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,.4); color: #fff; border: 0; width: 36px; height: 48px; font-size: 28px; cursor: pointer; border-radius: 6px; }
.ib.prev { left: 6px; } .ib.next { right: 6px; }
.binfo { padding: 12px 16px 4px; font-size: 1.05em; }
.nav { display: flex; align-items: center; gap: 8px; padding: 8px 16px 0; }
.nb { border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color); border-radius: 18px; width: 48px; height: 36px; font-size: 22px; cursor: pointer; }
.nb:disabled { opacity: .3; cursor: default; }
.ctr { color: var(--secondary-text-color); min-width: 48px; text-align: center; }
.jump { flex: 1; min-width: 0; padding: 6px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); font: inherit; }
`;
const LB_CSS = `
.pgc-lightbox { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.92); display: flex; align-items: center; justify-content: center; touch-action: pan-y; }
.pgc-lightbox img { max-width: 100vw; max-height: 100vh; object-fit: contain; }
.pgc-lightbox button { position: absolute; background: rgba(255,255,255,.12); color: #fff; border: 0; font-size: 34px; width: 52px; height: 64px; border-radius: 8px; cursor: pointer; }
.pgc-lightbox .x { top: 12px; right: 12px; height: 52px; }
.pgc-lightbox .p { left: 12px; top: 50%; transform: translateY(-50%); }
.pgc-lightbox .n { right: 12px; top: 50%; transform: translateY(-50%); }
.pgc-lightbox .c { position: absolute; bottom: 14px; left: 0; right: 0; text-align: center; color: #ddd; font: 14px system-ui, sans-serif; }
`;

// ---------- visual editor (ha-form) ----------
const SOURCE_KINDS = ['entity', 'entities', 'calendar', 'template'];
const EDITOR_SCHEMA = (kind) => [
  { name: 'title', selector: { text: {} } },
  { type: 'grid', name: '', schema: [
    { name: 'mode', selector: { select: { mode: 'dropdown', options: [{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }, { value: 'browse', label: 'Browse (one card)' }] } } },
    { name: 'preset', selector: { select: { mode: 'dropdown', options: Object.keys(PRESETS).map((p) => ({ value: p, label: p.replace(/_/g, ' ') })) } } },
  ] },
  { name: 'source_kind', selector: { select: { mode: 'box', options: SOURCE_KINDS.map((k) => ({ value: k, label: k })) } } },
  ...(kind === 'entity' ? [{ name: 'entity', selector: { entity: {} } }, { name: 'attribute', selector: { text: {} } }] : []),
  ...(kind === 'entities' ? [{ name: 'entities', selector: { text: {} } }] : []),
  ...(kind === 'calendar' ? [{ name: 'calendar', selector: { entity: { domain: 'calendar' } } }, { name: 'days', selector: { number: { min: 1, max: 730, mode: 'box' } } }] : []),
  ...(kind === 'template' ? [{ name: 'template', selector: { template: {} } }] : []),
  { type: 'grid', name: '', schema: [
    { name: 'search', selector: { boolean: {} } },
    { name: 'jump', selector: { boolean: {} } },
    { name: 'columns', selector: { number: { min: 1, max: 8, mode: 'box' } } },
    { name: 'image_height', selector: { number: { min: 80, max: 1200, step: 10, mode: 'box', unit_of_measurement: 'px' } } },
  ] },
  { name: 'fields', selector: { object: {} } },
  { name: 'filter', selector: { object: {} } },
  { name: 'sort', selector: { text: {} } },
  { name: 'limit', selector: { number: { min: 1, max: 1000, mode: 'box' } } },
];
const LABELS = {
  title: 'Title', mode: 'Display', preset: 'Field preset', source_kind: 'Data source', entity: 'Entity', attribute: 'Attribute with the list (empty = the entity itself)',
  entities: 'Entities (one per item, * allowed, comma separated)', calendar: 'Calendar', days: 'Days ahead', template: 'Template returning a JSON list',
  search: 'Search field', jump: 'Jump list (browse)', columns: 'Columns (grid)', image_height: 'Picture height (browse)', fields: 'Field mapping (overrides the preset)',
  filter: 'Filter (path: value)', sort: 'Sort by (field or path)', limit: 'Maximum entries',
};

class ProfileGalleryCardEditor extends HTMLElement {
  setConfig(config) { this._config = config; this._draw(); }
  set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; else this._draw(); }
  _flat() {
    const c = this._config || {}, s = c.source || {};
    const kind = s.template ? 'template' : s.calendar ? 'calendar' : s.entities ? 'entities' : 'entity';
    return Object.assign({ source_kind: this._kind || kind }, c, {
      entity: s.entity, attribute: s.attribute, entities: Array.isArray(s.entities) ? s.entities.join(', ') : s.entities, calendar: s.calendar, days: s.days, template: s.template,
      sort: isObj(c.sort) ? c.sort.by : c.sort,
    });
  }
  _draw() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement('ha-form');
      this._form.computeLabel = (s) => LABELS[s.name] || s.name;
      this._form.addEventListener('value-changed', (e) => this._changed(e.detail.value));
      this.appendChild(this._form);
    }
    const flat = this._flat();
    this._form.hass = this._hass;
    this._form.data = flat;
    this._form.schema = EDITOR_SCHEMA(flat.source_kind);
  }
  _changed(v) {
    this._kind = v.source_kind;
    const src = {};
    if (v.source_kind === 'entity') { if (v.entity) src.entity = v.entity; if (v.attribute) src.attribute = v.attribute; }
    if (v.source_kind === 'entities' && v.entities) src.entities = String(v.entities).split(',').map((x) => x.trim()).filter(Boolean);
    if (v.source_kind === 'calendar') { if (v.calendar) src.calendar = v.calendar; if (v.days) src.days = v.days; }
    if (v.source_kind === 'template' && v.template) src.template = v.template;
    const out = { type: 'custom:profile-gallery-card' };
    for (const k of ['title', 'mode', 'preset', 'search', 'jump', 'columns', 'image_height', 'fields', 'filter', 'limit']) if (v[k] !== undefined && v[k] !== '' && v[k] !== null) out[k] = v[k];
    if (v.sort) out.sort = isObj(this._config.sort) ? Object.assign({}, this._config.sort, { by: v.sort }) : v.sort;
    out.source = src;
    this._config = out;
    this._draw();
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: out }, bubbles: true, composed: true }));
  }
}

if (!customElements.get('profile-gallery-card')) customElements.define('profile-gallery-card', ProfileGalleryCard);
if (!customElements.get('profile-gallery-card-editor')) customElements.define('profile-gallery-card-editor', ProfileGalleryCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'profile-gallery-card')) {
  window.customCards.push({
    type: 'profile-gallery-card', name: 'Profile Gallery Card', preview: true,
    description: 'Profiles, contacts and calendar events with pictures – as list, grid or one card to browse.',
    documentationURL: 'https://github.com/Schimmelreiter/profile-gallery-card',
  });
}
console.info(`%c PROFILE-GALLERY-CARD %c ${PGC_VERSION} `, 'background:#5b3fa8;color:#fff;border-radius:3px 0 0 3px', 'background:#eee;color:#333;border-radius:0 3px 3px 0');
if (typeof module !== 'undefined') module.exports = { getPath, field, normalize, calendarObj, PRESETS, globRe, fmtDate };
