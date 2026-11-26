export function shouldSendOnEnter(event) {
  return (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.nativeEvent?.isComposing &&
    !event.isComposing &&
    event.keyCode !== 229
  );
}
