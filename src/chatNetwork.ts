// Chat 2.0 slice 2: the one place that picks Qortium vs Qortal. coreApi's
// network-aware functions call bridgeRequest/getNetworkBridgeState instead of
// qdnRequest/getBridgeState directly, so the actual dispatch lives in exactly
// one spot rather than being re-decided at every call site.
import { getBridgeState, hasHomeBridge, qdnRequest } from './qdnRequest';
import { getQortalBridgeState, hasQortalHomeBridge, qortalRequest } from './qortalRequest';
import type { BridgeState, ChatMessage, ChatNetwork } from './types';

export function bridgeRequest<T = unknown>(
  network: ChatNetwork,
  request: { action: string; [key: string]: unknown },
): Promise<T> {
  return network === 'qortal' ? qortalRequest<T>(request) : qdnRequest<T>(request);
}

export function getNetworkBridgeState(network: ChatNetwork): Promise<BridgeState> {
  return network === 'qortal' ? getQortalBridgeState() : getBridgeState();
}

/** Synchronous bridge-global check. Qortal's Home 1.7 fallback is catalogued
 * asynchronously by getQortalBridgeState before the section is shown. */
export function hasNetworkBridge(network: ChatNetwork): boolean {
  return network === 'qortal' ? hasQortalHomeBridge() : hasHomeBridge();
}

// Chat/message identity must not collide across chains even though group ids
// and (in the ordinary course of two independent chains) signatures are drawn
// from unrelated namespaces. Every dedupe/lookup keyed off a raw signature
// should compose it with the network first via this helper.
export function getMessageNetworkIdentity(network: ChatNetwork, message: Pick<ChatMessage, 'sendLocalId' | 'signature'>) {
  return `${network}:${message.signature ?? message.sendLocalId ?? ''}`;
}
