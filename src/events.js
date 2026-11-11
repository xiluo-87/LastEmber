// Tiny pub/sub. `game.events`. Handlers run synchronously; errors in one handler don't stop the others.
export function createEvents() {
  const map = new Map();
  const events = {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => events.off(evt, fn);
    },
    once(evt, fn) {
      const off = events.on(evt, (p) => { off(); fn(p); });
      return off;
    },
    off(evt, fn) { map.get(evt)?.delete(fn); },
    emit(evt, payload) {
      const set = map.get(evt);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(payload, evt); } catch (err) { console.error(`[events] handler for "${evt}" threw`, err); }
      }
    },
    clear() { map.clear(); },
  };
  return events;
}
