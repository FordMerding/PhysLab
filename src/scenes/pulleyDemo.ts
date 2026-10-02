import { Vec2 } from "../engine/vec2";
import { DistanceJoint } from "../engine/joints";
import { Rope } from "../engine/rope";
import { ALL_LAYERS, ROPE_LAYER } from "../engine/filter";
import type { World } from "../engine/world";

const PULLEY_RADIUS = 20;
const ROPE_RADIUS = 5;
const TRACK = PULLEY_RADIUS + ROPE_RADIUS; // rope centerline distance from a pulley's center

function arc(center: Vec2, from: number, to: number, steps = 16): Vec2[] {
    const pts: Vec2[] = [];
    for (let i = 0; i <= steps; i++) {
        const a = from + ((to - from) * i) / steps;
        pts.push(center.add(new Vec2(Math.cos(a), Math.sin(a)).mul(TRACK)));
    }
    return pts;
}

// Block and tackle: the rope runs from a ceiling hook, under the movable pulley, over the
// fixed pulley and down to the handle. The load rests on a shelf; pull the handle down to lift it.
export function buildPulleyDemo(world: World): void {
    world.substeps = 4;
    world.iterations = 20;
    const free = ALL_LAYERS & ~ROPE_LAYER;

    const fixedPos = new Vec2(358, 100);
    const movablePos = new Vec2(310, 275);
    const hookPos = new Vec2(movablePos.x - TRACK, 100);
    const handlePos = new Vec2(fixedPos.x + TRACK, 170);

    world.addBox({ x: 310, y: 400, w: 260, h: 20, static: true, color: "#444444" });
    world.addCircle({ x: fixedPos.x, y: fixedPos.y, radius: PULLEY_RADIUS, static: true, friction: 0.05, color: "#666666" });
    const hook = world.addCircle({ x: hookPos.x, y: hookPos.y, radius: 6, static: true, mask: free, color: "#666666" });

    const movable = world.addCircle({
        x: movablePos.x,
        y: movablePos.y,
        radius: PULLEY_RADIUS,
        mass: 5,
        friction: 0.05,
        color: "#994444",
    });
    const load = world.addBox({ x: movablePos.x, y: 375, w: 100, h: 30, mass: 40, color: "#222222" });
    world.addJoint(new DistanceJoint(movable, load, { length: 100, mode: "max" }));

    const handle = world.addCircle({ x: handlePos.x, y: handlePos.y, radius: 14, mass: 4, mask: free, color: "#3366cc" });

    const rope = new Rope(
        [hookPos, ...arc(movablePos, Math.PI, 0), ...arc(fixedPos, Math.PI, 2 * Math.PI), handlePos],
        { radius: ROPE_RADIUS, spacing: 10, nodeMass: 0.05, friction: 0.05 }
    );
    rope.pinStart(hook);
    rope.pinEnd(handle);
    rope.addTo(world);
}