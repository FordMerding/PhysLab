// Units: meters, kilograms, seconds, radians. The Y axis points up.
export const FIXED_DT = 1 / 120;
export const MAX_FRAME_TIME = 0.1;
export const ITERATIONS = 12;
export const POSITION_ITERATIONS = 6;

export const BAUMGARTE = 0.02; // contact push-out strength (unitless)
export const MAX_POSITION_CORRECTION = 0.2; // m per position iteration
export const LINEAR_SLOP = 0.005; // m of overlap tolerated before pushing out
export const MAX_PUSH_SPEED = 3; // m/s
export const RESTITUTION_THRESHOLD = 0.5; // m/s, slower impacts don't bounce
// Contacts are generated slightly before shapes touch, so resting contacts persist between frames.
export const SPECULATIVE_MARGIN = 0.02; // m