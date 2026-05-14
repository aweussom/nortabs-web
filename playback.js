/**
 * Auto-scroll playback. Linear scroll from current scroll position to the
 * bottom of the document over a user-chosen duration.
 *
 * Key principle: the user's manual scroll position always wins. Start, and
 * each frame, reads window.scrollY anew — so manual scrolling mid-playback
 * just adjusts the trajectory without breaking it.
 */

let _state = null; // { phase: 'countdown'|'playing'|'paused', ... }

function endScrollY() {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

export function getPhase() {
  return _state?.phase ?? 'idle';
}

export function isActive() {
  return _state !== null;
}

export function start(durationSeconds, callbacks = {}) {
  stop();
  const startY = window.scrollY;
  const endY = endScrollY();
  if (endY <= startY + 2) {
    callbacks.onStop?.('nothing-to-scroll');
    return false;
  }
  _state = {
    phase: 'countdown',
    speed: (endY - startY) / durationSeconds, // px per sec
    targetY: startY, // float accumulator — window.scrollY only stores ints
    lastTime: null,
    raf: null,
    countdownLeft: 5,
    countdownTimer: null,
    callbacks,
  };
  callbacks.onPhaseChange?.('countdown');
  callbacks.onCountdown?.(5);
  _state.countdownTimer = setInterval(() => {
    if (!_state) return;
    _state.countdownLeft -= 1;
    if (_state.countdownLeft <= 0) {
      clearInterval(_state.countdownTimer);
      _state.countdownTimer = null;
      _state.phase = 'playing';
      callbacks.onCountdown?.(0);
      callbacks.onPhaseChange?.('playing');
      _state.raf = requestAnimationFrame(tick);
    } else {
      callbacks.onCountdown?.(_state.countdownLeft);
    }
  }, 1000);
  return true;
}

export function pause() {
  if (!_state || _state.phase !== 'playing') return;
  if (_state.raf) cancelAnimationFrame(_state.raf);
  _state.raf = null;
  _state.lastTime = null;
  _state.phase = 'paused';
  _state.callbacks.onPhaseChange?.('paused');
}

export function resume() {
  if (!_state || _state.phase !== 'paused') return;
  _state.phase = 'playing';
  _state.callbacks.onPhaseChange?.('playing');
  _state.raf = requestAnimationFrame(tick);
}

function tick(now) {
  if (!_state || _state.phase !== 'playing') return;
  if (_state.lastTime !== null) {
    const dt = (now - _state.lastTime) / 1000;
    // If the user has manually scrolled (window.scrollY drifted from our
    // accumulator by more than 30 px), respect their position.
    if (Math.abs(window.scrollY - _state.targetY) > 30) {
      _state.targetY = window.scrollY;
    }
    _state.targetY += _state.speed * dt;
    const endY = endScrollY();
    if (_state.targetY >= endY) {
      window.scrollTo(0, endY);
      stopWithReason('completed');
      return;
    }
    window.scrollTo(0, _state.targetY);
    const remaining = (endY - _state.targetY) / _state.speed;
    _state.callbacks.onTick?.(remaining, _state.speed);
  } else {
    // First frame after countdown or resume: sync to current scroll.
    _state.targetY = window.scrollY;
  }
  _state.lastTime = now;
  _state.raf = requestAnimationFrame(tick);
}

function stopWithReason(reason) {
  if (!_state) return;
  const cb = _state.callbacks.onStop;
  cleanup();
  cb?.(reason);
}

function cleanup() {
  if (!_state) return;
  if (_state.raf) cancelAnimationFrame(_state.raf);
  if (_state.countdownTimer) clearInterval(_state.countdownTimer);
  _state = null;
}

export function stop() {
  if (!_state) return;
  stopWithReason('user');
}

/** Multiply current speed (e.g. 1.1 for 10% faster, 0.9 for slower). */
export function scaleSpeed(factor) {
  if (!_state) return;
  _state.speed = Math.max(2, _state.speed * factor);
  // Recompute remaining and notify.
  const endY = endScrollY();
  const remaining = (endY - window.scrollY) / _state.speed;
  _state.callbacks.onTick?.(remaining, _state.speed);
}

export function getRemainingSeconds() {
  if (!_state) return null;
  const endY = endScrollY();
  return Math.max(0, (endY - window.scrollY) / _state.speed);
}

export function getSpeed() {
  return _state?.speed ?? null;
}
