export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 20;
export const MAX_NAME_LENGTH = 24;

export const SAMPLE_ROSTER = [
  'サンタ佐藤',
  'トナカイ田中',
  'スノー高橋',
  'ベル鈴木',
  'スター渡辺',
  'リース伊藤',
  'キャンドル中村',
  'ギフト小林',
];

export const ORNAMENT_PALETTE = [
  { hex: '#e63946', accent: '#ffd166', pattern: 'stripe', name: 'Crimson' },
  { hex: '#2a9d8f', accent: '#f4f1de', pattern: 'snowflake', name: 'Emerald' },
  { hex: '#f4a261', accent: '#fff3b0', pattern: 'swirl', name: 'Amber' },
  { hex: '#457b9d', accent: '#caf0f8', pattern: 'stars', name: 'Sapphire' },
  { hex: '#c77dff', accent: '#ffe5ec', pattern: 'diamond', name: 'Amethyst' },
  { hex: '#e76f51', accent: '#fff8dc', pattern: 'stripe', name: 'Coral' },
  { hex: '#00b4d8', accent: '#ffffff', pattern: 'snowflake', name: 'Ice' },
  { hex: '#ffb703', accent: '#7f1d1d', pattern: 'swirl', name: 'Gold' },
  { hex: '#ec4899', accent: '#fef08a', pattern: 'stars', name: 'Berry' },
  { hex: '#38b000', accent: '#ffd166', pattern: 'diamond', name: 'Holly' },
  { hex: '#6366f1', accent: '#e0e7ff', pattern: 'stripe', name: 'Twilight' },
  { hex: '#f97316', accent: '#fffbeb', pattern: 'snowflake', name: 'Ginger' },
  { hex: '#14b8a6', accent: '#fef3c7', pattern: 'swirl', name: 'Mint' },
  { hex: '#be123c', accent: '#fde68a', pattern: 'stars', name: 'Ruby' },
  { hex: '#0ea5e9', accent: '#f0f9ff', pattern: 'diamond', name: 'Frost' },
  { hex: '#a855f7', accent: '#fef9c3', pattern: 'stripe', name: 'Plum' },
  { hex: '#84cc16', accent: '#ffffff', pattern: 'snowflake', name: 'Pine' },
  { hex: '#fb7185', accent: '#fff1f2', pattern: 'swirl', name: 'Rose' },
  { hex: '#eab308', accent: '#1e3a8a', pattern: 'stars', name: 'Champagne' },
  { hex: '#06b6d4', accent: '#ecfeff', pattern: 'diamond', name: 'Glacier' },
];

export function parseRoster(rawText) {
  const tokens = String(rawText || '')
    .split(/[\r\n\t]+/)
    .map((entry) => entry.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  const errors = [];
  const seen = new Set();
  const duplicates = new Set();
  const tooLong = [];
  const names = [];

  for (const token of tokens) {
    if (token.length > MAX_NAME_LENGTH) {
      tooLong.push(token);
    }
    const key = token.toLowerCase();
    if (seen.has(key)) {
      duplicates.add(token);
      continue;
    }
    seen.add(key);
    names.push(token);
  }

  if (names.length < MIN_PARTICIPANTS) {
    errors.push(`参加メンバーを${MIN_PARTICIPANTS}名以上入力してください（現在 ${names.length}名）。`);
  }
  if (names.length > MAX_PARTICIPANTS) {
    errors.push(`参加メンバーは最大${MAX_PARTICIPANTS}名までです（現在 ${names.length}名）。`);
  }
  if (duplicates.size > 0) {
    errors.push(`重複している名前があります: ${[...duplicates].slice(0, 3).join('、')}`);
  }
  if (tooLong.length > 0) {
    errors.push(`${MAX_NAME_LENGTH}文字以内で入力してください: ${tooLong[0].slice(0, 14)}…`);
  }

  return {
    names,
    valid: errors.length === 0,
    errors,
  };
}

export function truncateLabel(name, maxChars = 10) {
  const chars = [...String(name || '')];
  if (chars.length <= maxChars) return name;
  return `${chars.slice(0, maxChars - 1).join('')}…`;
}
