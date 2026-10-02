import { bridgeRequest } from './chatNetwork';
import type { ChatNetwork } from './types';

export type PublishPhase = 'preparing' | 'approval' | 'publishing';
export type PublishProgress = (phase: PublishPhase) => void;

// Older hosts ignore progressId and still return the ordinary result. Callers
// must use neutral wording until a matching host event establishes a phase.
export async function publishRequest<T>(
  network: ChatNetwork,
  request: { action: string; [key: string]: unknown },
  onProgress?: PublishProgress,
): Promise<T> {
  if (!onProgress || typeof window === 'undefined') return bridgeRequest<T>(network, request);
  let progressId: string | undefined;
  try {
    progressId = globalThis.crypto?.randomUUID?.();
  } catch {
    // Progress is optional, including on older WebViews and insecure origins.
  }
  if (!progressId) return bridgeRequest<T>(network, request);
  const protocol = network === 'qortal' ? 'qortalRequest' : 'qdnRequest';
  const phases: PublishPhase[] = ['preparing', 'approval', 'publishing'];
  let lastPhase = -1;
  function handleProgress(event: MessageEvent) {
    // Desktop preload posts to this window; Android Home posts from its parent.
    if (event.source !== window && event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.type !== 'QDN_PUBLISH_PROGRESS' || data.progressId !== progressId ||
      data.protocol !== protocol || data.action !== request.action) return;
    const next = phases.indexOf(data.phase);
    if (next <= lastPhase) return;
    lastPhase = next;
    onProgress?.(phases[next]);
  }
  window.addEventListener('message', handleProgress);
  try {
    return await bridgeRequest<T>(network, { ...request, progressId });
  } finally {
    window.removeEventListener('message', handleProgress);
  }
}
