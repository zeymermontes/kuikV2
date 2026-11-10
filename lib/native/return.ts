// "The app is back on screen." A phone in the pocket pauses the page: timers
// stop, the Realtime socket starves and may drop, and whatever changed
// meanwhile is never pushed to it. The chats list then shows the morning
// until something else makes it fetch. A screen that keeps live data asks
// for it again here, the moment the page is visible once more.

interface VisibilityDoc {
  visibilityState: string;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
  removeEventListener(type: 'visibilitychange', fn: () => void): void;
}

/**
 * Calls `fn` every time the page becomes visible after having been hidden.
 * Not on mount: the page just fetched itself. Returns the unsubscribe.
 */
export function onReturn(fn: () => void, doc: VisibilityDoc | undefined = typeof document === 'undefined' ? undefined : document): () => void {
  if (!doc) return () => {};
  let hidden = doc.visibilityState === 'hidden';
  const onChange = () => {
    if (doc.visibilityState === 'hidden') {
      hidden = true;
      return;
    }
    if (!hidden) return;
    hidden = false;
    fn();
  };
  doc.addEventListener('visibilitychange', onChange);
  return () => doc.removeEventListener('visibilitychange', onChange);
}
