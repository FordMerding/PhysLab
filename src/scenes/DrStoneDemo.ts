import { Vec2 } from "../engine/vec2";
import { DistanceJoint } from "../engine/joints";
import { Rope } from "../engine/rope";
import { ALL_LAYERS, ROPE_LAYER } from "../engine/filter";
import type { World } from "../engine/world";
import type { Scene } from "./scene";
import { arc } from "./arc";

const PULLEY_RADIUS = 0.2;
const ROPE_RADIUS = 0.05;
const TRACK = PULLEY_RADIUS + ROPE_RADIUS;

// Chain of three movable pulleys (8:1 advantage) lifting a heavy tree, after Dr. Stone.
// Rope 1 runs hook -> under pulley 1 -> over the fixed pulley -> handle. Rope 2 runs hook ->
// under pulley 2 -> up to the bottom of pulley 1, rope 3 hook -> under pulley 3 -> pulley 2.
function build(world: World): void {
    world.substeps = 4;
    world.iterations = 20;
    world.setBounds({ floor: 0 });
    const free = ALL_LAYERS & ~ROPE_LAYER;

    const ceilingY = 7.4;
    const movable1 = new Vec2(4.25, 3.9);
    const movable2 = new Vec2(4.5, 2.5);
    const movable3 = new Vec2(4.75, 1.5);
    const fixed = new Vec2(movable1.x - 2 * TRACK, ceilingY);
    const hook1 = new Vec2(movable1.x + TRACK, ceilingY);
    const hook2 = new Vec2(movable2.x + TRACK, ceilingY);
    const hook3 = new Vec2(movable3.x + TRACK, ceilingY);
    const handlePos = new Vec2(fixed.x - TRACK, 5.9);

    world.addCircle({ x: fixed.x, y: fixed.y, radius: PULLEY_RADIUS, static: true, friction: 0.05, color: "#666666" });
    const hooks = [hook1, hook2, hook3].map((h) =>
        world.addCircle({ x: h.x, y: h.y, radius: 0.06, static: true, mask: free, color: "#666666" })
    );
    const pulleys = [movable1, movable2, movable3].map((p) =>
        world.addCircle({ x: p.x, y: p.y, radius: PULLEY_RADIUS, mass: 5, friction: 0.05, color: "#888888" })
    );
    const handle = world.addCircle({ x: handlePos.x, y: handlePos.y, radius: 0.15, mass: 61, mask: free, color: "#4444ff" });
    const tree = world.addBox({ x: movable3.x, y: 0.5, w: 1, h: 1, mass: 600, color: "#8a6d3b" });
    world.addJoint(new DistanceJoint(tree, pulleys[2], { mode: "max", length: 1.0 }));

    const options = { radius: ROPE_RADIUS, spacing: 0.15, nodeMass: 0.5, friction: 0.05, damping: 100 };
    const rim = new Vec2(0, -TRACK); // rope 2 and 3 hang from the bottom of the pulley above them

    const rope1 = new Rope(
        [hook1, ...arc(movable1, TRACK, 0, -Math.PI), ...arc(fixed, TRACK, 0, Math.PI), handlePos],
        options
    );
    rope1.pinStart(hooks[0]);
    rope1.pinEnd(handle);
    rope1.addTo(world);

    const rope2 = new Rope(
        [hook2, ...arc(movable2, TRACK, 0, -Math.PI), movable1.add(rim)],
        options
    );
    rope2.pinStart(hooks[1]);
    rope2.pinEnd(pulleys[0], rim);
    rope2.addTo(world);

    const rope3 = new Rope(
        [hook3, ...arc(movable3, TRACK, 0, -Math.PI), movable2.add(rim)],
        options
    );
    rope3.pinStart(hooks[2]);
    rope3.pinEnd(pulleys[1], rim);
    rope3.addTo(world);
}

export const drStoneDemo: Scene = { name: "Dr. Stone pulleys", view: { x: 4.2, y: 3.8, zoom: 100 }, build };