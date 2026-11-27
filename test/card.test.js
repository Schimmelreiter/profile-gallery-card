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
