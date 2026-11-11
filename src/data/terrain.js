// Terrain types. `code` is the char stored in state.world.terrain (one char per tile).
// Fields: id, code, name, speed (movement multiplier), blocks (impassable), colors (palette for the sprite generator),
// fishing (fishing holes may be placed), ore (ore/stone nodes may spawn).
export const TERRAIN = {
  snow:      { id: 'snow',      code: 0, name: 'Snow',      speed: 1.0, blocks: false, colors: ['#e8eef4', '#d5dfe9'] },
  deep_snow: { id: 'deep_snow', code: 1, name: 'Deep snow', speed: 0.6, blocks: false, colors: ['#dbe5f0', '#c3d1e2'] },
  ice:       { id: 'ice',       code: 2, name: 'Ice',       speed: 1.0, blocks: false, colors: ['#bfe3ef', '#9fd0e3'], fishing: true },
  rock:      { id: 'rock',      code: 3, name: 'Rocky ground', speed: 1.0, blocks: false, colors: ['#9aa3ae', '#838c98'], ore: true },
  cliff:     { id: 'cliff',     code: 4, name: 'Cliff',     speed: 0,   blocks: true,  colors: ['#4b5563', '#374151'] },
};
export const TERRAIN_BY_CODE = Object.values(TERRAIN).sort((a, b) => a.code - b.code);
export const TERRAIN_IDS = TERRAIN_BY_CODE.map((t) => t.id);
