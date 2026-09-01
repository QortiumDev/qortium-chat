import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchNames, searchQdnResources, stageQdnPublishBlob } from './coreApi';
import { qdnRequest } from './qdnRequest';
import { qortalRequest } from './qortalRequest';

vi.mock('./qdnRequest', () => ({ hasAction: vi.fn(), qdnRequest: vi.fn() }));
vi.mock('./qortalRequest', () => ({ qortalRequest: vi.fn() }));
vi.mock('./qortalGeneralChat', () => ({}));

const qdnRequestMock = vi.mocked(qdnRequest);
const qortalRequestMock = vi.mocked(qortalRequest);

describe('searchQdnResources', () => {
  beforeEach(() => {
    qdnRequestMock.mockReset();
    qortalRequestMock.mockReset();
  });

  it('queries /arbitrary/resources/search over FETCH_NODE_API on the selected network', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      data: [{ identifier: 'pic', name: 'alice', service: 'IMAGE', size: 10 }],
      ok: true,
      status: 200,
    });

    const results = await searchQdnResources('qortium', { query: 'cat pics', service: 'IMAGE' });

    expect(results).toEqual([{ identifier: 'pic', name: 'alice', service: 'IMAGE', size: 10 }]);
    const request = qdnRequestMock.mock.calls[0][0] as { action: string; path: string };

    expect(request.action).toBe('FETCH_NODE_API');
    expect(request.path).toBe('/arbitrary/resources/search?limit=20&offset=0&query=cat+pics&reverse=true&service=IMAGE');
    expect(qortalRequestMock).not.toHaveBeenCalled();
  });

  it('routes Qortal searches through qortalRequest, clamps paging, and drops malformed rows', async () => {
    qortalRequestMock.mockResolvedValueOnce({
      data: [{ name: 'bob', service: 'VIDEO' }, { name: '', service: 'IMAGE' }, null, { name: 'x' }],
      ok: true,
      status: 200,
    });

    const results = await searchQdnResources('qortal', { limit: 999, offset: -5, query: 'q' });

    expect(results).toEqual([{ name: 'bob', service: 'VIDEO' }]);
    const request = qortalRequestMock.mock.calls[0][0] as { path: string };

    expect(request.path).toBe('/arbitrary/resources/search?limit=50&offset=0&query=q&reverse=true');
  });

  it('surfaces a failed node fetch as an error', async () => {
    qdnRequestMock.mockResolvedValueOnce({ body: 'boom', ok: false, status: 500 });

    await expect(searchQdnResources('qortium', { query: 'q' })).rejects.toThrow();
  });

  it('passes the optional publisher name filter through', async () => {
    qdnRequestMock.mockResolvedValueOnce({ data: [], ok: true, status: 200 });

    await searchQdnResources('qortium', { name: 'alice', query: 'cats' });
    const request = qdnRequestMock.mock.calls[0][0] as { path: string };

    expect(request.path).toBe('/arbitrary/resources/search?limit=20&offset=0&query=cats&reverse=true&name=alice');
  });
});

describe('searchNames', () => {
  beforeEach(() => {
    qdnRequestMock.mockReset();
    qortalRequestMock.mockReset();
  });

  it('queries /names/search with prefix matching on the selected network', async () => {
    qortalRequestMock.mockResolvedValueOnce({
      data: [{ name: 'alice', owner: 'Qa' }, { name: '' }, null],
      ok: true,
      status: 200,
    });

    await expect(searchNames('qortal', 'ali')).resolves.toEqual([{ name: 'alice', owner: 'Qa' }]);
    const request = qortalRequestMock.mock.calls[0][0] as { action: string; path: string };

    expect(request.action).toBe('FETCH_NODE_API');
    expect(request.path).toBe('/names/search?limit=10&prefix=true&query=ali');
  });
});

describe('stageQdnPublishBlob', () => {
  beforeEach(() => {
    qdnRequestMock.mockReset();
    qortalRequestMock.mockReset();
  });

  it('requires the host to advertise STAGE_QDN_PUBLISH_SOURCE', async () => {
    await expect(
      stageQdnPublishBlob('qortium', { dataBase64: 'AAAA', fileName: 'a.png', mimeType: 'image/png' }, []),
    ).rejects.toThrow('newer Qortium Home bridge');
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('stages bytes and returns the picker-shaped selection', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      canceled: false,
      fileName: 'a.png',
      kind: 'blob',
      mimeType: 'image/png',
      size: 3,
      sourceToken: 'token-9',
    });

    await expect(
      stageQdnPublishBlob('qortium', { dataBase64: 'AAAA', fileName: 'a.png', mimeType: 'image/png' }, [
        'STAGE_QDN_PUBLISH_SOURCE',
      ]),
    ).resolves.toEqual({ canceled: false, fileName: 'a.png', kind: 'file', mimeType: 'image/png', size: 3, sourceToken: 'token-9' });
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'STAGE_QDN_PUBLISH_SOURCE',
      bytesBase64: 'AAAA',
      fileName: 'a.png',
      mimeType: 'image/png',
    });
  });

  it('rejects an incomplete staging result', async () => {
    qdnRequestMock.mockResolvedValueOnce({ canceled: false, fileName: 'a.png', size: 3 });

    await expect(
      stageQdnPublishBlob('qortium', { dataBase64: 'AAAA', fileName: 'a.png', mimeType: null }, ['STAGE_QDN_PUBLISH_SOURCE']),
    ).rejects.toThrow('incomplete');
  });
});
