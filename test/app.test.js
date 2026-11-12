const test = require('node:test');
const assert = require('node:assert');
const { createApp, markdownToHtml } = require('../server');

async function boot() {
  const app = createApp(':memory:');
  const server = app.listen(0); const base = `http://localhost:${server.address().port}`;
  const as = (u) => async (path, opts = {}) => {
    const r = await fetch(base + path, { ...opts, headers: { cookie: `user=${u}`, ...(opts.body && !(opts.body instanceof FormData) ? { 'content-type': 'application/json' } : {}) } });
    return { status: r.status, body: await r.json() };
  };
  return { 
    alice: as('alice'), 
    bob: as('bob'), 
    carol: as('carol'), 
    anon: as('nobody'), 
    stop: () => server.close() 
  };
}
const j = (o) => ({ method: 'POST', body: JSON.stringify(o) });
const patch = (o) => ({ method: 'PATCH', body: JSON.stringify(o) });

test('sharing: owner grants access, roles enforced, content sanitized', async () => {
  const t = await boot();
  try {
    assert.strictEqual((await t.anon('/api/docs')).status, 401);
    const doc = (await t.alice('/api/docs', j({ title: 'Plan' }))).body;
    await t.alice(`/api/docs/${doc.id}`, patch({ content: '<h1>Hi</h1><p><b>bold</b><script>alert(1)</script></p>' }));
    assert.strictEqual((await t.bob(`/api/docs/${doc.id}`)).status, 404);

    await t.alice(`/api/docs/${doc.id}/shares`, j({ username: 'bob', role: 'view' }));
    const list = (await t.bob('/api/docs')).body;
    assert.strictEqual(list.shared[0].role, 'view');
    assert.strictEqual(list.owned.length, 0);
    const got = (await t.bob(`/api/docs/${doc.id}`)).body;
    assert.ok(got.content.includes('<b>bold</b>') && !got.content.includes('script'));
    assert.strictEqual((await t.bob(`/api/docs/${doc.id}`, patch({ title: 'x' }))).status, 403);

    await t.alice(`/api/docs/${doc.id}/shares`, j({ username: 'bob', role: 'edit' }));
    assert.strictEqual((await t.bob(`/api/docs/${doc.id}`, patch({ title: 'Renamed' }))).status, 200);
    assert.strictEqual((await t.bob(`/api/docs/${doc.id}/shares`, j({ username: 'carol' }))).status, 403);
    assert.strictEqual((await t.alice(`/api/docs/${doc.id}`, patch({ title: '  ' }))).status, 400);
  } finally { t.stop(); }
});

test('upload: markdown becomes a document; bad types rejected', async () => {
  const t = await boot();
  try {
    const form = new FormData(); form.append('file', new Blob(['# Title\n\n- one\n- **two**']), 'notes.md');
    const r = await t.alice('/api/upload', { method: 'POST', body: form });
    assert.strictEqual(r.status, 201);
    const d = (await t.alice(`/api/docs/${r.body.id}`)).body;
    assert.ok(d.content.includes('<h1>Title</h1>') && d.content.includes('<li><b>two</b></li>'));
    const bad = new FormData(); bad.append('file', new Blob(['x']), 'a.exe');
    assert.strictEqual((await t.alice('/api/upload', { method: 'POST', body: bad })).status, 400);
  } finally { t.stop(); }
});

test('markdownToHtml escapes raw HTML', () => {
  assert.ok(!markdownToHtml('<script>x</script>').includes('<script>'));
});
