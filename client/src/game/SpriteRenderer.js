/**
 * SpriteRenderer - Converts JSON pixel grid data into Canvas textures
 * for use as Three.js sprite materials (billboard sprites).
 */

// Cache for generated textures
const textureCache = new Map();

/**
 * Render a single frame of a sprite JSON to an OffscreenCanvas / Canvas
 * @param {Object} spriteData - The full sprite JSON object
 * @param {number} frameIndex - Which frame to render
 * @param {number} scale - Pixel size multiplier (default 4 for crispy pixel look)
 * @returns {HTMLCanvasElement}
 */
export function renderSpriteFrame(spriteData, frameIndex, scale = 4) {
  const { meta, palette, frames } = spriteData;
  const frame = frames[frameIndex % frames.length];
  const { gridWidth, gridHeight } = meta;

  const canvas = document.createElement('canvas');
  canvas.width = gridWidth * scale;
  canvas.height = gridHeight * scale;
  const ctx = canvas.getContext('2d');

  // Clear with transparency
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw each pixel
  const grid = frame.grid;
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const colorIdx = grid[row][col];
      const color = palette[String(colorIdx)];
      if (color === 'transparent' || colorIdx === 0) continue;

      ctx.fillStyle = color;
      ctx.fillRect(col * scale, row * scale, scale, scale);
    }
  }

  return canvas;
}

/**
 * Generate all animation frames as canvas elements for a sprite
 * @param {Object} spriteData - Full sprite JSON
 * @param {number} scale - Pixel scale multiplier
 * @returns {HTMLCanvasElement[]}
 */
export function renderAllFrames(spriteData, scale = 4) {
  const cacheKey = `${spriteData.meta.name}_${scale}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }

  const frames = spriteData.frames.map((_, i) => renderSpriteFrame(spriteData, i, scale));
  textureCache.set(cacheKey, frames);
  return frames;
}

/**
 * Create a sprite sheet canvas from all frames (horizontal strip)
 * @param {Object} spriteData 
 * @param {number} scale 
 * @returns {{ canvas: HTMLCanvasElement, frameWidth: number, frameHeight: number, frameCount: number }}
 */
export function createSpriteSheet(spriteData, scale = 4) {
  const { meta, frames: frameObjs } = spriteData;
  const frameCount = frameObjs.length;
  const frameWidth = meta.gridWidth * scale;
  const frameHeight = meta.gridHeight * scale;

  const canvas = document.createElement('canvas');
  canvas.width = frameWidth * frameCount;
  canvas.height = frameHeight;
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < frameCount; i++) {
    const frameCanvas = renderSpriteFrame(spriteData, i, scale);
    ctx.drawImage(frameCanvas, i * frameWidth, 0);
  }

  return { canvas, frameWidth, frameHeight, frameCount };
}
