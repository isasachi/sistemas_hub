import { describe, it, expect } from 'vitest';
import { resolveSearchStatus } from '@/lib/product-hunter/search-status';

describe('resolveSearchStatus', () => {
  it('ready cuando hay productos que mostrar', () => {
    expect(resolveSearchStatus(3, 'active', 0)).toBe('ready');
  });

  it('pending cuando el nicho aún no fue scrapeado (status != active)', () => {
    expect(resolveSearchStatus(0, 'pending', 0)).toBe('pending');
  });

  it('pending cuando está scrapeado pero el análisis sigue en curso', () => {
    // active + 0 cards PERO quedan productos sin analizar → NO es vacío real.
    expect(resolveSearchStatus(0, 'active', 5)).toBe('pending');
  });

  it('empty solo cuando ya se analizó todo y nada cumple las reglas', () => {
    expect(resolveSearchStatus(0, 'active', 0)).toBe('empty');
  });
});
