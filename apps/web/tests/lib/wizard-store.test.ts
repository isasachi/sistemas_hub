import { describe, it, expect, afterEach, vi } from 'vitest';
import { useWizardStore } from '@/store/wizard';

afterEach(() => {
  vi.unstubAllGlobals();
  useWizardStore.setState({ sessionId: null, sessionError: false });
});

describe('startNewSession', () => {
  it('setea sessionError (no deja sessionId null silencioso) si el POST falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await useWizardStore.getState().startNewSession();
    expect(useWizardStore.getState().sessionId).toBeNull();
    expect(useWizardStore.getState().sessionError).toBe(true);
  });

  it('setea sessionError si la respuesta no es ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await useWizardStore.getState().startNewSession();
    expect(useWizardStore.getState().sessionError).toBe(true);
  });

  it('setea sessionId en el camino feliz', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'abc' }) }));
    await useWizardStore.getState().startNewSession();
    expect(useWizardStore.getState().sessionId).toBe('abc');
    expect(useWizardStore.getState().sessionError).toBe(false);
  });
});
