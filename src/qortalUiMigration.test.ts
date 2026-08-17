import { describe, expect, it } from 'vitest';
import { getLegacyQortiumMigrationHint } from './qortalUiMigration';

describe('getLegacyQortiumMigrationHint', () => {
  it('withholds the old non-null Qortium ref while a simultaneous account switch is pending', () => {
    expect(getLegacyQortiumMigrationHint('Qortium-A', true)).toEqual({
      legacyLookupComplete: false,
      legacyQortiumAccountAddress: null,
    });
  });

  it('exposes only the settled Qortium identity after refresh', () => {
    expect(getLegacyQortiumMigrationHint('Qortium-B', false)).toEqual({
      legacyLookupComplete: true,
      legacyQortiumAccountAddress: 'Qortium-B',
    });
    expect(getLegacyQortiumMigrationHint(null, false)).toEqual({
      legacyLookupComplete: true,
      legacyQortiumAccountAddress: null,
    });
  });
});
