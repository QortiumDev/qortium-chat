// Pure helpers for the composer notice block, kept out of App.tsx so the
// combinations are unit-testable.

// The "an administrator may still need to approve your join request" hint is
// a membership hint. It must not be appended under a notice whose cause is
// the HOST (the private send action is missing), or the group's own admin is
// told to wait for an admin — the exact report from a Home 1.x user. It is
// also suppressed when the private family is entirely unavailable (existing
// behavior) and when the general join is already confirmed and only the
// private membership (key bundle) is pending — that is resolved by key
// reconciliation, not by an admin approving a join request.
export function shouldShowGroupApprovalHint(input: {
  privateFeatureUnavailable: boolean;
  privateMembershipPending?: boolean;
  sendUnsupportedByHost: boolean;
}) {
  return !input.privateFeatureUnavailable && !input.sendUnsupportedByHost && !input.privateMembershipPending;
}
