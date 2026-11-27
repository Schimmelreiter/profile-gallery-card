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
