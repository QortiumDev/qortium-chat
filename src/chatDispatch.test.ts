import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchChatRevisionEntry, dispatchChatSendEntry } from './chatDispatch';

const qdnRequestMock = vi.hoisted(() => vi.fn());
const qortalRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./qdnRequest', async () => {
  const actual = await vi.importActual<typeof import('./qdnRequest')>('./qdnRequest');

  return {
    ...actual,
    buildNodeWebSocketUrl: (path: string) => `ws://127.0.0.1:24891${path}`,
    qdnRequest: qdnRequestMock,
  };
});

vi.mock('./qortalRequest', () => ({
  qortalRequest: qortalRequestMock,
}));

function actionsCalledWith(mock: typeof qdnRequestMock) {
  return mock.mock.calls.map(([request]) => (request as { action?: string }).action);
}

describe('dispatchChatSendEntry — P3 safety invariant', () => {
  beforeEach(() => {
    qdnRequestMock.mockReset();
    qortalRequestMock.mockReset();
    qdnRequestMock.mockResolvedValue({ signature: 'sig-1', timestamp: 1000 });
    qortalRequestMock.mockResolvedValue({ signature: 'sig-1', timestamp: 1000 });
  });

  it('routes a closed (isPrivate) group message through the exact private action, never the generic one', async () => {
    const entry = {
      content: undefined,
      contentState: undefined,
      kind: 'message' as const,
      target: { groupId: 7, isPrivate: true, kind: 'group' as const },
      text: 'hello group',
    };

    await dispatchChatSendEntry(entry, ['SEND_PRIVATE_GROUP_CHAT_MESSAGE']);

    expect(actionsCalledWith(qdnRequestMock)).toEqual(['SEND_PRIVATE_GROUP_CHAT_MESSAGE']);
    expect(qdnRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SEND_PRIVATE_GROUP_CHAT_MESSAGE', groupId: 7, message: 'hello group' }),
    );
  });

  it('never produces a generic SEND_CHAT_MESSAGE call for a closed group when the private family is unadvertised', async () => {
    const entry = {
      content: undefined,
      contentState: undefined,
      kind: 'message' as const,
      target: { groupId: 7, isPrivate: true, kind: 'group' as const },
      text: 'hello group',
    };

    await expect(dispatchChatSendEntry(entry, [])).rejects.toThrow(
      /private group chat sends require/i,
    );

    expect(qdnRequestMock).not.toHaveBeenCalled();
    expect(actionsCalledWith(qdnRequestMock)).not.toContain('SEND_CHAT_MESSAGE');
  });

  it('routes a closed-group reaction through SEND_PRIVATE_GROUP_CHAT_REACTION, never the generic action', async () => {
    const entry = {
      content: '👍',
      contentState: true,
      chatReference: 'orig-sig',
      kind: 'reaction' as const,
      target: { groupId: 7, isPrivate: true, kind: 'group' as const },
      text: 'ignored',
    };

    await dispatchChatSendEntry(entry, ['SEND_PRIVATE_GROUP_CHAT_REACTION']);

    expect(actionsCalledWith(qdnRequestMock)).toEqual(['SEND_PRIVATE_GROUP_CHAT_REACTION']);
  });

  it('still routes an OPEN group message through the generic SEND_CHAT_MESSAGE action (regression guard)', async () => {
    const entry = {
      content: undefined,
      contentState: undefined,
      kind: 'message' as const,
      target: { groupId: 7, kind: 'group' as const },
      text: 'hello open group',
    };

    await dispatchChatSendEntry(entry, []);

    expect(actionsCalledWith(qdnRequestMock)).toEqual(['SEND_CHAT_MESSAGE']);
  });

  it('routes a closed Qortal group message through qortalRequest, never qdnRequest', async () => {
    const entry = {
      content: undefined,
      contentState: undefined,
      kind: 'message' as const,
      target: { groupId: 7, isPrivate: true, kind: 'group' as const, network: 'qortal' as const },
      text: 'hello qortal group',
    };

    await dispatchChatSendEntry(entry, ['SEND_PRIVATE_GROUP_CHAT_MESSAGE']);

    expect(actionsCalledWith(qortalRequestMock)).toEqual(['SEND_PRIVATE_GROUP_CHAT_MESSAGE']);
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('passes the Qortium plaintext cap through to the private wrapper and rejects an oversized draft before any bridge call', async () => {
    const entry = {
      content: undefined,
      contentState: undefined,
      kind: 'message' as const,
      target: { groupId: 7, isPrivate: true, kind: 'group' as const },
      text: 'x'.repeat(50),
    };

    await expect(
      dispatchChatSendEntry(entry, ['SEND_PRIVATE_GROUP_CHAT_MESSAGE'], { privateGroupMaxPlaintextBytes: 10 }),
    ).rejects.toThrow(/at most 10 UTF-8 bytes/);

    expect(qdnRequestMock).not.toHaveBeenCalled();
  });
});

describe('dispatchChatRevisionEntry — P3 safety invariant', () => {
  beforeEach(() => {
    qdnRequestMock.mockReset();
    qortalRequestMock.mockReset();
    qdnRequestMock.mockResolvedValue({ signature: 'sig-1', timestamp: 1000 });
  });

  it('routes a closed-group edit through SEND_PRIVATE_GROUP_CHAT_EDIT, never the generic edit/send actions', async () => {
    const entry = {
      chatReference: 'orig-sig',
      kind: 'edit' as const,
      repliedTo: null,
      target: { groupId: 7, isPrivate: true, kind: 'group' as const },
      text: 'edited body',
    };

    await dispatchChatRevisionEntry(entry, ['SEND_PRIVATE_GROUP_CHAT_EDIT']);

    expect(actionsCalledWith(qdnRequestMock)).toEqual(['SEND_PRIVATE_GROUP_CHAT_EDIT']);
  });

  it('routes a closed-group delete through SEND_PRIVATE_GROUP_CHAT_DELETE, never the generic delete/send actions', async () => {
    const entry = {
      chatReference: 'orig-sig',
      kind: 'delete' as const,
      repliedTo: null,
      target: { groupId: 7, isPrivate: true, kind: 'group' as const },
      text: 'ignored',
    };

    await dispatchChatRevisionEntry(entry, ['SEND_PRIVATE_GROUP_CHAT_DELETE']);

    expect(actionsCalledWith(qdnRequestMock)).toEqual(['SEND_PRIVATE_GROUP_CHAT_DELETE']);
  });

  it('never falls back to a generic action for a closed-group revision when the private family is unadvertised', async () => {
    const editEntry = {
      chatReference: 'orig-sig',
      kind: 'edit' as const,
      repliedTo: null,
      target: { groupId: 7, isPrivate: true, kind: 'group' as const },
      text: 'edited body',
    };

    await expect(dispatchChatRevisionEntry(editEntry, [])).rejects.toThrow(/private group chat edits require/i);
    expect(qdnRequestMock).not.toHaveBeenCalled();

    const deleteEntry = {
      chatReference: 'orig-sig',
      kind: 'delete' as const,
      repliedTo: null,
      target: { groupId: 7, isPrivate: true, kind: 'group' as const },
      text: 'ignored',
    };

    await expect(dispatchChatRevisionEntry(deleteEntry, [])).rejects.toThrow(/private group chat deletes require/i);
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('still routes an OPEN group edit through the generic SEND_CHAT_MESSAGE fallback when SEND_CHAT_EDIT is unadvertised (regression guard)', async () => {
    const entry = {
      chatReference: 'orig-sig',
      kind: 'edit' as const,
      repliedTo: null,
      target: { groupId: 7, kind: 'group' as const },
      text: 'edited body',
    };

    await dispatchChatRevisionEntry(entry, []);

    expect(actionsCalledWith(qdnRequestMock)).toEqual(['SEND_CHAT_MESSAGE']);
  });
});

// Home 1.x on a trusted node: private reads + generic send advertised, exact
// private send absent (electron/qdn-app-actions.ts at v1.8.0). Home 1.x routes
// a closed groupId through Core's private-group send itself.
const HOME_1X_TRUSTED_NODE_ACTIONS = [
  'SEND_CHAT_MESSAGE',
  'SEARCH_CHAT_MESSAGES',
  'GET_PRIVATE_GROUP_ACTIVE_CHATS',
  'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES',
  'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES',
];

describe('dispatchChatSendEntry — Home 1.x legacy private-group route', () => {
  beforeEach(() => {
    qdnRequestMock.mockReset();
    qortalRequestMock.mockReset();
    qdnRequestMock.mockResolvedValue({ signature: 'sig-1', timestamp: 1000 });
    qortalRequestMock.mockResolvedValue({ signature: 'sig-1', timestamp: 1000 });
  });

  const closedGroupEntry = {
    content: undefined,
    contentState: undefined,
    kind: 'message' as const,
    target: { groupId: 7, isPrivate: true, kind: 'group' as const },
    text: 'hello closed group',
  };

  it('rides the generic SEND_CHAT_MESSAGE envelope (with groupId) on the Home 1.x trusted-node signature', async () => {
    await dispatchChatSendEntry(closedGroupEntry, HOME_1X_TRUSTED_NODE_ACTIONS);

    expect(actionsCalledWith(qdnRequestMock)).toEqual(['SEND_CHAT_MESSAGE']);
    expect(qdnRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SEND_CHAT_MESSAGE', groupId: 7, txGroupId: 7, message: 'hello closed group' }),
    );
  });

  it('routes a closed-group reply and reaction through the generic envelope on that signature', async () => {
    await dispatchChatSendEntry({ ...closedGroupEntry, chatReference: 'ref-1' }, HOME_1X_TRUSTED_NODE_ACTIONS);
    await dispatchChatSendEntry(
      { ...closedGroupEntry, chatReference: 'ref-1', content: '👍', contentState: true, kind: 'reaction' as const },
      HOME_1X_TRUSTED_NODE_ACTIONS,
    );

    expect(actionsCalledWith(qdnRequestMock)).toEqual(['SEND_CHAT_MESSAGE', 'SEND_CHAT_MESSAGE']);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ chatReference: 'ref-1', groupId: 7 }));
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ chatReference: 'ref-1', groupId: 7 }));
  });

  it('still prefers the exact private action when a host advertises it alongside the reads', async () => {
    await dispatchChatSendEntry(closedGroupEntry, [...HOME_1X_TRUSTED_NODE_ACTIONS, 'SEND_PRIVATE_GROUP_CHAT_MESSAGE']);

    expect(actionsCalledWith(qdnRequestMock)).toEqual(['SEND_PRIVATE_GROUP_CHAT_MESSAGE']);
  });

  it('does NOT match Home 1.x on a public node (private reads stripped) — generic send is still refused', async () => {
    await expect(
      dispatchChatSendEntry(closedGroupEntry, ['SEND_CHAT_MESSAGE', 'SEARCH_CHAT_MESSAGES']),
    ).rejects.toThrow(/private group chat sends require/i);
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('does NOT apply to the Qortal bridge even with the same signature', async () => {
    await expect(
      dispatchChatSendEntry(
        { ...closedGroupEntry, target: { ...closedGroupEntry.target, network: 'qortal' as const } },
        HOME_1X_TRUSTED_NODE_ACTIONS,
      ),
    ).rejects.toThrow(/private group chat sends require/i);
    expect(qdnRequestMock).not.toHaveBeenCalled();
    expect(qortalRequestMock).not.toHaveBeenCalled();
  });

  it('routes closed-group edits and deletes through the generic envelope on that signature', async () => {
    await dispatchChatRevisionEntry(
      { chatReference: 'ref-1', kind: 'edit', repliedTo: null, target: closedGroupEntry.target, text: 'edited' },
      HOME_1X_TRUSTED_NODE_ACTIONS,
    );
    await dispatchChatRevisionEntry(
      { chatReference: 'ref-1', kind: 'delete', repliedTo: null, target: closedGroupEntry.target, text: '' },
      HOME_1X_TRUSTED_NODE_ACTIONS,
    );

    expect(actionsCalledWith(qdnRequestMock)).toEqual(['SEND_CHAT_MESSAGE', 'SEND_CHAT_MESSAGE']);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ chatReference: 'ref-1', groupId: 7 }));
  });
});
