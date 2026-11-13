export const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : '—';
export const percent = (value) => Number.isFinite(value) ? `${Number(value.toFixed(2))}%` : 'Unavailable';
// Validated (light surface, CVD-separated) status hues; every mark is also labelled in text.
export const STATUS_COLORS = Object.freeze({ completed: '#059669', inProgress: '#087fba', notStarted: '#d97706' });
