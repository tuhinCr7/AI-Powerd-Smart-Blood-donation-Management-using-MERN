/**
 * Escapes regex metacharacters so user-supplied text (a city name, a search
 * term) can be used inside a RegExp literal without changing its meaning —
 * or throwing, as an unbalanced "(" would.
 */
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive exact match on a trimmed string, e.g. an address city. */
export const exactInsensitive = (s) => new RegExp(`^\\s*${escapeRegex(String(s).trim())}\\s*$`, 'i');
