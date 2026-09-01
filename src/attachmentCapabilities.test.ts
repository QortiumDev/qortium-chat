import { describe, expect, it } from 'vitest';
import {
  hostAcceptsInlinePublishBytes,
  hostOffersPublishPicker,
  resolveAttachmentCapability,
} from './attachmentCapabilities';

// Advertised action sets as observed on each host (attachments-matrix review,
// 2026-09-01). Only the attachment-relevant actions are listed.
const HOME_1_7 = ['PUBLISH_QDN_RESOURCE', 'SEND_CHAT_MESSAGE'];
const HOME_1_8 = ['PUBLISH_QDN_RESOURCE', 'SELECT_QDN_PUBLISH_SOURCE', 'SEND_CHAT_MESSAGE'];
const HOME_2 = ['PUBLISH_QDN_RESOURCE', 'SELECT_QDN_PUBLISH_SOURCE', 'PUBLISH_CHAT_ATTACHMENT', 'SEND_CHAT_MESSAGE'];
const HUB = ['PUBLISH_QDN_RESOURCE', 'PUBLISH_MULTIPLE_QDN_RESOURCES', 'SAVE_FILE', 'SEND_CHAT_MESSAGE'];
const GATEWAY = ['FETCH_NODE_API', 'LIST_GROUPS', 'SEARCH_CHAT_MESSAGES'];

const openGroup = { hasPublisherName: true, isOpenGroup: true, isPrivateConversation: false };
const privateChat = { hasPublisherName: true, isOpenGroup: false, isPrivateConversation: true };

describe('hostAcceptsInlinePublishBytes', () => {
  it('treats PUBLISH_CHAT_ATTACHMENT as the token-only (Home 2) marker', () => {
    expect(hostAcceptsInlinePublishBytes(HOME_1_7)).toBe(true);
    expect(hostAcceptsInlinePublishBytes(HOME_1_8)).toBe(true);
    expect(hostAcceptsInlinePublishBytes(HUB)).toBe(true);
    expect(hostAcceptsInlinePublishBytes(HOME_2)).toBe(false);
    expect(hostAcceptsInlinePublishBytes(GATEWAY)).toBe(false);
    expect(hostAcceptsInlinePublishBytes(undefined)).toBe(false);
  });

  it('is case-insensitive like the rest of the bridge action checks', () => {
    expect(hostAcceptsInlinePublishBytes(['publish_qdn_resource'])).toBe(true);
    expect(hostOffersPublishPicker(['publish_qdn_resource', 'select_qdn_publish_source'])).toBe(true);
  });
});

describe('resolveAttachmentCapability — open groups', () => {
  it('Home ≤1.7 and Qortal Hub: bytes path, paste/drop enabled', () => {
    for (const actions of [HOME_1_7, HUB]) {
      expect(resolveAttachmentCapability({ actions, ...openGroup })).toEqual({
        canStageLocalFile: true,
        privateSource: null,
        publicSource: 'bytes',
      });
    }
  });

  it('Home 1.8: picker for the paperclip, bytes for paste/drop', () => {
    expect(resolveAttachmentCapability({ actions: HOME_1_8, ...openGroup })).toEqual({
      canStageLocalFile: true,
      privateSource: null,
      publicSource: 'picker',
    });
  });

  it('Home 2 desktop: picker only — paste/drop cannot stage bytes', () => {
    expect(resolveAttachmentCapability({ actions: HOME_2, ...openGroup })).toEqual({
      canStageLocalFile: false,
      privateSource: null,
      publicSource: 'picker',
    });
  });

  it('gateway / plain browser: nothing', () => {
    expect(resolveAttachmentCapability({ actions: GATEWAY, ...openGroup })).toEqual({
      canStageLocalFile: false,
      privateSource: null,
      publicSource: null,
    });
  });

  it('requires a registered publisher name on every path', () => {
    for (const actions of [HOME_1_7, HOME_1_8, HOME_2, HUB]) {
      expect(resolveAttachmentCapability({ actions, ...openGroup, hasPublisherName: false })).toEqual({
        canStageLocalFile: false,
        privateSource: null,
        publicSource: null,
      });
    }
  });
});

describe('resolveAttachmentCapability — private conversations', () => {
  it('only Home 2 offers private attachments, and only through the picker', () => {
    expect(resolveAttachmentCapability({ actions: HOME_2, ...privateChat })).toEqual({
      canStageLocalFile: false,
      privateSource: 'picker',
      publicSource: null,
    });

    for (const actions of [HOME_1_7, HOME_1_8, HUB, GATEWAY]) {
      expect(resolveAttachmentCapability({ actions, ...privateChat })).toEqual({
        canStageLocalFile: false,
        privateSource: null,
        publicSource: null,
      });
    }
  });

  it('never enables the bytes path for a private conversation, even on a bytes-capable host', () => {
    expect(resolveAttachmentCapability({ actions: HUB, ...privateChat }).canStageLocalFile).toBe(false);
  });
});
