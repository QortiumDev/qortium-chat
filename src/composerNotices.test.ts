import { describe, expect, it } from 'vitest';
import { shouldShowGroupApprovalHint } from './composerNotices';

describe('shouldShowGroupApprovalHint', () => {
  it('shows the approval hint for an ordinary membership notice', () => {
    expect(shouldShowGroupApprovalHint({ privateFeatureUnavailable: false, sendUnsupportedByHost: false })).toBe(true);
  });

  it('hides it when the notice is "this host cannot send in closed groups" (Home 1.x limited state)', () => {
    expect(shouldShowGroupApprovalHint({ privateFeatureUnavailable: false, sendUnsupportedByHost: true })).toBe(false);
  });

  it('hides it when the general join is confirmed and only private membership is pending', () => {
    expect(
      shouldShowGroupApprovalHint({ privateFeatureUnavailable: false, privateMembershipPending: true, sendUnsupportedByHost: false }),
    ).toBe(false);
  });

  it('hides it when the private family is entirely unavailable', () => {
    expect(shouldShowGroupApprovalHint({ privateFeatureUnavailable: true, sendUnsupportedByHost: false })).toBe(false);
    expect(shouldShowGroupApprovalHint({ privateFeatureUnavailable: true, sendUnsupportedByHost: true })).toBe(false);
  });
});
