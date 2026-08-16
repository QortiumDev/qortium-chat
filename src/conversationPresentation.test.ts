import { describe, expect, it } from 'vitest';
import { getConversationInitials } from './conversationPresentation';

describe('getConversationInitials', () => {
  it('uses the first and last words for group titles', () => {
    expect(getConversationInitials('Previewnet Builders')).toBe('PB');
    expect(getConversationInitials('Qort Community Garden')).toBe('QG');
  });

  it('keeps short single-word and non-Latin titles useful', () => {
    expect(getConversationInitials('Dev')).toBe('DE');
    expect(getConversationInitials('聊天')).toBe('聊天');
  });

  it('falls back for titles without letters or numbers', () => {
    expect(getConversationInitials('---')).toBe('#');
  });
});
