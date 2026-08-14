/**
 * Monotonic request guard for async work whose older results must be ignored.
 * Each begin() invalidates every token returned before it.
 */
export class LatestRequestGuard {
  private latestRequestId = 0;

  begin() {
    this.latestRequestId += 1;
    return this.latestRequestId;
  }

  isLatest(requestId: number) {
    return requestId === this.latestRequestId;
  }
}
