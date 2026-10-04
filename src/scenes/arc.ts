import { Vec2 } from "../engine/vec2";

// Points on a circle around `center`; angles in radians, counter-clockwise from +X (Y up).
export function arc(center: Vec2, radius: number, from: number, to: number, steps = 16): Vec2[] {
    const pts: Vec2[] = [];
    for (let i = 0; i <= steps; i++) {
        const a = from + ((to - from) * i) / steps;
        pts.push(center.add(new Vec2(Math.cos(a), Math.sin(a)).mul(radius)));
    }
    return pts;
}