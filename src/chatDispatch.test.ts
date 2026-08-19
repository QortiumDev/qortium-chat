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
