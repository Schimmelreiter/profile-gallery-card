/*
 * Profile Gallery Card for Home Assistant
 * Profiles, contacts and calendar events with pictures – as list, grid or one card to browse.
 * https://github.com/Schimmelreiter/profile-gallery-card · GPL-3.0
 */
const PGC_VERSION = '0.4.4';
const FAV_KEY = 'profile-gallery-card';  // favourites per Home Assistant user (frontend user data)
const imgBase = (u) => String(u || '').replace(/[?#].*$/, '');
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
  none: { title: 'title', subtitle: 'subtitle', image: 'image', images: 'images', videos: 'videos', url: 'url', text: 'text', badges: 'badges', lines: 'lines', date: 'date' },
  swinger_companion: {
    title: 'name', image: 'thumb', images: 'pics', videos: 'videos', url: 'profiles.0.url',
    subtitle: '{last_meet.where} · {last_meet.club}', date: 'last_meet.at', text: 'notes',
    badges: ['status', 'profiles.*.pf'],
  },
  nutten_scan: {
    title: 'name', image: 'bild', images: 'bilder', url: 'url', subtitle: '{haus} · {seite}',
    date: 'besucht_am', text: 'kommentar', badges: ['status', 'alter'],
  },
  // entries of sensor.nutten_scan_auswahl (karten) / sensor.nutten_scan_besuchte_models (models), with join: profil
  nutten_scan_karten: {
    id: 'uid', title: 'name', image: 'bild', images: 'bilder', url: 'url', html: 'karte_html', subtitle: '{haus} · {ort} · {seite}',
    notice: { text: '⚠️ **{treffer}** · fehlt: {fehlt} · Tabu: {tabu}', when: 'exakt', is: false },
  },
  google_contacts: {
    title: 'name', image: 'image', url: 'url', subtitle: '{organization} · {city}',
    lines: ['phones.*.value', 'emails.*.value'], badges: ['groups.*'], date: 'birthday', text: 'note',
  },
  calendar: { title: 'summary', subtitle: '{location}', date: 'start', text: 'text', image: 'image', images: 'images', url: 'link' },
};

// extra CSS for the HTML that a preset's data brings along (classes of that integration)
const PRESET_CSS = {
  nutten_scan_karten: `
.where { color: var(--secondary-text-color); }
.period, .present { margin-top: 4px; }
table.pairs { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 8px 0 4px; }
table.pairs td { width: 50%; vertical-align: top; padding: 1px 6px 1px 0; overflow-wrap: anywhere; }
.long, .vor { margin: 8px 0; }
.tabu { margin-top: 8px; padding: 3px 8px; border-left: 3px solid #ff6b6b; color: #ff8a8a; background: rgba(255, 90, 90, .1); border-radius: 0 4px 4px 0; }
.status { margin: 8px 0 4px; color: var(--secondary-text-color); }
.warn { color: var(--warning-color, #ffc107); font-weight: 600; }
code { background: var(--secondary-background-color, rgba(127,127,127,.2)); padding: 1px 4px; border-radius: 4px; font-size: 12px; color: var(--primary-text-color); }
table.sedcard { width: 100%; border-collapse: collapse; margin: 8px 0; }
table.sedcard th { width: 38%; color: var(--secondary-text-color); }
`,
};

// raw object → normalized item { v, id, title, subtitle, image, images[], url, text, badges[], lines[], date }
function normalize(raw, fields, idx) {
  const imagesV = field(raw, fields.images);
  let images = (Array.isArray(imagesV) ? imagesV : imagesV ? [imagesV] : []).map((x) => (isObj(x) ? x.url || x.src || '' : String(x || ''))).filter(Boolean);
  const image = asText(field(raw, fields.image)) || images[0] || '';
  if (image && !images.includes(image)) images = [image, ...images];
  const videosV = field(raw, fields.videos);
  const videos = (Array.isArray(videosV) ? videosV : videosV ? [videosV] : []).map((x) => (isObj(x) ? x.url || x.src || '' : String(x || ''))).filter(Boolean);
  // a badge may be { text, when, is }: shown only when the field "when" has the value "is"
  const bspec = [].concat(fields.badges || []).map((b) => (isObj(b) ? (String(getPath(raw, b.when)) === String(b.is) ? b.text : null) : b)).filter((b) => b != null);
  const badges = [].concat(field(raw, bspec) || []).flat().map(asText).filter(Boolean);
  // notice: a hint line at the top of the entry (same { text, when, is } condition as a badge)
  const nspec = [].concat(fields.notice || []).map((b) => (isObj(b) ? (String(getPath(raw, b.when)) === String(b.is) ? b.text : null) : b)).filter((b) => b != null);
  const notice = [].concat(field(raw, nspec) || []).flat().map(asText).filter(Boolean).join(' · ');
  const lines = [].concat(field(raw, fields.lines) || []).map(asText).filter(Boolean);
  return {
    v: ITEM_FORMAT,
    id: asText(field(raw, fields.id || 'id')) || String(idx),
    title: asText(field(raw, fields.title)) || '–',
    subtitle: asText(field(raw, fields.subtitle)),
    image, images, videos,
    url: asText(field(raw, fields.url)),
    text: asText(field(raw, fields.text)),
    badges, lines, notice,
    date: asText(field(raw, fields.date)),
    html: asText(field(raw, fields.html)),
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
    if (!this._favLoad && hass.connection) this._loadFavs();
    const s = this._config && this._config.source;
    if (!s) return;
    if (s.template && !this._tplUnsub && !this._tplPending) this._subscribeTemplate();
    if (s.calendar && Date.now() - this._calAt > 15 * 60000) this._loadCalendar();
    this._render();
  }

  connectedCallback() { if (this._hass && this._config) { this._sig = ''; this._render(); } }
  disconnectedCallback() { this._unsub(); this._closeDialog(); }
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

  async _loadFavs() {
    this._favLoad = true;
    try {
      const r = await this._hass.connection.sendMessagePromise({ type: 'frontend/get_user_data', key: FAV_KEY });
      this._favs = (r && r.value && r.value.favs) || {};
    } catch (e) { this._favs = this._favs || {}; }
    this._sig = ''; this._render();
  }
  _css() { return (PRESET_CSS[this._config.preset] || '') + (this._config.styles || ''); }
  _favId(it) { return `${this._config.preset || 'none'}:${it.id}`; }
  _isFav(it, url) { return !!url && (this._favs || {})[this._favId(it)] === imgBase(url); }
  async _toggleFav(it, url) {
    const favs = Object.assign({}, this._favs || {}), k = this._favId(it);
    if (favs[k] === imgBase(url)) delete favs[k]; else favs[k] = imgBase(url);
    this._favs = favs;
    this._img[it.id] = 0;
    this._sig = ''; this._render();
    try {
      const cur = await this._hass.connection.sendMessagePromise({ type: 'frontend/get_user_data', key: FAV_KEY });
      const all = Object.assign({}, (cur && cur.value && cur.value.favs) || {});
      if (favs[k]) all[k] = favs[k]; else delete all[k];
      await this._hass.connection.sendMessagePromise({ type: 'frontend/set_user_data', key: FAV_KEY, value: { favs: all } });
    } catch (e) { /* stays for this page view */ }
  }
  _rawItems() {
    const j = this._config.join, h = this._hass;
    const raw = this._rawItems0();
    // join: a field holds an entity id; its attributes complete the entry (fields of the entry win)
    const empty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
    return j ? raw.map((r) => {
      const st = r && h.states[r[j]];
      if (!st) return r;
      const out = Object.assign({}, st.attributes, { state: st.state });
      for (const [k, v] of Object.entries(r)) if (!empty(v) || !(k in out)) out[k] = v;
      return out;
    }) : raw;
  }
  _rawItems0() {
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
    // favourite picture first
    for (const it of items) {
      const f = (this._favs || {})[this._favId(it)];
      const j = f ? it.images.findIndex((u) => imgBase(u) === f) : -1;
      if (j > 0) { const [u] = it.images.splice(j, 1); it.images.unshift(u); }
      if (j >= 0) it.image = it.images[0];
    }
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
    const sig = JSON.stringify([this._favs, all.map((i) => [i.id, i.title, i.subtitle, i.images, i.videos, i.badges, i.notice, i.text, i.date, i.lines, i.url, i.html, this._actState(i)]), this._idx, this._img, this._q, this._config]);
    if (this._dlg) this._dialogUpdate(all);
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
    else if (c.mode === 'grid') body = `<div class="grid${c.image_height ? ' fixedh' : ''} fit-${c.image_fit || (c.image_height ? 'contain' : 'cover')}" style="--cols:${Number(c.columns) || 3}">${this._ctrlInGrid() ? '<div class="tile ctile"></div>' : ''}${items.map((it, i) => this._tile(it, i, lang)).join('')}</div>`;
    else if (c.mode === 'browse') body = this._browse(items, lang);
    else body = `<div class="list">${items.map((it, i) => this._row(it, i, lang)).join('')}</div>`;
    const keepFocus = this.shadowRoot.activeElement && this.shadowRoot.activeElement.classList.contains('search');
    const pos = keepFocus ? this.shadowRoot.activeElement.selectionStart : 0;
    if (!this._content) {
      this.shadowRoot.innerHTML = `<style>${CSS}${this._css()}</style><ha-card><div class="ctrl"></div><div class="content"></div></ha-card>`;
      this._content = this.shadowRoot.querySelector('.content');
      this._ctrlEl = this.shadowRoot.querySelector('.ctrl');
    }
    this.shadowRoot.querySelector('ha-card').style.setProperty('--img-h', `${Number(c.image_height) || 280}px`);
    this._content.innerHTML = `${tools ? `<div class="tools">${tools}</div>` : ''}${body}`;
    this._ctrlEl.innerHTML = '';
    if (head) this._ctrlEl.insertAdjacentHTML('afterbegin', head);
    this._controls();
    const ct = this._content.querySelector('.ctile');
    if (this._ctrlBox) (ct || this._ctrlEl).appendChild(this._ctrlBox);
    this._wire();
    if (keepFocus) { const s = this.shadowRoot.querySelector('.search'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }
  }

  // notice text: escaped, **bold** allowed
  _notice(it) { return it.notice ? `<div class="notice">${esc(it.notice).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>` : ''; }
  _badges(it) { return it.badges.length ? `<div class="badges">${it.badges.map((b) => `<span class="badge">${esc(b)}</span>`).join('')}</div>` : ''; }
  _meta(it, lang) {
    const date = it.date ? `<span class="date">${esc(fmtDate(it.date, lang))}</span>` : '';
    return `${it.subtitle || date ? `<div class="sub">${esc(it.subtitle)}${it.subtitle && date ? ' · ' : ''}${date}</div>` : ''}` +
      it.lines.map((l) => `<div class="line">${esc(l)}</div>`).join('');
  }
  _head(it, lang) { return it.html ? `<div class="html">${it.html}</div>` : this._title(it) + this._meta(it, lang); }
  _actState(it) {
    const h = this._hass, ids = [...(this._config.actions || []).map((a) => it.raw[a.field]), (this._config.date || {}).field && it.raw[this._config.date.field]];
    return ids.map((e) => (e && h.states[e] ? h.states[e].state : ''));
  }
  _actions(it, i) {
    const c = this._config, h = this._hass;
    const btn = (c.actions || []).map((a, k) => {
      const e = it.raw[a.field], st = e && h.states[e];
      if (!st) return '';
      const on = st.state === 'on';
      return `<button class="act${on ? ' on' : ''}" data-act="${i}:${k}" title="${esc(a.name || st.attributes.friendly_name || '')}"><ha-icon icon="${esc((on && a.icon_on) || a.icon || 'mdi:checkbox-blank-circle-outline')}"></ha-icon>${a.name ? `<span>${esc(a.name)}</span>` : ''}</button>`;
    }).join('');
    let date = '';
    if (c.date && it.raw[c.date.field] && h.states[it.raw[c.date.field]]) {
      const when = c.date.when ? it.raw[c.date.when] : null;
      if (!when || (h.states[when] && h.states[when].state === 'on')) {
        const v = h.states[it.raw[c.date.field]].state;
        date = `<input class="adate" type="date" data-date="${i}" value="${/^\d{4}-\d\d-\d\d$/.test(v) ? v : ''}">`;
      }
    }
    const det = c.details ? `<button class="act" data-det="${i}" title="Details"><ha-icon icon="mdi:information-outline"></ha-icon></button>` : '';
    // own note written: icon with the text as tooltip (click opens the detail window)
    const nt = c.note ? asText(getPath(it.raw, c.note.field)).trim() : '';
    const note = nt ? `<button class="act notei"${c.details ? ` data-det="${i}"` : ''} title="${esc(nt)}"><ha-icon icon="mdi:comment-text-outline"></ha-icon></button>` : '';
    return btn || date || det || note ? `<div class="acts">${btn}${date}${note}${det}</div>` : '';
  }
  _title(it) { return it.url ? `<a class="title" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a>` : `<span class="title">${esc(it.title)}</span>`; }
  _thumb(it, i, cls) {
    return it.image ? `<img class="${cls}" loading="lazy" src="${esc(it.image)}" data-open="${i}" alt="">`
      : `<div class="${cls} ph">${esc((it.title || '?').trim().charAt(0).toUpperCase())}</div>`;
  }
  _star(it, i, url) {
    if (!url) return '';
    const on = this._isFav(it, url);
    return `<button class="fav tfav${on ? ' on' : ''}" data-fav="${i}" title="Als Favorit zuerst zeigen" aria-label="favourite">${on ? '★' : '☆'}</button>`;
  }
  _count(it, i, cls) {
    const n = it.images.length, v = it.videos.length;
    return n > 1 || v ? `<span class="${cls}" data-open="${i}">${n > 1 ? n + ' 📷' : ''}${n > 1 && v ? ' ' : ''}${v ? v + ' 🎞' : ''}</span>` : '';
  }
  _row(it, i, lang) {
    return `<div class="row">${this._thumb(it, i, 'av')}<div class="info">${this._notice(it)}${this._head(it, lang)}${this._badges(it)}` +
      `${it.text && this._config.show_text !== false ? `<div class="text clamp">${esc(it.text)}</div>` : ''}${this._actions(it, i)}</div>` +
      `${this._count(it, i, 'n')}</div>`;
  }
  _tile(it, i, lang) {
    // slideshow in the tile: arrows, swipe, counter; a click opens the full-screen view at that picture
    const n = it.images.length, k = Math.min(this._img[it.id] || 0, Math.max(0, n - 1));
    if (n > 1 || it.videos.length) {
      const nav = n > 1 ? `<button class="tb prev" data-ti="${i}:-1" aria-label="previous picture">‹</button><button class="tb next" data-ti="${i}:1" aria-label="next picture">›</button><span class="tc">${k + 1} / ${n}</span>` : '';
      const vids = it.videos.length ? `<span class="n on tv" data-video="${i}">${it.videos.length} 🎞</span>` : '';
      return `<div class="tile">${this._notice(it)}<div class="tshow" data-tile="${i}"><img class="big" loading="lazy" src="${esc(it.images[k] || it.image)}" data-open="${i}" alt="">${nav}${vids}${this._star(it, i, it.images[k])}</div>` +
        `<div class="info">${this._head(it, lang)}${this._badges(it)}${this._actions(it, i)}</div></div>`;
    }
    return `<div class="tile">${this._notice(it)}${this._thumb(it, i, 'big')}${this._count(it, i, 'n on')}${it.image ? this._star(it, i, it.image) : ''}` +
      `<div class="info">${this._head(it, lang)}${this._badges(it)}${this._actions(it, i)}</div></div>`;
  }
  _browse(items, lang) {
    const i = this._idx, it = items[i], k = this._img[it.id] || 0, n = it.images.length;
    const pic = n ? `<img class="hero" src="${esc(it.images[Math.min(k, n - 1)])}" data-open="${i}" alt="">` : `<div class="hero ph">${esc(it.title.charAt(0).toUpperCase())}</div>`;
    const cur = n ? it.images[Math.min(k, n - 1)] : '';
    const star = n ? `<button class="fav${this._isFav(it, cur) ? ' on' : ''}" data-fav="${i}" title="Als Favorit zuerst zeigen" aria-label="favourite">${this._isFav(it, cur) ? '★' : '☆'}</button>` : '';
    const dots = n > 1 ? `<div class="dots">${it.images.map((_, j) => `<span class="dot${j === k ? ' on' : ''}" data-img="${j}"></span>`).join('')}</div>` +
      `<button class="ib prev" data-img="${(k - 1 + n) % n}" aria-label="previous picture">‹</button><button class="ib next" data-img="${(k + 1) % n}" aria-label="next picture">›</button>` : '';
    const jump = this._config.jump !== false && items.length > 2
      ? `<select class="jump">${items.map((x, j) => `<option value="${j}"${j === i ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}</select>` : '';
    const vids = it.videos.length ? `<span class="n on" data-video="${i}">${it.videos.length} 🎞</span>` : '';
    return `<div class="browse">${this._notice(it)}<div class="stage">${pic}${star}${dots}${vids}</div>` +
      `<div class="info binfo">${this._head(it, lang)}${this._badges(it)}${it.text ? `<div class="text">${esc(it.text)}</div>` : ''}${this._actions(it, i)}</div>` +
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
      const it = this._shown[+el.dataset.open]; if (it && (it.images.length || it.videos.length)) this._lightbox(it, this._config.mode === 'list' ? 0 : (this._img[it.id] || 0));
    }));
    r.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); const it = this._shown[+b.dataset.fav]; if (!it) return;
      const n = it.images.length, k = this._img[it.id] || 0; this._toggleFav(it, it.images[Math.min(k, n - 1)]);
    }));
    r.querySelectorAll('[data-video]').forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation(); const it = this._shown[+el.dataset.video]; if (it) this._lightbox(it, it.images.length);
    }));
    r.querySelectorAll('[data-ti]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const [i, d] = b.dataset.ti.split(':').map(Number), it = this._shown[i], n = it.images.length;
      this._img[it.id] = (((this._img[it.id] || 0) + d) % n + n) % n; this._render();
    }));
    r.querySelectorAll('[data-tile]').forEach((t) => swipe(t, (d) => {
      const it = this._shown[+t.dataset.tile], n = it.images.length;
      if (n > 1) { this._img[it.id] = (((this._img[it.id] || 0) + d) % n + n) % n; this._render(); }
    }));
    this._wireActs(r, this._shown);
    r.querySelectorAll('[data-det]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this._openDialog(this._shown[+b.dataset.det]); }));
    const stage = r.querySelector('.browse');
    if (stage) swipe(stage, (d) => this._go(d));
  }
  _wireActs(r, list) {
    r.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const [i, k] = b.dataset.act.split(':').map(Number), it = list[i], a = (this._config.actions || [])[k];
      if (it && a && it.raw[a.field]) this._hass.callService('homeassistant', 'toggle', { entity_id: it.raw[a.field] });
    }));
    r.querySelectorAll('[data-date]').forEach((d) => d.addEventListener('change', (e) => {
      e.stopPropagation(); const it = list[+d.dataset.date];
      if (it && d.value) this._hass.callService('date', 'set_value', { entity_id: it.raw[this._config.date.field], date: d.value });
    }));
  }

  // controls as the first tile of the grid (default in grid mode), otherwise above the gallery
  _ctrlInGrid() { return this._config.mode === 'grid' && this._config.controls_position !== 'top' && !!(this._config.controls || this._config.controls_from); }
  // ---------- controls above the gallery (any entities; rows of cells) ----------
  _controls() {
    const c = this._config, h = this._hass;
    let rows = c.controls;
    if (!rows && c.controls_from) { const st = h.states[c.controls_from.entity]; rows = st && getPath(st.attributes, c.controls_from.attribute || 'controls'); }
    if (!Array.isArray(rows) || !rows.length) { this._ctrlBox = null; return; }
    rows = rows.map((r) => (Array.isArray(r) ? r : [r]));
    const key = JSON.stringify(rows);
    if (key !== this._ctrlKey) {
      this._ctrlKey = key;
      const box = document.createElement('div');
      box.className = 'controls';
      this._ctrlRows = []; this._locks = [];
      const helpers = window.loadCardHelpers ? window.loadCardHelpers() : Promise.resolve(null);
      for (const row of rows) {
        const line = document.createElement('div');
        line.className = 'crow';
        for (const cell0 of row) {
          const cell = typeof cell0 === 'string' ? { entity: cell0 } : cell0 || {};
          if (cell.gap || cell.leer) { line.appendChild(Object.assign(document.createElement('div'), { className: 'cgap' })); continue; }
          if (cell.toggle || cell.schloss) {
            const ent = cell.toggle || cell.entity;
            const b = Object.assign(document.createElement('button'), { className: 'clock', title: cell.name || 'Pflicht' });
            b.innerHTML = '<ha-icon></ha-icon>';
            b.addEventListener('click', () => this._hass.callService('homeassistant', 'toggle', { entity_id: ent }));
            this._locks.push([ent, b]);
            line.appendChild(b);
            continue;
          }
          const slot = Object.assign(document.createElement('div'), { className: 'ccell' });
          line.appendChild(slot);
          helpers.then((hp) => {
            const conf = { entity: cell.entity }; if (cell.name) conf.name = cell.name;
            // compact rows without icons (needs card-mod; harmless without it)
            if (this._config.controls_icons !== true) conf.card_mod = { style: { 'hui-generic-entity-row $': 'state-badge { display: none; } .info { margin-left: 0 !important; }' } };
            const el = hp ? hp.createRowElement(conf) : Object.assign(document.createElement('div'), { textContent: cell.name || cell.entity });
            el.hass = this._hass; this._ctrlRows.push(el); slot.appendChild(el);
          });
        }
        box.appendChild(line);
      }
      this._ctrlBox = box;
    }
    for (const r of this._ctrlRows || []) r.hass = h;
    for (const [ent, b] of this._locks || []) {
      const st = h.states[ent], on = !!st && st.state === 'on';
      b.classList.toggle('on', on);
      b.firstChild.setAttribute('icon', (st && st.attributes.icon) || (on ? 'mdi:lock' : 'mdi:lock-open-variant-outline'));
    }
  }

  // ---------- detail window: head and body as HTML, pictures, actions, own note ----------
  _openDialog(it) {
    if (!it) return;
    this._closeDialog();
    const box = document.createElement('div');
    box.className = 'pgc-dialog';
    box.innerHTML = `<style>${DLG_CSS}${this._css()}</style><div class="dlg"><div class="dh"><button class="x" aria-label="close">×</button><span class="dt"></span></div><div class="db"></div></div>`;
    box.addEventListener('click', (e) => { if (e.target === box) this._closeDialog(); });
    box.querySelector('.x').addEventListener('click', () => this._closeDialog());
    this._dlgKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.pgc-lightbox')) this._closeDialog(); };
    document.addEventListener('keydown', this._dlgKey);
    document.body.appendChild(box);
    this._dlg = { id: it.id, box, sig: '' };
    this._dialogUpdate(this._items());
  }
  _closeDialog() {
    if (!this._dlg) return;
    this._dlg.box.remove();
    document.removeEventListener('keydown', this._dlgKey);
    this._dlg = null;
  }
  _dialogUpdate(all) {
    const d = this._dlg, it = all.find((x) => x.id === d.id);
    if (!it) return;
    const c = this._config, det = isObj(c.details) ? c.details : {};
    const headH = det.head ? asText(field(it.raw, det.head)) : '', bodyH = det.body ? asText(field(it.raw, det.body)) : '';
    const sig = JSON.stringify([headH, bodyH, it.images, this._actState(it), it.raw[(c.note || {}).field]]);
    if (sig === d.sig) return;
    d.sig = sig;
    d.box.querySelector('.dt').textContent = it.title;
    const db = d.box.querySelector('.db');
    const area = db.querySelector('textarea'), typed = area && area.value !== (d.stored || '') ? area.value : null;
    const imgs = it.images.map((u, j) => `<img src="${esc(u)}" data-li="${j}" alt="">`).join('');
    const noteV = c.note ? asText(getPath(it.raw, c.note.field)) : '';
    db.innerHTML = `${headH ? `<div class="dhtml">${headH}</div>` : ''}${imgs ? `<div class="strip">${imgs}</div>` : ''}${bodyH ? `<div class="dhtml">${bodyH}</div>` : ''}` +
      this._actions(it, 0).replace(/<button class="act" data-det="0"[\s\S]*?<\/button>/, '') +
      (c.note ? `<div class="note"><h4>${esc(c.note.name || 'Notiz')}</h4><textarea rows="4"></textarea><button class="save">Speichern</button><span class="saved"></span></div>` : '');
    db.querySelectorAll('[data-li]').forEach((im) => im.addEventListener('click', () => this._lightbox(it, +im.dataset.li)));
    this._wireActs(db, [it]);
    if (c.note) {
      const ta = db.querySelector('textarea');
      d.stored = noteV;
      ta.value = typed != null ? typed : noteV;
      db.querySelector('.save').addEventListener('click', () => {
        const data = {};
        for (const [k, v] of Object.entries(c.note.data || {})) data[k] = typeof v === 'string' ? v.replace(/\{value\}/g, ta.value).replace(/\{([^}]+)\}/g, (_, p2) => asText(getPath(it.raw, p2))) : v;
        const [dom, svc] = String(c.note.service || '').split('.');
        this._hass.callService(dom, svc, data).then(() => { db.querySelector('.saved').textContent = '✓'; }).catch((e) => { db.querySelector('.saved').textContent = e.message || String(e); });
      });
    }
  }

  _lightbox(it, start) {
    const media = [...it.images.map((u) => ({ u })), ...it.videos.map((u) => ({ u, v: true }))];
    if (!media.length) return;
    let k = Math.min(start, media.length - 1);
    const box = document.createElement('div');
    box.className = 'pgc-lightbox';
    box.innerHTML = `<style>${LB_CSS}</style><div class="m"></div><button class="x" aria-label="close">×</button><button class="f" aria-label="favourite" title="Als Favorit zuerst zeigen">☆</button>` +
      (media.length > 1 ? '<button class="p" aria-label="previous">‹</button><button class="n" aria-label="next">›</button>' : '') + '<span class="c"></span>';
    const m = box.querySelector('.m'), ctr = box.querySelector('.c'), fb = box.querySelector('.f');
    fb.addEventListener('click', (e) => { e.stopPropagation(); const x = media[k]; if (!x.v) { this._toggleFav(it, x.u); setTimeout(show, 0); } });
    const show = () => {
      const x = media[k];
      m.innerHTML = x.v ? `<video src="${esc(x.u)}" controls autoplay playsinline></video>` : `<img src="${esc(x.u)}" alt="">`;
      ctr.textContent = `${k + 1}/${media.length} · ${it.title}`;
      fb.style.display = x.v ? 'none' : '';
      fb.textContent = this._isFav(it, x.u) ? '★' : '☆';
    };
    const go = (d) => { k = (k + d + media.length) % media.length; show(); };
    const close = () => { box.remove(); document.removeEventListener('keydown', key); };
    const key = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
    box.querySelector('.x').addEventListener('click', close);
    box.addEventListener('click', (e) => { if (e.target === box || e.target === m) close(); });
    if (media.length > 1) { box.querySelector('.p').addEventListener('click', () => go(-1)); box.querySelector('.n').addEventListener('click', () => go(1)); swipe(box, go); }
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
.ctrl .controls { padding: 0 8px 8px; }
.ctile { padding: 8px 4px 4px; align-self: start; }
.tshow { position: relative; touch-action: pan-y; }
.tb { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,.4); color: #fff; border: 0; width: 32px; height: 44px; font-size: 24px; cursor: pointer; border-radius: 6px; }
.tb.prev { left: 4px; } .tb.next { right: 4px; }
.tc { position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,.55); color: #fff; padding: 1px 8px; border-radius: 8px; font-size: .8em; }
.tv { top: 6px; right: 6px; }
.tfav { right: auto; left: 8px; }
.notei { color: var(--primary-color); }
.ctile .controls { padding: 0; }
.crow { display: flex; align-items: center; gap: 4px; min-height: 48px; }
.ccell { flex: 1; min-width: 0; }
.cgap { width: 36px; flex: none; }
.clock { flex: none; width: 36px; height: 36px; border: 0; border-radius: 50%; background: transparent; color: var(--secondary-text-color); cursor: pointer; }
.clock.on { color: var(--warning-color, #ffc107); }
.html h3 { margin: 0 0 4px; font-size: 1.1em; }
.acts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px; }
.act { display: inline-flex; gap: 4px; align-items: center; border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color); border-radius: 16px; padding: 3px 10px; cursor: pointer; font: inherit; }
.act.on { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: transparent; }
.adate { background: transparent; color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 6px; padding: 2px 6px; font: inherit; }
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
.notice { font-size: 14px; line-height: 1.4; padding: 6px 10px; overflow-wrap: anywhere; }
.info .notice { padding: 0 0 4px; }
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
.tile { position: relative; border-radius: 12px; overflow: hidden; background: var(--secondary-background-color); align-self: start; }
.tile .info { padding: 8px; }
.big { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; display: block; cursor: pointer; }
.big.ph { display: flex; cursor: default; }
.fixedh .big { aspect-ratio: auto; height: var(--img-h); }
.fit-contain .big { object-fit: contain; background: #000; }
.fit-cover .big { object-fit: cover; }
.n.on { position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,.55); color: #fff; padding: 1px 6px; border-radius: 8px; }
.browse { touch-action: pan-y; }
.stage { position: relative; background: #000; }
.stage .n.on { cursor: pointer; }
.hero { width: 100%; height: var(--img-h); object-fit: contain; display: block; cursor: zoom-in; }
.hero.ph { background: var(--secondary-background-color); font-size: 4em; }
.dots { position: absolute; bottom: 8px; left: 0; right: 0; display: flex; justify-content: center; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.5); cursor: pointer; }
.dot.on { background: #fff; }
.ib { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,.4); color: #fff; border: 0; width: 36px; height: 48px; font-size: 28px; cursor: pointer; border-radius: 6px; }
.ib.prev { left: 6px; } .ib.next { right: 6px; }
.fav { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,.45); color: #fff; border: 0; border-radius: 50%; width: 38px; height: 38px; font-size: 22px; cursor: pointer; }
.fav.on { color: #ffd54a; }
.binfo { padding: 12px 16px 4px; font-size: 1.05em; }
.nav { display: flex; align-items: center; gap: 8px; padding: 8px 16px 0; }
.nb { border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color); border-radius: 18px; width: 48px; height: 36px; font-size: 22px; cursor: pointer; }
.nb:disabled { opacity: .3; cursor: default; }
.ctr { color: var(--secondary-text-color); min-width: 48px; text-align: center; }
.jump { flex: 1; min-width: 0; padding: 6px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); font: inherit; }
`;
const DLG_CSS = `
.pgc-dialog { position: fixed; inset: 0; z-index: 9000; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; }
.dlg { background: var(--card-background-color, #1c1c1c); color: var(--primary-text-color, #e6e6e6); width: min(1100px, 96vw); max-height: 92vh; overflow: auto; border-radius: 12px; font-family: var(--paper-font-body1_-_font-family, system-ui, sans-serif); }
.dh { position: sticky; top: 0; display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: inherit; border-bottom: 1px solid var(--divider-color, #333); font-size: 1.2em; }
.dh .x { background: none; border: 0; color: inherit; font-size: 28px; cursor: pointer; }
.db { padding: 12px 16px; }
.strip { display: flex; gap: 6px; overflow-x: auto; margin: 8px 0; }
.strip img { height: 220px; border-radius: 6px; cursor: zoom-in; }
.dhtml table { border-collapse: collapse; } .dhtml th, .dhtml td { text-align: left; padding: 2px 10px 2px 0; vertical-align: top; }
.note textarea { width: 100%; box-sizing: border-box; background: transparent; color: inherit; border: 1px solid var(--divider-color, #444); border-radius: 6px; padding: 6px; font: inherit; }
.note .save { margin-top: 6px; padding: 4px 14px; border-radius: 14px; border: 1px solid var(--divider-color, #444); background: transparent; color: inherit; cursor: pointer; }
.acts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px; }
.act { display: inline-flex; gap: 4px; align-items: center; border: 1px solid var(--divider-color, #444); background: transparent; color: inherit; border-radius: 16px; padding: 3px 10px; cursor: pointer; font: inherit; }
.act.on { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); border-color: transparent; }
.adate { background: transparent; color: inherit; border: 1px solid var(--divider-color, #444); border-radius: 6px; padding: 2px 6px; font: inherit; }
`;
const LB_CSS = `
.pgc-lightbox { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.92); display: flex; align-items: center; justify-content: center; touch-action: pan-y; }
.pgc-lightbox .m { display: contents; }
.pgc-lightbox img, .pgc-lightbox video { max-width: 100vw; max-height: 100vh; object-fit: contain; }
.pgc-lightbox button { position: absolute; background: rgba(255,255,255,.12); color: #fff; border: 0; font-size: 34px; width: 52px; height: 64px; border-radius: 8px; cursor: pointer; }
.pgc-lightbox .x { top: 12px; right: 12px; height: 52px; }
.pgc-lightbox .f { top: 12px; right: 76px; height: 52px; color: #ffd54a; }
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
if (typeof module !== 'undefined') module.exports = { getPath, field, normalize, calendarObj, PRESETS, PRESET_CSS, globRe, fmtDate };
