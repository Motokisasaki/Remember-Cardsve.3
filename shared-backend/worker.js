export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), origin);
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      const raw = await env.GBC_FLASHCARDS_KV.get('dataset');
      return jsonResponse({
        ok: true,
        service: 'gbc-flashcards-shared-dataset',
        hasDataset: Boolean(raw),
      }, 200, origin);
    }

    if (url.pathname !== '/dataset') {
      return jsonResponse({ ok: false, error: 'not_found' }, 404, origin);
    }

    if (request.method === 'GET') {
      const raw = await env.GBC_FLASHCARDS_KV.get('dataset');
      if (!raw) {
        return jsonResponse({ ok: false, error: 'empty_dataset' }, 404, origin);
      }
      return jsonResponse(JSON.parse(raw), 200, origin);
    }

    if (request.method === 'POST') {
      let body = null;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ ok: false, error: 'invalid_json' }, 400, origin);
      }

      if (!body?.adminKey || body.adminKey !== env.ADMIN_KEY) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401, origin);
      }

      const items = Array.isArray(body?.dataset?.items) ? body.dataset.items : [];
      if (!items.length) {
        return jsonResponse({ ok: false, error: 'empty_items' }, 400, origin);
      }

      const payload = {
        ok: true,
        version: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
        fileName: String(body.fileName || 'uploaded.xlsx'),
        itemCount: items.length,
        dataset: body.dataset,
      };

      await env.GBC_FLASHCARDS_KV.put('dataset', JSON.stringify(payload));
      return jsonResponse(payload, 200, origin);
    }

    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, origin);
  },
};

function jsonResponse(data, status, origin) {
  return withCors(new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  }), origin);
}

function withCors(response, origin) {
  response.headers.set('Access-Control-Allow-Origin', origin || '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  response.headers.set('Vary', 'Origin');
  return response;
}
