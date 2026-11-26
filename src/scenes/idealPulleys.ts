import { Vec2 } from "../engine/vec2";
import { PulleyJoint } from "../engine/joints";
import type { World } from "../engine/world";
import type { Scene } from "./scene";

// Pulley problems with an ideal rope (PulleyJoint): no rope mass, no stretch, no friction.
// The numbers match the textbook formulas, so these scenes are good for measuring with
// the stopwatch, the ruler, the dynamometer and the graphs.

// Atwood machine: 3 kg and 2 kg over a fixed pulley.
//   a = (m1 - m2) g / (m1 + m2) = 1.96 m/s^2, rope tension T = 2 m1 m2 g / (m1 + m2) = 23.5 N
function buildAtwood(world: World): void {
    world.setBounds({ floor: 0 });
    const pulleyPos = new Vec2(0, 7.5);
    const r = 0.25;
    world.addCircle({ name: "Pulley", x: pulleyPos.x, y: pulleyPos.y, radius: r, static: true, color: "#666666" });
    const heavy = world.addBox({ name: "Mass 3 kg", x: -r, y: 5, w: 0.4, h: 0.4, mass: 3, color: "#d9774a", restitution: 0 });
    const light = world.addBox({ name: "Mass 2 kg", x: r, y: 0.3, w: 0.4, h: 0.4, mass: 2, color: "#4a90d9", restitution: 0 });
    const rope = world.addJoint(
        new PulleyJoint(heavy, light, { groundA: new Vec2(-r, pulleyPos.y), groundB: new Vec2(r, pulleyPos.y) })
    );
    rope.name = "Ideal rope";
}

// Block and tackle with one movable pulley: two rope segments carry the load, so the handle
// moves twice as far as the load. The load (movable pulley and weight, 20 kg) is lifted by the
// handle (14 kg): a = (mh - M/2) g / (mh + M/4) = 2.07 m/s^2 for the handle.
function buildTackle(world: World): void {
    world.setBounds({ floor: 0 });
    const hook = new Vec2(0, 7);
    world.addCircle({ name: "Fixed pulley", x: 0.5, y: 7, radius: 0.25, static: true, color: "#666666" });
    world.addCircle({ name: "Hook", x: hook.x, y: hook.y, radius: 0.06, static: true, color: "#666666" });
    const handle = world.addCircle({ name: "Handle 14 kg", x: 0.75, y: 4.2, radius: 0.15, mass: 14, color: "#d9774a", restitution: 0 });
    const load = world.addCircle({ name: "Movable pulley + load 20 kg", x: 0, y: 3, radius: 0.25, mass: 20, color: "#4a90d9", restitution: 0 });
    const rope = world.addJoint(
        new PulleyJoint(handle, load, { groundA: new Vec2(handle.pos.x, 7), groundB: hook, ratio: 2 })
    );
    rope.name = "Ideal rope";
}

export const idealAtwood: Scene = { name: "Atwood machine (ideal rope)", view: { x: 0, y: 3.9, zoom: 100, w: 3, h: 8.6 }, build: buildAtwood };
export const idealTackle: Scene = { name: "Block and tackle (ideal rope)", view: { x: 0.4, y: 3.5, zoom: 100, w: 3, h: 8 }, build: buildTackle };
