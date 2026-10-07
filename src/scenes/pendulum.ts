import { Vec2 } from "../engine/vec2";
import { DistanceJoint, PinJoint } from "../engine/joints";
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

    const hookPos = new Vec2(0, 7);
    const pendulumPos = new Vec2(3, 4);

    const stickPos = pendulumPos.add(hookPos).div(2);
    const length = hookPos.dist(pendulumPos);

    const pendulum = world.addCircle({ name: "Pendulum", x:pendulumPos.x, y:pendulumPos.y, radius: 0.5, color: "#999922"});
    const hook = world.addCircle({ name: "Hook", x: hookPos.x, y: hookPos.y, radius: 0.06, static: true, mask: free, color: "#666666" });
    const stick = world.addBox({ name: "Stick", x:stickPos.x, y:stickPos.y, w:0.2, h:length, color:"#999922"});

    world.addJoint(new PinJoint(stick, hook, {localA: new Vec2(0, -length/2)}));
    world.addJoint(new PinJoint(stick, pendulum, {localA: new Vec2(0, length/2)}));
}

export const pendulumDemo: Scene = { name: "Pendulum", view: { x: 3.3, y: 3.2, zoom: 100 }, build };