// Collision filtering uses bitmasks, not a strict partition: every object has a single
// `category` bit (what it IS) and a `mask` (what it's willing to collide WITH). Two
// objects test collision only if each one's category is included in the other's mask.
//
// This is why walls don't need to be "in every layer" as a special case: every object
// defaults to mask = ALL, so it collides with everything (including walls) unless you
// explicitly narrow its mask. Walls never need special-casing at all.
export const Layers = {
    DEFAULT: 1 << 0,
    WHEEL: 1 << 1,
    CHASSIS: 1 << 2,
    LAYER_A: 1 << 3,
    LAYER_B: 1 << 4,
    WALL: 1 << 5,
    ALL: 0xffffffff,
} as const;