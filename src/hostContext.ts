export function isHomeV2AppTab(search: string): boolean {
  const normalized = search.startsWith('?') ? search.slice(1) : search;

  return new URLSearchParams(normalized).get('homeV2Bridge') === '1';
}
