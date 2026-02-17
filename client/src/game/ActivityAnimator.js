/**
 * ActivityAnimator.js — Procedural activity sprite animation system.
 *
 * Generates per-activity animation frames by compositing:
 *   1. Base character walk-cycle frame (for body pose / limb positions)
 *   2. Procedural pixel-art prop overlays (spoons, books, brooms, etc.)
 *   3. Body modifications (raised arms, crouching, jumping)
 *
 * Each "body animation" type produces 2-6 cached canvas frames that cycle
 * while a character performs the activity.  23 distinct body animation types
 * cover all 112 interactions.
 *
 * Usage:
 *   import { getActivityFrames, getBodyAnimSpeed } from './ActivityAnimator';
 *   const canvases = getActivityFrames(spriteData, 'stand_cook', 4);
 */

import { renderSpriteFrame } from './SpriteRenderer';

// ═══════════════════════════════════════════════════════════════════
// Cache
// ═══════════════════════════════════════════════════════════════════

const frameCache = new Map();

// ═══════════════════════════════════════════════════════════════════
// Character colour detection — sample key pixels from standing frame
// ═══════════════════════════════════════════════════════════════════

function getCharColors(spriteData) {
  const g = spriteData.frames[0].grid;
  const p = spriteData.palette;
  return {
    skin:     p[String(g[4][6])]  || '#FCDDBB',
    skinDk:   p[String(g[7][5])]  || '#E8BA8A',
    shirt:    p[String(g[10][6])] || '#4488CC',
    shirtDk:  p[String(g[10][4])] || '#2F5F8F',
    shirtLt:  p[String(g[11][7])] || '#66AAEE',
    pants:    p[String(g[16][6])] || '#344D6B',
    hair:     p[String(g[1][6])]  || '#5E3A18',
  };
}

// ═══════════════════════════════════════════════════════════════════
// Pixel helper — draws one sprite-pixel at grid (gx, gy)
// ═══════════════════════════════════════════════════════════════════

function px(ctx, gx, gy, color, s) {
  ctx.fillStyle = color;
  ctx.fillRect(gx * s, gy * s, s, s);
}

// ═══════════════════════════════════════════════════════════════════
// Prop drawing functions
// All coordinates are in *sprite-pixel* space (16×24 grid).
// ═══════════════════════════════════════════════════════════════════

function drawSpoon(ctx, x, y, v, s) {
  // Stirring spoon / spatula — stick + rounded bowl
  const dy = v === 0 ? 0 : -1;
  px(ctx, x, y - 2 + dy, '#888888', s);
  px(ctx, x, y - 1 + dy, '#999999', s);
  px(ctx, x, y + dy,     '#999999', s);
  px(ctx, x - 1, y - 2 + dy, '#AAAAAA', s);
  px(ctx, x + 1, y - 2 + dy, '#AAAAAA', s);
}

function drawSponge(ctx, x, y, v, s) {
  const dy = v === 0 ? 0 : 1;
  px(ctx, x,     y + dy,     '#FFD700', s);
  px(ctx, x + 1, y + dy,     '#FFD700', s);
  px(ctx, x,     y + 1 + dy, '#E6C200', s);
  px(ctx, x + 1, y + 1 + dy, '#E6C200', s);
}

function drawBrush(ctx, x, y, v, s) {
  const dy = v === 0 ? 0 : 1;
  px(ctx, x, y + dy,     '#C0C0C0', s);
  px(ctx, x, y + 1 + dy, '#C0C0C0', s);
  px(ctx, x - 1, y + 2 + dy, '#FFFFFF', s);
  px(ctx, x,     y + 2 + dy, '#FFFFFF', s);
  px(ctx, x + 1, y + 2 + dy, '#FFFFFF', s);
}

function drawCloth(ctx, x, y, v, s) {
  const c1 = v === 0 ? '#FF6B6B' : '#6BB5FF';
  const c2 = v === 0 ? '#CC5555' : '#5599DD';
  px(ctx, x - 1, y, c1, s);  px(ctx, x, y, c1, s);
  px(ctx, x + 1, y, c2, s);
  px(ctx, x - 1, y + 1, c2, s);
  px(ctx, x,     y + 1, c1, s);
  px(ctx, x + 1, y + 1, c1, s);
}

function drawIron(ctx, x, y, v, s) {
  const dx = v === 0 ? 0 : 1;
  px(ctx, x + dx,     y,     '#888888', s);
  px(ctx, x + 1 + dx, y,     '#888888', s);
  px(ctx, x + dx,     y + 1, '#666666', s);
  px(ctx, x + 1 + dx, y + 1, '#AAAAAA', s);
  px(ctx, x + 2 + dx, y + 1, '#AAAAAA', s);
}

function drawHammer(ctx, x, y, v, s) {
  const dy = v === 0 ? 0 : -2;
  px(ctx, x, y + dy,     '#8B7355', s);
  px(ctx, x, y + 1 + dy, '#8B7355', s);
  px(ctx, x, y + 2 + dy, '#8B7355', s);
  px(ctx, x - 1, y + dy, '#808080', s);
  px(ctx, x + 1, y + dy, '#808080', s);
}

function drawBall(ctx, x, y, v, s) {
  const color = '#FF6600';
  px(ctx, x,     y - v, color, s);
  px(ctx, x + 1, y - v, color, s);
  px(ctx, x,     y + 1 - v, color, s);
  px(ctx, x + 1, y + 1 - v, color, s);
}

function drawWateringCan(ctx, x, y, v, s) {
  px(ctx, x,     y,     '#228B22', s);
  px(ctx, x + 1, y,     '#228B22', s);
  px(ctx, x + 2, y,     '#228B22', s);
  px(ctx, x,     y + 1, '#1E7E1E', s);
  px(ctx, x + 1, y + 1, '#1E7E1E', s);
  px(ctx, x + 3, y - 1, '#228B22', s);
  if (v === 1) {
    px(ctx, x + 3, y,     '#64B5F6', s);
    px(ctx, x + 3, y + 1, '#64B5F6', s);
  }
}

function drawFork(ctx, x, y, v, s) {
  const dy = v === 0 ? 0 : -1;
  px(ctx, x, y + dy,     '#C0C0C0', s);
  px(ctx, x, y + 1 + dy, '#C0C0C0', s);
  px(ctx, x - 1, y - 1 + dy, '#C0C0C0', s);
  px(ctx, x,     y - 1 + dy, '#C0C0C0', s);
  px(ctx, x + 1, y - 1 + dy, '#C0C0C0', s);
}

function drawBook(ctx, x, y, v, s) {
  px(ctx, x,     y,     '#8B4513', s);
  px(ctx, x + 1, y,     '#8B4513', s);
  px(ctx, x + 2, y,     '#8B4513', s);
  px(ctx, x,     y + 1, '#A0522D', s);
  px(ctx, x + 1, y + 1, '#FFFFD0', s);
  px(ctx, x + 2, y + 1, '#FFFFD0', s);
  px(ctx, x,     y + 2, '#8B4513', s);
  px(ctx, x + 1, y + 2, '#8B4513', s);
  px(ctx, x + 2, y + 2, '#8B4513', s);
}

function drawPen(ctx, x, y, v, s) {
  const dy = v === 0 ? 0 : 1;
  px(ctx, x, y + dy,     '#333333', s);
  px(ctx, x, y + 1 + dy, '#333333', s);
  px(ctx, x, y + 2 + dy, '#1A1A1A', s);
}

function drawController(ctx, x, y, v, s) {
  px(ctx, x - 1, y, '#333333', s);
  px(ctx, x,     y, '#444444', s);
  px(ctx, x + 1, y, '#333333', s);
  px(ctx, x, y - 1, v === 0 ? '#FF0000' : '#00FF00', s);
}

function drawSplash(ctx, x, y, v, s) {
  const c = '#64B5F6';
  px(ctx, x - 1, y + v,     c, s);
  px(ctx, x + 1, y - v,     c, s);
  px(ctx, x,     y - 1 + v, c, s);
  px(ctx, x + 2, y + 1 - v, c, s);
}

function drawShovel(ctx, x, y, v, s) {
  const dy = v === 0 ? 0 : -1;
  px(ctx, x, y + dy,     '#8B7355', s);
  px(ctx, x, y + 1 + dy, '#8B7355', s);
  px(ctx, x, y + 2 + dy, '#8B7355', s);
  px(ctx, x - 1, y + 3 + dy, '#808080', s);
  px(ctx, x,     y + 3 + dy, '#808080', s);
  px(ctx, x + 1, y + 3 + dy, '#808080', s);
}

function drawBroom(ctx, x, y, v, s) {
  const dx = v === 0 ? -1 : 1;
  px(ctx, x + dx, y - 2, '#8B7355', s);
  px(ctx, x + dx, y - 1, '#8B7355', s);
  px(ctx, x + dx, y,     '#8B7355', s);
  px(ctx, x + dx, y + 1, '#8B7355', s);
  px(ctx, x + dx - 1, y + 2, '#D2B48C', s);
  px(ctx, x + dx,     y + 2, '#D2B48C', s);
  px(ctx, x + dx + 1, y + 2, '#D2B48C', s);
  px(ctx, x + dx - 1, y + 3, '#C4A882', s);
  px(ctx, x + dx,     y + 3, '#C4A882', s);
  px(ctx, x + dx + 1, y + 3, '#C4A882', s);
}

// ═══════════════════════════════════════════════════════════════════
// Raised-arm overlay — erases low arms, draws raised arms using
// detected character skin / shirt colours
// ═══════════════════════════════════════════════════════════════════

function drawRaisedArms(ctx, colors, variant, s) {
  // 1. Erase the existing arm pixels (cols 2-3, 12-13, rows 10-13)
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.fillRect(2 * s, 10 * s, 2 * s, 4 * s);  // left
  ctx.fillRect(12 * s, 10 * s, 2 * s, 4 * s); // right
  ctx.restore();

  const { skin, skinDk } = colors;
  const handY = variant === 0 ? 7 : 6;

  // Left arm raised: shoulder (3,9) → upper (2,8) → hand (2,7/6)
  px(ctx, 3, 9, skin, s);
  px(ctx, 2, 8, skin, s);
  px(ctx, 2, handY, skinDk, s);

  // Right arm raised: shoulder (12,9) → upper (13,8) → hand (13,7/6)
  px(ctx, 12, 9, skin, s);
  px(ctx, 13, 8, skin, s);
  px(ctx, 13, handY, skinDk, s);
}

// ═══════════════════════════════════════════════════════════════════
// Body Animation Type Definitions
//
// Each type specifies:
//   speed       – frames per second for cycling
//   frames[]    – array of frame descriptors:
//     base      – which walk frame to use (0-5) for limb positions
//     props     – array of prop overlays: { draw, x, y, v }
//     arms      – 'raised' for raised-arm overlay
//     compress  – 0-1 vertical compression (crouching)
//     yOffset   – sprite-pixel vertical shift (jumping)
// ═══════════════════════════════════════════════════════════════════

const BODY_ANIM_DEFS = {

  // ── STANDING INTERACTIONS ─────────────────────────────────────

  /** Generic standing use — subtle arm movement */
  stand_use: {
    speed: 2,
    frames: [
      { base: 0 },
      { base: 1 },
    ]
  },

  /** Cooking — stirring with spoon/spatula */
  stand_cook: {
    speed: 3,
    frames: [
      { base: 0, props: [{ draw: drawSpoon, x: 13, y: 9,  v: 0 }] },
      { base: 1, props: [{ draw: drawSpoon, x: 14, y: 8,  v: 1 }] },
      { base: 0, props: [{ draw: drawSpoon, x: 13, y: 10, v: 0 }] },
      { base: 1, props: [{ draw: drawSpoon, x: 14, y: 9,  v: 1 }] },
    ]
  },

  /** Reaching up / into — arms raised */
  stand_reach: {
    speed: 1.5,
    frames: [
      { base: 0, arms: 'raised' },
      { base: 1, arms: 'raised' },
    ]
  },

  /** Scrubbing / washing — sponge moving up/down */
  stand_scrub: {
    speed: 4,
    frames: [
      { base: 0, props: [{ draw: drawSponge, x: 13, y: 9,  v: 0 }] },
      { base: 1, props: [{ draw: drawSponge, x: 14, y: 10, v: 1 }] },
      { base: 0, props: [{ draw: drawSponge, x: 13, y: 10, v: 0 }] },
      { base: 1, props: [{ draw: drawSponge, x: 14, y: 9,  v: 1 }] },
    ]
  },

  /** Shower — water splashes around body */
  stand_shower: {
    speed: 3,
    frames: [
      { base: 0, props: [
        { draw: drawSplash, x: 4,  y: 2, v: 0 },
        { draw: drawSplash, x: 10, y: 3, v: 1 }
      ]},
      { base: 1, props: [
        { draw: drawSplash, x: 5,  y: 3, v: 1 },
        { draw: drawSplash, x: 11, y: 2, v: 0 }
      ]},
      { base: 0, props: [
        { draw: drawSplash, x: 3,  y: 3, v: 0 },
        { draw: drawSplash, x: 9,  y: 4, v: 1 }
      ]},
      { base: 1, props: [
        { draw: drawSplash, x: 6,  y: 2, v: 1 },
        { draw: drawSplash, x: 12, y: 3, v: 0 }
      ]},
    ]
  },

  /** Brushing teeth / face grooming — brush near face */
  stand_brush: {
    speed: 4,
    frames: [
      { base: 0, props: [{ draw: drawBrush, x: 12, y: 5, v: 0 }] },
      { base: 0, props: [{ draw: drawBrush, x: 12, y: 6, v: 1 }] },
    ]
  },

  /** Folding clothes / sorting — cloth in front */
  stand_fold: {
    speed: 2,
    frames: [
      { base: 0, props: [{ draw: drawCloth, x: 6, y: 12, v: 0 }] },
      { base: 1, props: [{ draw: drawCloth, x: 5, y: 12, v: 1 }] },
    ]
  },

  /** Pushing — ironing, mowing */
  stand_push: {
    speed: 2,
    frames: [
      { base: 1, props: [{ draw: drawIron, x: 13, y: 12, v: 0 }] },
      { base: 0, props: [{ draw: drawIron, x: 13, y: 12, v: 1 }] },
    ]
  },

  /** Hammering / fixing */
  stand_hammer: {
    speed: 3,
    frames: [
      { base: 0, props: [{ draw: drawHammer, x: 13, y: 8,  v: 0 }] },
      { base: 1, props: [{ draw: drawHammer, x: 14, y: 11, v: 1 }] },
      { base: 0, props: [{ draw: drawHammer, x: 13, y: 8,  v: 0 }] },
      { base: 1, props: [{ draw: drawHammer, x: 14, y: 12, v: 1 }] },
    ]
  },

  /** Throwing / shooting hoops */
  stand_throw: {
    speed: 3,
    frames: [
      { base: 0, props: [{ draw: drawBall, x: 13, y: 9, v: 0 }] },
      { base: 2, props: [{ draw: drawBall, x: 14, y: 5, v: 0 }] },
      { base: 0 }, // hand empty — ball in flight
      { base: 0, props: [{ draw: drawBall, x: 8, y: 18, v: 0 }] },
    ]
  },

  /** Waving — arm up/down */
  stand_wave: {
    speed: 2.5,
    frames: [
      { base: 0, arms: 'raised' },
      { base: 1 },
      { base: 0, arms: 'raised' },
      { base: 0 },
    ]
  },

  /** Holding item (watering can, etc.) */
  stand_hold: {
    speed: 1.5,
    frames: [
      { base: 0, props: [{ draw: drawWateringCan, x: 12, y: 10, v: 0 }] },
      { base: 0, props: [{ draw: drawWateringCan, x: 12, y: 10, v: 1 }] },
    ]
  },

  /** Sweeping / mopping — broom swinging */
  stand_sweep: {
    speed: 2,
    frames: [
      { base: 1, props: [{ draw: drawBroom, x: 13, y: 9, v: 0 }] },
      { base: 0, props: [{ draw: drawBroom, x: 13, y: 9, v: 1 }] },
      { base: 4, props: [{ draw: drawBroom, x: 13, y: 9, v: 0 }] },
      { base: 0, props: [{ draw: drawBroom, x: 13, y: 9, v: 1 }] },
    ]
  },

  // ── SEATED INTERACTIONS ───────────────────────────────────────

  /** Eating — fork up/down rhythm */
  sit_eat: {
    speed: 2.5,
    frames: [
      { base: 0, props: [{ draw: drawFork, x: 12, y: 8, v: 0 }] },
      { base: 0, props: [{ draw: drawFork, x: 12, y: 6, v: 1 }] },
      { base: 0, props: [{ draw: drawFork, x: 12, y: 8, v: 0 }] },
      { base: 1, props: [{ draw: drawFork, x: 13, y: 6, v: 1 }] },
    ]
  },

  /** Reading — holding book */
  sit_read: {
    speed: 0.5,
    frames: [
      { base: 0, props: [{ draw: drawBook, x: 5, y: 10, v: 0 }] },
      { base: 0, props: [{ draw: drawBook, x: 5, y: 10, v: 1 }] },
    ]
  },

  /** Writing / drawing — pen scribbling */
  sit_write: {
    speed: 3,
    frames: [
      { base: 0, props: [{ draw: drawPen, x: 12, y: 10, v: 0 }] },
      { base: 1, props: [{ draw: drawPen, x: 13, y: 10, v: 1 }] },
      { base: 0, props: [{ draw: drawPen, x: 12, y: 11, v: 0 }] },
      { base: 1, props: [{ draw: drawPen, x: 13, y: 11, v: 1 }] },
    ]
  },

  /** Gaming — button mashing */
  sit_game: {
    speed: 4,
    frames: [
      { base: 0, props: [{ draw: drawController, x: 7, y: 11, v: 0 }] },
      { base: 1, props: [{ draw: drawController, x: 7, y: 11, v: 1 }] },
    ]
  },

  /** Watching — relaxed, subtle head movement */
  sit_watch: {
    speed: 0.5,
    frames: [
      { base: 0 },
      { base: 3 },
    ]
  },

  /** Talking — slight arm gestures */
  sit_talk: {
    speed: 2,
    frames: [
      { base: 0 },
      { base: 1 },
      { base: 0 },
      { base: 4 },
    ]
  },

  /** Idle seated — nearly still */
  sit_idle: {
    speed: 0.5,
    frames: [
      { base: 0 },
    ]
  },

  // ── SLEEPING ──────────────────────────────────────────────────

  /** Sleeping / napping — single frame (breathing handled by mesh) */
  sleep_breathe: {
    speed: 0.5,
    frames: [
      { base: 0 },
    ]
  },

  // ── CROUCHING / BENDING ───────────────────────────────────────

  /** Crouching work — gardening, picking up, fixing at floor */
  crouch_work: {
    speed: 2,
    frames: [
      { base: 0, compress: 0.25, props: [{ draw: drawShovel, x: 13, y: 12, v: 0 }] },
      { base: 1, compress: 0.25, props: [{ draw: drawShovel, x: 14, y: 13, v: 1 }] },
    ]
  },

  // ── ACTIVE MOVEMENT ───────────────────────────────────────────

  /** Exercise / fast motion — full walk cycle at high speed */
  exercise_active: {
    speed: 6,
    frames: [
      { base: 0 },
      { base: 1 },
      { base: 2 },
      { base: 3 },
      { base: 4 },
      { base: 5 },
    ]
  },

  /** Swimming / splashing */
  splash_swim: {
    speed: 4,
    frames: [
      { base: 1, props: [
        { draw: drawSplash, x: 3,  y: 15, v: 0 },
        { draw: drawSplash, x: 12, y: 15, v: 1 }
      ]},
      { base: 2, props: [
        { draw: drawSplash, x: 2,  y: 16, v: 1 },
        { draw: drawSplash, x: 13, y: 16, v: 0 }
      ]},
      { base: 4, props: [
        { draw: drawSplash, x: 3,  y: 15, v: 1 },
        { draw: drawSplash, x: 12, y: 15, v: 0 }
      ]},
      { base: 5, props: [
        { draw: drawSplash, x: 2,  y: 16, v: 0 },
        { draw: drawSplash, x: 13, y: 16, v: 1 }
      ]},
    ]
  },

  /** Jumping / bouncing — body shifts up */
  jump_bounce: {
    speed: 4,
    frames: [
      { base: 0, yOffset: 0 },
      { base: 2, yOffset: -2 },
      { base: 0, yOffset: 0 },
      { base: 5, yOffset: -3 },
    ]
  },
};

// ═══════════════════════════════════════════════════════════════════
// Frame generation
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate (and cache) activity animation frames for a character +
 * body animation type.
 *
 * @param {Object} spriteData  – character's full sprite JSON
 * @param {string} bodyAnimType – key from BODY_ANIM_DEFS
 * @param {number} scale – pixel scale (default 4)
 * @returns {HTMLCanvasElement[]}
 */
export function getActivityFrames(spriteData, bodyAnimType, scale = 4) {
  const cacheKey = `${spriteData.meta.name}__${bodyAnimType}`;
  if (frameCache.has(cacheKey)) return frameCache.get(cacheKey);

  const def = BODY_ANIM_DEFS[bodyAnimType];
  if (!def) {
    // Unknown type – fall back to standing frame
    const fallback = [renderSpriteFrame(spriteData, 0, scale)];
    frameCache.set(cacheKey, fallback);
    return fallback;
  }

  const colors = getCharColors(spriteData);
  const gw = spriteData.meta.gridWidth;
  const gh = spriteData.meta.gridHeight;
  const cw = gw * scale;
  const ch = gh * scale;

  const result = def.frames.map(fd => {
    // 1. Render the chosen base walk frame
    const baseCanvas = renderSpriteFrame(spriteData, fd.base || 0, scale);

    // 2. Create a composite working canvas
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');

    // 3. Draw base frame, applying body transforms
    if (fd.compress) {
      // Crouching — draw sprite compressed vertically, pushed to bottom
      const compressedH = ch * (1 - fd.compress);
      const yShift = ch - compressedH;
      ctx.drawImage(baseCanvas, 0, 0, cw, ch, 0, yShift, cw, compressedH);
    } else if (fd.yOffset) {
      // Jumping — shift sprite upward inside canvas
      ctx.drawImage(baseCanvas, 0, fd.yOffset * scale);
    } else {
      ctx.drawImage(baseCanvas, 0, 0);
    }

    // 4. Raised-arm overlay
    if (fd.arms === 'raised') {
      drawRaisedArms(ctx, colors, (fd.base || 0) % 2, scale);
    }

    // 5. Draw props
    if (fd.props) {
      for (const p of fd.props) {
        p.draw(ctx, p.x, p.y, p.v || 0, scale);
      }
    }

    return canvas;
  });

  frameCache.set(cacheKey, result);
  return result;
}

/**
 * Get the animation playback speed (fps) for a body animation type.
 */
export function getBodyAnimSpeed(bodyAnimType) {
  return BODY_ANIM_DEFS[bodyAnimType]?.speed || 2;
}

/**
 * Get the frame count for a body animation type.
 */
export function getBodyAnimFrameCount(bodyAnimType) {
  return BODY_ANIM_DEFS[bodyAnimType]?.frames.length || 1;
}

/**
 * Clear the frame cache (call if sprite data changes at runtime).
 */
export function clearActivityCache() {
  frameCache.clear();
}

export { BODY_ANIM_DEFS };
