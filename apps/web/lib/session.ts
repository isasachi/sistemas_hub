import { cookies } from 'next/headers';
import { getSession } from './db';
import type { SessionResponse } from './types';

export const SESSION_COOKIE = 'sid';

export async function readSessionFromCookie(): Promise<SessionResponse | null> {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return getSession(id);
}
