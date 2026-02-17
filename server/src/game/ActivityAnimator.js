/**
 * ActivityAnimator.js (server-side) — Lightweight version.
 *
 * Contains only the body-animation metadata (speed + frame count)
 * needed by the AI state machine. No Canvas/sprite rendering.
 */

const BODY_ANIM_DEFS = {
  stand_use:      { speed: 2,   frameCount: 2 },
  stand_cook:     { speed: 3,   frameCount: 4 },
  stand_reach:    { speed: 1.5, frameCount: 2 },
  stand_scrub:    { speed: 4,   frameCount: 4 },
  stand_shower:   { speed: 3,   frameCount: 4 },
  stand_brush:    { speed: 4,   frameCount: 2 },
  stand_fold:     { speed: 2,   frameCount: 2 },
  stand_push:     { speed: 2,   frameCount: 2 },
  stand_hammer:   { speed: 3,   frameCount: 4 },
  stand_throw:    { speed: 3,   frameCount: 4 },
  stand_wave:     { speed: 2.5, frameCount: 4 },
  stand_hold:     { speed: 1.5, frameCount: 2 },
  stand_sweep:    { speed: 2,   frameCount: 4 },
  sit_eat:        { speed: 2.5, frameCount: 4 },
  sit_read:       { speed: 0.5, frameCount: 2 },
  sit_write:      { speed: 3,   frameCount: 4 },
  sit_game:       { speed: 4,   frameCount: 2 },
  sit_watch:      { speed: 0.5, frameCount: 2 },
  sit_talk:       { speed: 2,   frameCount: 4 },
  sit_idle:       { speed: 0.5, frameCount: 1 },
  sleep_breathe:  { speed: 0.5, frameCount: 1 },
  crouch_work:    { speed: 2,   frameCount: 2 },
  exercise_active:{ speed: 6,   frameCount: 6 },
  splash_swim:    { speed: 4,   frameCount: 4 },
};

/**
 * Get the animation playback speed (fps) for a body animation type.
 */
function getBodyAnimSpeed(bodyAnimType) {
  return BODY_ANIM_DEFS[bodyAnimType]?.speed || 2;
}

/**
 * Get the frame count for a body animation type.
 */
function getBodyAnimFrameCount(bodyAnimType) {
  return BODY_ANIM_DEFS[bodyAnimType]?.frameCount || 1;
}

module.exports = { BODY_ANIM_DEFS, getBodyAnimSpeed, getBodyAnimFrameCount };
