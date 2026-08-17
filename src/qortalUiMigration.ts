export type LegacyQortiumMigrationHint = {
  legacyLookupComplete: boolean;
  legacyQortiumAccountAddress: string | null;
};

/** currentAccountAddressRef intentionally retains the prior identity while a
 * Qortium refresh is in flight. It is not a migration hint until that refresh
 * settles; passing it could bind a newly selected Qortal identity to the old
 * Qortium account's legacy metadata. */
export function getLegacyQortiumMigrationHint(
  currentQortiumAccountAddress: string | null,
  qortiumRefreshPending: boolean,
): LegacyQortiumMigrationHint {
  return qortiumRefreshPending
    ? { legacyLookupComplete: false, legacyQortiumAccountAddress: null }
    : {
        legacyLookupComplete: true,
        legacyQortiumAccountAddress: currentQortiumAccountAddress,
      };
}
