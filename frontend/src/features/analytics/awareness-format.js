export const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : '—';
export const percent = (value) => Number.isFinite(value) ? `${Number(value.toFixed(2))}%` : 'Unavailable';
