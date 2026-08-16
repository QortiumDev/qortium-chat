export function getConversationInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const firstCharacters = words
    .map((word) => Array.from(word).find((character) => /[\p{L}\p{N}]/u.test(character)) ?? '')
    .filter(Boolean);

  if (firstCharacters.length === 0) {
    return '#';
  }

  if (words.length === 1) {
    return Array.from(words[0])
      .filter((character) => /[\p{L}\p{N}]/u.test(character))
      .slice(0, 2)
      .join('')
      .toLocaleUpperCase();
  }

  return [firstCharacters[0], firstCharacters.at(-1) ?? ''].join('').toLocaleUpperCase();
}
