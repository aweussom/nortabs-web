let _state = {
  route: { name: 'home' },
};
const _listeners = new Set();

export function getState() {
  return _state;
}

export function setState(patch) {
  _state = { ..._state, ...patch };
  for (const fn of _listeners) fn(_state);
}

export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
