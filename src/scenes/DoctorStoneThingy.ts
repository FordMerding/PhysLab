import { Vec2 } from "../engine/vec2";
import { DistanceJoint } from "../engine/joints";
import { Rope } from "../engine/rope";
import { ALL_LAYERS, ROPE_LAYER } from "../engine/filter";
import type { World } from "../engine/world";

const PULLEY_RADIUS = 20;
const ROPE_RADIUS = 5;
const TRACK = PULLEY_RADIUS + ROPE_RADIUS;

function arc(center: Vec2, from: number, to: number, steps = 16): Vec2[] {
    const pts: Vec2[] = [];
    for (let i = 0; i <= steps; i++) {
        const a = from + ((to - from) * i) / steps;
        pts.push(center.add(new Vec2(Math.cos(a), Math.sin(a)).mul(TRACK)));
    }
    return pts;
}

export function buildDrStonePulleyDemo(world: World): void {
    world.substeps = 4;
    world.iterations = 20;
    const free = ALL_LAYERS & ~ROPE_LAYER; 

    const fixed    = new Vec2(370, 100);
    const ceiling1 = new Vec2(450, 100);
    const ceiling2 = new Vec2(480, 100);
    const ceiling3 = new Vec2(510, 100);
    const movable1 = new Vec2(425, 300);
    const movable2 = new Vec2(450, 500);
    const movable3 = new Vec2(475, 700);
    const handle   = new Vec2(350, 250);
    const objM     = new Vec2(475, 790);

    world.addCircle({x: fixed.x, y: fixed.y, radius: PULLEY_RADIUS, static: true, friction: 0.05, color: "#666666"});
    const hook1 = world.addCircle({x: ceiling1.x, y: ceiling1.y, radius: 6, static: true, mask: free, color: "#666666"});
    const hook2 = world.addCircle({x: ceiling2.x, y: ceiling2.y, radius: 6, static: true, mask: free, color: "#666666"});
    const hook3 = world.addCircle({x: ceiling3.x, y: ceiling3.y, radius: 6, static: true, mask: free, color: "#666666"});
    const Pulley1 = world.addCircle({x: movable1.x, y: movable1.y, radius: PULLEY_RADIUS, mass: 5, static: false, friction: 0.05, color: "#666666"});
    const Pulley2 = world.addCircle({x: movable2.x, y: movable2.y, radius: PULLEY_RADIUS, mass: 5, static: false, friction: 0.05, color: "#666666"});
    const Pulley3 = world.addCircle({x: movable3.x, y: movable3.y, radius: PULLEY_RADIUS, mass: 5, static: false, friction: 0.05, color: "#666666"});
    const Obj = world.addCircle({x: handle.x, y: handle.y, radius: 15, mass: 61, static: false, mask: free, color: "#4444ff"});
    const Tree   = world.addBox({x: objM.x, y: objM.y, w:100, h:100, mass: 600});

    const rope1 = new Rope(
        [ceiling1, ...arc(movable1, 0, Math.PI), ...arc(fixed, 0, -Math.PI), handle],
        { radius: ROPE_RADIUS, spacing: 10, nodeMass: 0.05, friction: 0.05 }
    );
    rope1.pinStart(hook1);
    rope1.pinEnd(Obj);
    rope1.addTo(world);

    const rope2 = new Rope(
        [ceiling2, ...arc(movable2, 0, Math.PI), movable1],
        { radius: ROPE_RADIUS, spacing: 10, nodeMass: 0.05, friction: 0.05 }
    );
    rope2.pinStart(hook2);
    rope2.pinEnd(Pulley1);
    rope2.addTo(world);

    const rope3 = new Rope(
        [ceiling3, ...arc(movable3, 0, Math.PI), movable2],
        { radius: ROPE_RADIUS, spacing: 10, nodeMass: 0.05, friction: 0.05 }
    );
    rope3.pinStart(hook3);
    rope3.pinEnd(Pulley2);
    rope3.addTo(world);

    world.addJoint(new DistanceJoint(Tree, Pulley3, {mode:"max", length:100}));
}