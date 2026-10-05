export function canContinue(checked, status = 'idle') {
  return checked === true && status === 'idle';
}
