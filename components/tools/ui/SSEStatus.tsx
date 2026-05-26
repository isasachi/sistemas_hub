'use client';

import { useEffect } from 'react';

interface SSEEvent {
  status: string;
  message?: string;
  imageUrl?: string;
  retryable?: boolean;
}

interface SSEStatusProps {
  url: string;
  body?: Record<string, unknown>;
  onEvent: (event: SSEEvent) => void;
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

        if (!res.body) {
          onEvent({ status: 'error', message: 'No response body' });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6)) as SSEEvent;
                onEvent(data);
              } catch {
                // malformed line — skip
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          onEvent({ status: 'error', message: String(err) });
        }
      }
    })();

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return null;
}
