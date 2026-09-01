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
// attachments-matrix A3: whether Chat can reach the Core REST API for this
// bridge — either the host advertises FETCH_NODE_API (every Home; the
// browser-dev and gateway fallbacks also list it) or it is a host whose
// wrapper serves the fetch without a bridge action (Qortal Hub: same-origin;
// gateway: window.location.origin). Real Hub's SHOW_ACTIONS does NOT include
// FETCH_NODE_API, so an action check alone wrongly excludes it.
export function canFetchNodeApi(bridge: Pick<BridgeState, 'actions' | 'host' | 'transport'>): boolean {
  if (bridge.host === 'hub' || bridge.transport === 'gateway') {
    return true;
  }

  return bridge.actions.some((action) => action.toUpperCase() === 'FETCH_NODE_API');
}

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
