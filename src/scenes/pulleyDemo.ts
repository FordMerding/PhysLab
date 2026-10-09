import { Vec2 } from "../engine/vec2";
import { DistanceJoint } from "../engine/joints";
import { Rope } from "../engine/rope";
import { ALL_LAYERS, ROPE_LAYER } from "../engine/filter";
import type { World } from "../engine/world";
import type { Scene } from "./scene";
import { arc } from "./arc";

const PULLEY_RADIUS = 0.2;
const ROPE_RADIUS = 0.05;
const TRACK = PULLEY_RADIUS + ROPE_RADIUS; // rope centerline distance from a pulley's center

// Block and tackle: the rope runs from a ceiling hook, under the movable pulley, over the
// fixed pulley and down to the handle. The load rests on a shelf; pull the handle down to lift it.
function build(world: World): void {
    world.substeps = 4;
    world.iterations = 20;
    world.setBounds({ floor: 0 });
    const free = ALL_LAYERS & ~ROPE_LAYER;

    const fixedPos = new Vec2(3.58, 6.0);
    const movablePos = new Vec2(3.1, 4.25);
    const hookPos = new Vec2(movablePos.x - TRACK, 6.0);
    const handlePos = new Vec2(fixedPos.x + TRACK, 5.3);

    world.addBox({ name: "Shelf", x: 3.1, y: 3.0, w: 2.6, h: 0.2, static: true, color: "#444444" });
    world.addCircle({ name: "Fixed pulley", x: fixedPos.x, y: fixedPos.y, radius: PULLEY_RADIUS, static: true, friction: 0.05, color: "#666666" });
    const hook = world.addCircle({ name: "Hook", x: hookPos.x, y: hookPos.y, radius: 0.06, static: true, mask: free, color: "#666666" });

    const movable = world.addCircle({
        name: "Movable pulley",
        x: movablePos.x,
        y: movablePos.y,
        radius: PULLEY_RADIUS,
        mass: 5,
        friction: 0.05,
        color: "#994444",
    });
    const load = world.addBox({ name: "Load", x: movablePos.x, y: 3.25, w: 1.0, h: 0.3, mass: 40, color: "#222222" });
    const link = world.addJoint(new DistanceJoint(movable, load, { length: 1.0, mode: "max" }));
    link.name = "Load link";

    const handle = world.addCircle({ name: "Handle", x: handlePos.x, y: handlePos.y, radius: 0.14, mass: 12, mask: free, color: "#3366cc" });

    const rope = new Rope(
        [hookPos, ...arc(movablePos, TRACK, Math.PI, 2 * Math.PI), ...arc(fixedPos, TRACK, Math.PI, 0), handlePos],
        { name: "Rope", radius: ROPE_RADIUS, spacing: 0.1, nodeMass: 0.05, friction: 0.05 }
    );
    rope.pinStart(hook);
    rope.pinEnd(handle);
    rope.addTo(world);
}

export const pulleyDemo: Scene = { name: "Block and tackle", view: { x: 3.3, y: 3.2, zoom: 100, w: 3, h: 6.8 }, build };