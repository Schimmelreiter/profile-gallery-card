// node test/card.test.js  (needs jsdom: npm i --no-save jsdom)
const assert = require('assert');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://ha.local/' });
Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, customElements: dom.window.customElements, CustomEvent: dom.window.CustomEvent });
const M = require('../profile-gallery-card.js');

// paths and formats
const o = { a: { b: [{ c: 1 }, { c: 2 }] }, phones: [{ value: '+49 1' }, { value: '+49 2' }], city: '', org: 'ACME' };
assert.strictEqual(M.getPath(o, 'a.b.1.c'), 2);
assert.deepStrictEqual(M.getPath(o, 'phones.*.value'), ['+49 1', '+49 2']);
assert.strictEqual(M.field(o, '{org} · {city}'), 'ACME');
assert.strictEqual(M.field(o, '{city} · {missing}'), '');

// presets
const contact = { v: 1, id: 'c1', name: 'Alex Example', image: 'https://x/a.jpg', organization: 'ACME', city: 'Berlin', phones: [{ value: '+491' }], emails: [], groups: ['Friends'], url: 'https://contacts.google.com/person/c1', birthday: '--02-29' };
const it = M.normalize(contact, M.PRESETS.google_contacts, 0);
assert.strictEqual(it.title, 'Alex Example');
assert.strictEqual(it.subtitle, 'ACME · Berlin');
assert.deepStrictEqual(it.images, ['https://x/a.jpg']);
assert.deepStrictEqual(it.badges, ['Friends']);
assert.deepStrictEqual(it.lines, ['+491']);
const sc = M.normalize({ id: 'j:1', name: 'Lisa', thumb: '/t1', pics: ['/p1', '/p2'], profiles: [{ pf: 'joyclub', url: 'https://j/1' }], status: 'done', last_meet: { where: 'Party', club: 'Club X', at: '2026-10-03T22:00' } }, M.PRESETS.swinger_companion, 0);
assert.deepStrictEqual(sc.images, ['/t1', '/p1', '/p2']);
assert.strictEqual(sc.url, 'https://j/1');
assert.strictEqual(sc.subtitle, 'Party · Club X');
assert.deepStrictEqual(sc.badges, ['done', 'joyclub']);

// calendar events: picture and link from the description
const ev = M.calendarObj({ summary: 'Party', start: { dateTime: '2026-12-01T20:00:00+01:00' }, description: 'Info https://club.example/e/1 Bild https://cdn.example/p.jpg' });
assert.strictEqual(ev.image, 'https://cdn.example/p.jpg');
assert.strictEqual(ev.link, 'https://club.example/e/1');
assert.ok(M.globRe('sensor.m*_profil').test('sensor.m57011_profil'));

// rendering: browse mode, navigation, search
const states = { 'sensor.contacts': { state: '3', attributes: { contacts: [contact, Object.assign({}, contact, { id: 'c2', name: 'Sam', image: '' }), Object.assign({}, contact, { id: 'c3', name: 'Kim' })] } } };
const card = document.createElement('profile-gallery-card');
card.setConfig({ title: 'Book', source: { entity: 'sensor.contacts', attribute: 'contacts' }, preset: 'google_contacts', mode: 'browse', search: true });
document.body.appendChild(card);
card.hass = { states, language: 'en', locale: { language: 'en' } };
const r = card.shadowRoot;
assert.strictEqual(r.querySelector('.ctr').textContent, '1/3');
assert.ok(r.querySelector('.hero').getAttribute('src').endsWith('a.jpg'));
r.querySelector('[data-go="1"]').click();
assert.strictEqual(r.querySelector('.ctr').textContent, '2/3');
assert.ok(r.querySelector('.hero.ph'));
r.querySelector('[data-go="1"]').click(); r.querySelector('[data-go="1"]').click();
assert.strictEqual(r.querySelector('.ctr').textContent, '1/3');
const s = r.querySelector('.search'); s.value = 'kim'; s.dispatchEvent(new dom.window.Event('input'));
assert.strictEqual(r.querySelector('.ctr').textContent, '1/1');
assert.ok(r.querySelector('.title').textContent === 'Kim');
// lightbox
r.querySelector('.hero').click();
assert.ok(document.querySelector('.pgc-lightbox img').getAttribute('src').endsWith('a.jpg'));
document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
assert.ok(!document.querySelector('.pgc-lightbox'));
// list and grid
card.setConfig({ source: { entity: 'sensor.contacts', attribute: 'contacts' }, preset: 'google_contacts', mode: 'list' });
assert.strictEqual(r.querySelectorAll('.row').length, 3);
card.setConfig({ source: { entity: 'sensor.contacts', attribute: 'contacts' }, preset: 'google_contacts', mode: 'grid', columns: 2, filter: { 'groups.0': 'Friends' }, sort: { by: 'title', desc: true } });
assert.deepStrictEqual([...r.querySelectorAll('.title')].map((x) => x.textContent), ['Sam', 'Kim', 'Alex Example']);
// entities glob: one entity = one item
states['sensor.m1_profil'] = { state: 'online', attributes: { name: 'Jenny', bild: '/b.jpg', bilder: ['/b.jpg', '/c.jpg'], haus: 'Haus', status: 'interessant' } };
card.setConfig({ source: { entities: ['sensor.m*_profil'] }, preset: 'nutten_scan', mode: 'list' });
card.hass = { states, language: 'en' };
assert.strictEqual(r.querySelector('.title').textContent, 'Jenny');
assert.ok(r.querySelector('.n').textContent.startsWith('2'));
// config errors
assert.throws(() => card.setConfig({}), /source/);
assert.throws(() => card.setConfig({ source: { entity: 'x' }, mode: 'wall' }), /mode/);
assert.ok(window.customCards.some((c) => c.type === 'profile-gallery-card'));
console.log('all card tests passed');
// videos: counted, lightbox plays them after the pictures
const vc = document.createElement('profile-gallery-card');
document.body.appendChild(vc);
vc.setConfig({ source: { entity: 'sensor.sc', attribute: 'persons' }, preset: 'swinger_companion', mode: 'browse' });
vc.hass = { states: { 'sensor.sc': { state: '1', attributes: { persons: [{ id: 'p1', name: 'Kim', thumb: '/t', pics: ['/p1'], videos: ['/v1'] }] } } }, language: 'en' };
const vr = vc.shadowRoot;
assert.ok(vr.querySelector('[data-video]').textContent.includes('1'));
vr.querySelector('[data-video]').click();
assert.ok(document.querySelector('.pgc-lightbox video').getAttribute('src') === '/v1');
assert.strictEqual(document.querySelector('.pgc-lightbox .c').textContent, '3/3 · Kim');
document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
console.log('video tests passed');
// favourite: stored per user, shown first afterwards
(async () => {
  const store = {};
  const conn = { sendMessagePromise: async (m) => { if (m.type === 'frontend/get_user_data') return { value: store[m.key] }; store[m.key] = m.value; return null; } };
  const fc = document.createElement('profile-gallery-card');
  document.body.appendChild(fc);
  fc.setConfig({ source: { entity: 'sensor.sc', attribute: 'persons' }, preset: 'swinger_companion', mode: 'browse' });
  const st = { 'sensor.sc': { state: '1', attributes: { persons: [{ id: 'p1', name: 'Kim', thumb: '/t?s=1', pics: ['/p1?s=2', '/p2?s=3'] }] } } };
  fc.hass = { states: st, language: 'en', connection: conn };
  await new Promise((r) => setTimeout(r, 0));
  const fr = fc.shadowRoot;
  fr.querySelector('.dot:nth-child(3)').click();           // third picture
  assert.ok(fr.querySelector('.hero').getAttribute('src').startsWith('/p2'));
  fr.querySelector('[data-fav]').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepStrictEqual(store['profile-gallery-card'], { favs: { 'swinger_companion:p1': '/p2' } });
  assert.ok(fr.querySelector('.hero').getAttribute('src').startsWith('/p2') && fr.querySelector('.fav.on'));
  // new page view: favourite first
  const fc2 = document.createElement('profile-gallery-card');
  document.body.appendChild(fc2);
  fc2.setConfig({ source: { entity: 'sensor.sc', attribute: 'persons' }, preset: 'swinger_companion', mode: 'list' });
  fc2.hass = { states: st, language: 'en', connection: conn };
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(fc2.shadowRoot.querySelector('.av').getAttribute('src').startsWith('/p2'));
  console.log('favourite tests passed');
})();
// 0.4.0: join, html, actions with date, controls, detail window with note
(async () => {
  const calls = [];
  const st2 = {
    'sensor.auswahl': { state: '1', attributes: { karten: [{ uid: 'M1', profil: 'sensor.m1_profil', interessant: 'switch.m1_i', besucht: 'switch.m1_b', besucht_am: 'date.m1', exakt: false, treffer: '5/6', fehlt: 'AV' }],
      filter_zeilen: [[{ entity: 'number.alter_max', name: 'Alter' }, { schloss: true, entity: 'switch.pflicht_alter' }], [{ leer: true }, { entity: 'select.figur' }]] } },
    'sensor.m1_profil': { state: 'gelistet', attributes: { name: 'Ana', bilder: ['/b1', '/b2'], karte_html: '<h3>Ana, 46</h3>', kopf_html: '<b>Kopf</b>', details_html: '<table><tr><th>Alter</th><td>46</td></tr></table>', kommentar: 'alt' } },
    'switch.m1_i': { state: 'on', attributes: {} }, 'switch.m1_b': { state: 'off', attributes: {} }, 'date.m1': { state: '2026-05-13', attributes: {} },
    'switch.pflicht_alter': { state: 'on', attributes: {} },
  };
  const hass2 = { states: st2, language: 'de', callService: async (d, s, data) => { calls.push([d, s, data]); } };
  const nc = document.createElement('profile-gallery-card');
  document.body.appendChild(nc);
  nc.setConfig({ source: { entity: 'sensor.auswahl', attribute: 'karten' }, join: 'profil', preset: 'nutten_scan_karten', mode: 'grid',
    controls_from: { entity: 'sensor.auswahl', attribute: 'filter_zeilen' },
    actions: [{ field: 'interessant', icon: 'mdi:star', name: 'Interessant' }, { field: 'besucht', icon: 'mdi:check' }],
    date: { field: 'besucht_am', when: 'besucht' },
    details: { head: 'kopf_html', body: 'details_html' },
    note: { field: 'kommentar', name: 'Kommentar', service: 'nutten_scan.set_comment', data: { uid: '{uid}', kommentar: '{value}' } } });
  nc.hass = hass2;
  await new Promise((r) => setTimeout(r, 0));
  const nr = nc.shadowRoot;
  assert.ok(nr.querySelector('.html h3').textContent === 'Ana, 46');
  assert.ok(nr.querySelector('.notice').textContent.startsWith('⚠️ 5/6 · fehlt: AV'));
  assert.ok(nr.querySelector('.act.on') && !nr.querySelector('.adate'));  // date only when visited
  assert.strictEqual(nr.querySelectorAll('.crow').length, 2);
  assert.ok(nr.querySelector('.clock.on'));
  nr.querySelector('[data-act="0:1"]').click();
  assert.deepStrictEqual(calls.pop(), ['homeassistant', 'toggle', { entity_id: 'switch.m1_b' }]);
  st2['switch.m1_b'] = { state: 'on', attributes: {} };
  nc.hass = Object.assign({}, hass2, { states: Object.assign({}, st2) });
  assert.strictEqual(nr.querySelector('.adate').value, '2026-05-13');
  nr.querySelector('[data-det]').click();
  const dlg = document.querySelector('.pgc-dialog');
  assert.ok(dlg.querySelector('.dhtml b').textContent === 'Kopf' && dlg.querySelector('table'));
  assert.strictEqual(dlg.querySelectorAll('.strip img').length, 2);
  assert.strictEqual(dlg.querySelector('textarea').value, 'alt');
  dlg.querySelector('textarea').value = 'neu';
  dlg.querySelector('.save').click();
  assert.deepStrictEqual(calls.pop(), ['nutten_scan', 'set_comment', { uid: 'M1', kommentar: 'neu' }]);
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.ok(!document.querySelector('.pgc-dialog'));
  console.log('0.4.0 tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
// 0.4.1: slideshow in grid tiles, controls as first tile
(async () => {
  const gc = document.createElement('profile-gallery-card');
  document.body.appendChild(gc);
  gc.setConfig({ source: { entity: 'sensor.g', attribute: 'l' }, preset: 'none', mode: 'grid', controls: [['input_number.x']] });
  gc.hass = { states: { 'sensor.g': { state: '1', attributes: { l: [{ id: 'a', title: 'A', images: ['/1', '/2', '/3'] }] } }, 'input_number.x': { state: '1', attributes: {} } }, language: 'de' };
  const gr = gc.shadowRoot;
  assert.ok(gr.querySelector('.grid > .ctile .controls'));
  assert.strictEqual(gr.querySelector('.tc').textContent, '1 / 3');
  gr.querySelector('.tb.next').click();
  assert.strictEqual(gr.querySelector('.tc').textContent, '2 / 3');
  assert.ok(gr.querySelector('.tshow img').getAttribute('src') === '/2');
  gr.querySelector('.tb.prev').click(); gr.querySelector('.tb.prev').click();
  assert.strictEqual(gr.querySelector('.tc').textContent, '3 / 3');
  console.log('0.4.1 tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
// 0.4.3: note icon and favourite star in grid tiles
(async () => {
  const store = {};
  const conn = { sendMessagePromise: async (m) => { if (m.type === 'frontend/get_user_data') return { value: store[m.key] }; store[m.key] = m.value; return null; } };
  const gc = document.createElement('profile-gallery-card');
  document.body.appendChild(gc);
  gc.setConfig({ source: { entity: 'sensor.g2', attribute: 'l' }, preset: 'none', mode: 'grid', details: {}, note: { field: 'kommentar', service: 'x.y' } });
  gc.hass = { states: { 'sensor.g2': { state: '1', attributes: { l: [{ id: 'a', title: 'A', images: ['/1', '/2'], kommentar: 'nett' }, { id: 'b', title: 'B', images: ['/3'] }] } } }, language: 'de', connection: conn };
  await new Promise((r) => setTimeout(r, 0));
  const gr = gc.shadowRoot;
  assert.strictEqual(gr.querySelectorAll('.notei').length, 1);
  assert.strictEqual(gr.querySelector('.notei').getAttribute('title'), 'nett');
  assert.strictEqual(gr.querySelectorAll('.tfav').length, 2);
  gr.querySelector('.tb.next').click();
  gr.querySelector('.tfav').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepStrictEqual(store['profile-gallery-card'].favs, { 'none:a': '/2' });
  assert.strictEqual(gr.querySelector('.tshow img').getAttribute('src'), '/2');
  assert.strictEqual(gr.querySelector('.tc').textContent, '1 / 2');
  console.log('0.4.3 tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
// 0.4.3: preset CSS and styles option reach the card
(async () => {
  const sc = document.createElement('profile-gallery-card');
  document.body.appendChild(sc);
  sc.setConfig({ source: { entity: 'sensor.k', attribute: 'l' }, preset: 'nutten_scan_karten', mode: 'grid', styles: '.x9 { color: red; }' });
  sc.hass = { states: { 'sensor.k': { state: '1', attributes: { l: [{ uid: 'u', name: 'N', karte_html: '<div class="tabu">T</div>' }] } } }, language: 'de' };
  await new Promise((r) => setTimeout(r, 0));
  const css = sc.shadowRoot.querySelector('style').textContent;
  assert.ok(css.includes('.tabu {') && css.includes('.x9 {'));
  assert.ok(sc.shadowRoot.querySelector('.html .tabu'));
  console.log('styles tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
// notice at the top of the tile
(async () => {
  const nc = document.createElement('profile-gallery-card');
  document.body.appendChild(nc);
  nc.setConfig({ source: { entity: 'sensor.k2', attribute: 'l' }, preset: 'nutten_scan_karten', mode: 'grid' });
  nc.hass = { states: { 'sensor.k2': { state: '1', attributes: { l: [
    { uid: 'u', name: 'N', bilder: ['/a'], exakt: false, treffer: '10 von 20 Kriterien', fehlt: 'Haarfarbe', tabu: '' },
    { uid: 'v', name: 'M', bilder: ['/b'], exakt: true, treffer: '20 von 20' }] } } }, language: 'de' };
  await new Promise((r) => setTimeout(r, 0));
  const ns = nc.shadowRoot.querySelectorAll('.notice');
  assert.strictEqual(ns.length, 1);
  assert.strictEqual(ns[0].innerHTML, '⚠️ <b>10 von 20 Kriterien</b> · fehlt: Haarfarbe');
  assert.strictEqual(ns[0].parentElement.firstElementChild, ns[0]);
  assert.strictEqual(nc.shadowRoot.querySelectorAll('.badge').length, 0);
  console.log('notice tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
