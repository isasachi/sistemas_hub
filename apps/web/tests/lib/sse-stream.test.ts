import { describe, it, expect } from 'vitest';
import { readSSEStream, type SSEEvent } from '@/components/tools/ui/SSEStatus';

// body-like fake: getReader() entrega los chunks (string→Uint8Array) en orden.
function fakeBody(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return {
    getReader: () => ({
      read: async () =>
        i < chunks.length
          ? { done: false, value: enc.encode(chunks[i++]) }
          : { done: true, value: undefined },
    }),
  } as unknown as ReadableStream<Uint8Array>;
}

function collect(res: { ok: boolean; status: number; body: ReadableStream<Uint8Array> | null }) {
  const events: SSEEvent[] = [];
  return readSSEStream(res, (e) => events.push(e)).then(() => events);
}

describe('readSSEStream', () => {
  it('emite error cuando la respuesta no es ok (504/500/429)', async () => {
    const events = await collect({ ok: false, status: 504, body: fakeBody([]) });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('error');
    expect(events[0].retryable).toBe(true);
  });

  it('emite error cuando no hay body', async () => {
    const events = await collect({ ok: true, status: 200, body: null });
    expect(events[0].status).toBe('error');
  });

  it('emite error si el stream termina SIN evento terminal', async () => {
    const events = await collect({ ok: true, status: 200, body: fakeBody(['data: {"status":"progress","message":"x"}\n']) });
    expect(events.map((e) => e.status)).toEqual(['progress', 'error']);
  });

  it('NO emite error espurio cuando llega el evento done', async () => {
    const events = await collect({ ok: true, status: 200, body: fakeBody(['data: {"status":"done","imageUrl":"u"}\n']) });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('done');
  });

  it('reensambla una línea data: partida entre dos chunks', async () => {
    const events = await collect({
      ok: true,
      status: 200,
      body: fakeBody(['data: {"sta', 'tus":"done"}\n']),
    });
    expect(events.map((e) => e.status)).toEqual(['done']);
  });
});
