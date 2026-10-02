import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeRequest } from './chatNetwork';
import { publishRequest } from './publishProgress';
import { publishChatAttachment, publishQdnResource, publishQdnResourceBytes } from './coreApi';

vi.mock('./chatNetwork', () => ({ bridgeRequest: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

function fixture() {
  const frame = new EventTarget() as EventTarget & { parent: unknown };
  frame.parent = {};
  vi.stubGlobal('window', frame);
  const calls: { request: Record<string, unknown>; resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];
  vi.mocked(bridgeRequest).mockImplementation((_network, request) => new Promise((resolve, reject) => {
    calls.push({ request, resolve, reject });
  }));
  function emit(index: number, phase: string, fields = {}, source: unknown = frame) {
    const event = new Event('message');
    Object.assign(event, { source, data: {
      type: 'QDN_PUBLISH_PROGRESS', protocol: 'qdnRequest',
      progressId: calls[index].request.progressId, action: calls[index].request.action, phase, ...fields,
    } });
    frame.dispatchEvent(event);
  }
  return { frame, calls, emit };
}

describe('publish request progress', () => {
  it.each(['private', 'source', 'bytes'] as const)('wires progress through the %s attachment API', async (kind) => {
    const f = fixture(); const progress = vi.fn();
    const result = kind === 'private'
      ? publishChatAttachment('qortium', 'fixture-source', { kind: 'direct', otherAddress: 'other' }, ['PUBLISH_CHAT_ATTACHMENT'], progress)
      : kind === 'source'
        ? publishQdnResource('qortium', { sourceToken: 'fixture-source', name: 'Alice', service: 'IMAGE' }, ['PUBLISH_QDN_RESOURCE'], progress)
        : publishQdnResourceBytes('qortium', { dataBase64: 'YQ==', fileName: 'a.png', identifier: 'photo', name: 'Alice', service: 'IMAGE' }, ['PUBLISH_QDN_RESOURCE'], progress);
    f.emit(0, 'approval'); f.emit(0, 'publishing');
    expect(progress.mock.calls.flat()).toEqual(['approval', 'publishing']);
    f.calls[0].resolve({ accepted: true }); await result;
  });

  it('keeps requests separate and updates before the publish result arrives', async () => {
    const f = fixture();
    const a = vi.fn(); const b = vi.fn();
    const first = publishRequest('qortium', { action: 'PUBLISH_CHAT_ATTACHMENT' }, a);
    const second = publishRequest('qortium', { action: 'PUBLISH_CHAT_ATTACHMENT' }, b);
    expect(f.calls[0].request.progressId).not.toBe(f.calls[1].request.progressId);
    f.emit(0, 'preparing'); f.emit(0, 'approval'); f.emit(0, 'publishing');
    expect(a.mock.calls.flat()).toEqual(['preparing', 'approval', 'publishing']);
    expect(b).not.toHaveBeenCalled();
    f.calls[0].resolve({ accepted: true });
    await expect(first).resolves.toEqual({ accepted: true });
    f.emit(0, 'publishing');
    expect(a).toHaveBeenCalledTimes(3);
    f.calls[1].resolve({ outcome: 'unknown', accepted: false });
    await expect(second).resolves.toEqual({ outcome: 'unknown', accepted: false });
  });

  it('ignores foreign, malformed, mismatched and regressive events; accepts the Android parent', async () => {
    const f = fixture(); const progress = vi.fn();
    const result = publishRequest('qortium', { action: 'PUBLISH_QDN_RESOURCE' }, progress);
    f.emit(0, 'approval', {}, {});
    f.emit(0, 'approval', { protocol: 'qortalRequest' });
    f.emit(0, 'approval', { action: 'PUBLISH_CHAT_ATTACHMENT' });
    f.emit(0, 'approval', { progressId: 'other' });
    f.emit(0, 'made-up');
    expect(progress).not.toHaveBeenCalled();
    f.emit(0, 'publishing', {}, f.frame.parent);
    f.emit(0, 'approval'); f.emit(0, 'publishing');
    expect(progress.mock.calls.flat()).toEqual(['publishing']);
    f.calls[0].resolve(true); await result;
  });

  it('preserves publishing when secure UUID generation is unavailable', async () => {
    const f = fixture(); const progress = vi.fn();
    vi.stubGlobal('crypto', {});
    const result = publishRequest('qortium', { action: 'PUBLISH_CHAT_ATTACHMENT' }, progress);
    expect(f.calls[0].request).toEqual({ action: 'PUBLISH_CHAT_ATTACHMENT' });
    f.calls[0].resolve({ accepted: true });
    await expect(result).resolves.toEqual({ accepted: true });
    expect(progress).not.toHaveBeenCalled();
  });

  it('does not invent phases on old hosts and cleans up after denial', async () => {
    const f = fixture(); const progress = vi.fn();
    const remove = vi.spyOn(f.frame, 'removeEventListener');
    const oldHost = publishRequest('qortium', { action: 'PUBLISH_CHAT_ATTACHMENT' }, progress);
    f.calls[0].resolve(true); await oldHost;
    expect(progress).not.toHaveBeenCalled();
    const denied = publishRequest('qortium', { action: 'PUBLISH_CHAT_ATTACHMENT' }, progress);
    f.emit(1, 'approval');
    f.calls[1].reject(new Error('denied'));
    await expect(denied).rejects.toThrow('denied');
    f.emit(1, 'publishing');
    expect(progress.mock.calls.flat()).toEqual(['approval']);
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
