import { describe, expect, it } from 'vitest';

import { getDirectSectionDefaultCollapse } from './sidebarSections';

describe('getDirectSectionDefaultCollapse', () => {
  it('waits for bridge capabilities before applying a default', () => {
    expect(getDirectSectionDefaultCollapse({
      activeChatsPhase: 'ready',
      bridgeReady: false,
      canOpenDirectChat: false,
      directCount: 0,
    })).toBeNull();
  });

  it('collapses when direct chat is unavailable in the host', () => {
    expect(getDirectSectionDefaultCollapse({
      activeChatsPhase: 'idle',
      bridgeReady: true,
      canOpenDirectChat: false,
      directCount: 2,
    })).toBe(true);
  });

  it('collapses when a successful load finds no direct chats', () => {
    expect(getDirectSectionDefaultCollapse({
      activeChatsPhase: 'ready',
      bridgeReady: true,
      canOpenDirectChat: true,
      directCount: 0,
    })).toBe(true);
  });

  it('does not override the layout while an empty list is loading or failed', () => {
    for (const activeChatsPhase of ['idle', 'loading', 'error'] as const) {
      expect(getDirectSectionDefaultCollapse({
        activeChatsPhase,
        bridgeReady: true,
        canOpenDirectChat: true,
        directCount: 0,
      })).toBeNull();
    }
  });

  it('records a settled non-collapse decision when direct chats exist', () => {
    expect(getDirectSectionDefaultCollapse({
      activeChatsPhase: 'loading',
      bridgeReady: true,
      canOpenDirectChat: true,
      directCount: 1,
    })).toBe(false);
  });
});
