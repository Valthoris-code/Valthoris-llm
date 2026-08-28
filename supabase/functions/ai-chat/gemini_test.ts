/**
 * Gemini provider tests for the `ai-chat` Edge Function.
 *
 * Gemini is the only Valthoris provider, so the request the function actually
 * sends to Google is asserted here: the model endpoint, the key in the `key`
 * query-string parameter, the system instruction and the role mapping
 * (`assistant` → `model`).
 *
 * The environment is restored after every test so the other test files are
 * unaffected.
 *
 * Run with:  deno test --allow-net --allow-env supabase/functions/ai-chat
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const realServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = () => ({ finished: Promise.resolve(), shutdown: () => Promise.resolve() });
const { handleRequest } = await import('./index.ts');
// deno-lint-ignore no-explicit-any
(Deno as any).serve = realServe;

interface Recorded {
  url: string;
  headers: Headers;
  // deno-lint-ignore no-explicit-any
  body: any;
}

let recorded: Recorded[] = [];
let answers: string[] = [];
let httpStatus = 200;
/** Model names the stub answers 404 for, as Google does for a retired model. */
let notFoundModels: string[] = [];
/** Body the stub returns when `httpStatus` is not 200. */
// deno-lint-ignore no-explicit-any
let errorBody: any = { error: 'quota' };

const realFetch = globalThis.fetch;

/** Extracts the model name from a `:generateContent` URL. */
function modelOf(url: string): string {
  return url.split('/models/')[1]?.split(':')[0] ?? '';
}

function stubGemini() {
  recorded = [];
  httpStatus = 200;
  notFoundModels = [];
  errorBody = { error: 'quota' };
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    recorded.push({
      url,
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    if (!url.startsWith('https://generativelanguage.googleapis.com/')) {
      return Promise.reject(new Error(`unexpected fetch to ${url}`));
    }
    if (notFoundModels.some((model) => url.includes(`/models/${model}:`))) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: 404, message: 'model not found', status: 'NOT_FOUND' } }),
          { status: 404 },
        ),
      );
    }
    if (httpStatus !== 200) {
      return Promise.resolve(new Response(JSON.stringify(errorBody), { status: httpStatus }));
    }
    const text = answers.shift() ?? '';
    return Promise.resolve(
      new Response(
        JSON.stringify({
          modelVersion: modelOf(url),
          candidates: [{ content: { parts: [{ text }] }, finishReason: text ? 'STOP' : 'SAFETY' }],
        }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;
}

/** Runs `fn` with only the Gemini key configured, then restores the environment. */
async function withGemini(fn: () => Promise<void>): Promise<void> {
  const previous = {
    key: Deno.env.get('GEMINI_API_KEY'),
    model: Deno.env.get('GEMINI_MODEL'),
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
  };
  // No fraud-pipeline configuration: this file only tests the completion path.
  Deno.env.delete('SUPABASE_URL');
  Deno.env.delete('GEMINI_MODEL');
  Deno.env.set('GEMINI_API_KEY', 'test-gemini-key');
  stubGemini();
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
    if (previous.key) Deno.env.set('GEMINI_API_KEY', previous.key);
    else Deno.env.delete('GEMINI_API_KEY');
    if (previous.model) Deno.env.set('GEMINI_MODEL', previous.model);
    else Deno.env.delete('GEMINI_MODEL');
    if (previous.supabaseUrl) Deno.env.set('SUPABASE_URL', previous.supabaseUrl);
  }
}

function post(body: unknown): Request {
  return new Request('https://stub.functions.test/ai-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test('Gemini is used by default and its answer reaches the caller', async () => {
  await withGemini(async () => {
    answers = ['Este domínio imita um banco e pede credenciais.'];

    const res = await handleRequest(
      post({ messages: [{ role: 'user', content: 'Analisa este domínio: banco-seguro.test' }] }),
    );

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.provider, 'gemini');
    assertEquals(body.model, 'gemini-2.5-flash');
    assertEquals(body.content, 'Este domínio imita um banco e pede credenciais.');
    assert(!String(body.content).includes('Backend integration pending'));

    assertEquals(recorded.length, 1);
    const call = recorded[0];
    assert(
      call.url.startsWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=test-gemini-key',
      ),
      call.url,
    );
    // The key travels in the query string, as the REST API requires.
    assert(call.url.includes('?key=test-gemini-key'), call.url);
    assertEquals(call.headers.get('Content-Type'), 'application/json');
    assertEquals(call.body.contents[0].role, 'user');
    assert(String(call.body.systemInstruction.parts[0].text).includes('VALTHORIS'));
  });
});

Deno.test('the assistant turn is mapped to the Gemini "model" role', async () => {
  await withGemini(async () => {
    answers = ['Sim, continua a parecer fraudulento.'];

    await handleRequest(
      post({
        messages: [
          { role: 'user', content: 'Este endereço parece uma fraude?' },
          { role: 'assistant', content: 'Sim, tem indicadores de fraude.' },
          { role: 'user', content: 'E este outro?' },
        ],
      }),
    );

    assertEquals(
      recorded[0].body.contents.map((c: { role: string }) => c.role),
      ['user', 'model', 'user'],
    );
  });
});

Deno.test('a Gemini failure is generic, never a raw status nor a placeholder', async () => {
  await withGemini(async () => {
    httpStatus = 429;

    const res = await handleRequest(post({ messages: [{ role: 'user', content: 'Verifica 1.2.3.4' }] }));

    assertEquals(res.status, 502);
    const body = await res.json();
    // With no second provider configured the turn fails — but the rate limit
    // stays in the logs: the user sees one generic sentence and no answer.
    assertEquals(body.error, 'De momento não consigo processar o seu pedido, tente novamente em instantes.');
    assert(!String(body.error).includes('429'), body.error);
    assert(!String(body.error).includes('quota'));
    assertEquals(body.content, undefined);
  });
});

Deno.test('an empty Gemini completion is reported generically', async () => {
  await withGemini(async () => {
    answers = [''];

    const res = await handleRequest(post({ messages: [{ role: 'user', content: 'Analisa isto' }] }));

    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.error, 'De momento não consigo processar o seu pedido, tente novamente em instantes.');
    assertEquals(body.content, undefined);
  });
});

Deno.test('a Gemini authentication failure never reaches the conversation', async () => {
  await withGemini(async () => {
    httpStatus = 403;
    errorBody = {
      error: {
        code: 403,
        message: 'Requests from referer are blocked. API key not valid.',
        status: 'PERMISSION_DENIED',
      },
    };

    const res = await handleRequest(post({ messages: [{ role: 'user', content: 'Verifica isto' }] }));

    assertEquals(res.status, 502);
    const body = await res.json();
    // Google's own diagnostic is for the operator's logs, not for the user.
    assertEquals(body.error, 'De momento não consigo processar o seu pedido, tente novamente em instantes.');
    assert(!String(body.error).includes('API key'), body.error);
  });
});

Deno.test('no other provider is ever contacted', async () => {
  await withGemini(async () => {
    answers = ['Resposta.'];
    await handleRequest(post({ messages: [{ role: 'user', content: 'olá' }] }));
    assertEquals(recorded.length, 1);
    assert(recorded[0].url.startsWith('https://generativelanguage.googleapis.com/'), recorded[0].url);
  });
});

Deno.test('with no provider configured the user still gets the generic message', async () => {
  const previous = Deno.env.get('GEMINI_API_KEY');
  Deno.env.delete('GEMINI_API_KEY');
  try {
    const res = await handleRequest(post({ messages: [{ role: 'user', content: 'olá' }] }));
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.error, 'De momento não consigo processar o seu pedido, tente novamente em instantes.');
  } finally {
    if (previous) Deno.env.set('GEMINI_API_KEY', previous);
  }
});

Deno.test('a "models/"-prefixed GEMINI_MODEL still builds a valid endpoint', async () => {
  await withGemini(async () => {
    Deno.env.set('GEMINI_MODEL', '  models/gemini-2.5-pro  ');
    answers = ['Resposta.'];

    const res = await handleRequest(post({ messages: [{ role: 'user', content: 'olá' }] }));

    assertEquals(res.status, 200);
    assertEquals(
      recorded[0].url,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=test-gemini-key',
    );
  });
});

Deno.test('a blank GEMINI_MODEL falls back to the default model', async () => {
  await withGemini(async () => {
    Deno.env.set('GEMINI_MODEL', '   ');
    answers = ['Resposta.'];

    const res = await handleRequest(post({ messages: [{ role: 'user', content: 'olá' }] }));

    assertEquals(res.status, 200);
    assert(recorded[0].url.includes('/models/gemini-2.5-flash:generateContent'), recorded[0].url);
  });
});

Deno.test('a retired model answering 404 is retried on a supported one', async () => {
  await withGemini(async () => {
    Deno.env.set('GEMINI_MODEL', 'gemini-1.5-flash');
    notFoundModels = ['gemini-1.5-flash'];
    answers = ['Resposta real.'];

    const res = await handleRequest(post({ messages: [{ role: 'user', content: 'olá' }] }));

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.content, 'Resposta real.');
    assertEquals(recorded.length, 2);
    assert(recorded[0].url.includes('/models/gemini-1.5-flash:'), recorded[0].url);
    assert(recorded[1].url.includes('/models/gemini-2.5-flash:'), recorded[1].url);
  });
});

Deno.test('when every model answers 404 the user sees the generic message', async () => {
  await withGemini(async () => {
    notFoundModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

    const res = await handleRequest(post({ messages: [{ role: 'user', content: 'olá' }] }));

    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.error, 'De momento não consigo processar o seu pedido, tente novamente em instantes.');
    assert(!String(body.error).includes('404'), body.error);
  });
});
