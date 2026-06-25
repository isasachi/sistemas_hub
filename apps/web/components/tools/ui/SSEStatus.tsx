'use client';

import { useEffect } from 'react';

export interface SSEEvent {
  status: string;
  message?: string;
  imageUrl?: string;
  images?: string[];
  retryable?: boolean;
}

interface SSEStatusProps {
  url: string;
  body?: Record<string, unknown>;
  onEvent: (event: SSEEvent) => void;
}

interface SSEResponse {
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
}

/**
 * Lee un stream SSE y emite cada evento. Garantiza que el consumidor SIEMPRE
 * reciba un evento terminal (done/error) — antes un 504/500/429 (body sin
 * líneas `data:`) o un corte de conexión dejaban el spinner girando para siempre.
 */
export async function readSSEStream(res: SSEResponse, onEvent: (e: SSEEvent) => void): Promise<void> {
  let sawTerminal = false;
  const emit = (e: SSEEvent) => {
    if (e.status === 'done' || e.status === 'error') sawTerminal = true;
    onEvent(e);
  };

  if (!res.ok) {
    emit({ status: 'error', message: `Error del servidor (${res.status})`, retryable: true });
    return;
  }
  if (!res.body) {
    emit({ status: 'error', message: 'No response body' });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // Procesa solo líneas completas; deja el resto incompleto en `buf` (una línea
    // `data:` partida entre dos reads se perdía silenciosa).
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          emit(JSON.parse(line.slice(6)) as SSEEvent);
        } catch {
          // malformed line — skip
        }
      }
    }
  }

  // El stream se cerró sin un evento terminal (timeout, conexión cortada).
  if (!sawTerminal) {
    emit({ status: 'error', message: 'La conexión se cerró antes de terminar', retryable: true });
  }
}

export function SSEStatus({ url, body, onEvent }: SSEStatusProps) {
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          ...(body
            ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
            : {}),
        });
        await readSSEStream(res, onEvent);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          onEvent({ status: 'error', message: String(err), retryable: true });
        }
      }
    })();

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return null;
}
