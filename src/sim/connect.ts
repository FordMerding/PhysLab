import { Vec2 } from "../engine/vec2";
import type { Body } from "../engine/body";
import { circle } from "../engine/shapes";
import { DistanceJoint, PinJoint, SpringJoint, type Joint } from "../engine/joints";
import { Rope, sagPath } from "../engine/rope";
import { ALL_LAYERS, ROPE_LAYER } from "../engine/filter";
import type { World } from "../engine/world";

export type ConnectKind = "rope" | "rod" | "spring" | "pin";

export interface ConnectOptions {
    kind: ConnectKind;
    ropeLengthFactor: number; // rope length relative to the distance between its ends (>= 1 leaves slack)
    ropeRadius: number;
    ropeNodeMass: number;
    springStiffness: number;
    springDamping: number;
}

export const DEFAULT_CONNECT: ConnectOptions = {
    kind: "rope",
    ropeLengthFactor: 1.1,
    ropeRadius: 0.03,
    ropeNodeMass: 0.1,
    springStiffness: 200,
    springDamping: 5,
};

// a point attached to a body, in the body's own frame
export interface Anchor {
    body: Body;
    local: Vec2;
}

export function anchorAt(world: World, point: Vec2, body: Body | null): Anchor {
    if (body) return { body, local: body.toLocal(point) };
    // empty space: hang the connection from a fixed anchor point
    const fixed = world.addBody(circle(0.04), {
        name: "Anchor",
        x: point.x,
        y: point.y,
        static: true,
        color: "#777777",
        mask: ALL_LAYERS & ~ROPE_LAYER,
    });
    return { body: fixed, local: Vec2.ZERO };
}

export interface Connection {
    joint?: Joint;
    rope?: Rope;
}

export function connect(world: World, a: Anchor, b: Anchor, o: ConnectOptions): Connection {
    const pA = a.body.toWorld(a.local);
    let pB = b.body.toWorld(b.local);
    const dist = pA.dist(pB);
    a.body.ignoreCollisionWith(b.body);

    if (o.kind === "rope") {
        const rope = new Rope(sagPath(pA, pB, Math.max(dist, 0.05) * Math.max(1, o.ropeLengthFactor)), {
            name: `Rope ${world.ropes.length + 1}`,
            radius: o.ropeRadius,
            spacing: o.ropeRadius * 2.5,
            nodeMass: o.ropeNodeMass,
        });
        rope.pinStart(a.body, a.local);
        rope.pinEnd(b.body, b.local);
        rope.addTo(world);
        return { rope };
    }

    let joint: Joint;
    if (o.kind === "rod") {
        joint = new DistanceJoint(a.body, b.body, { length: dist, mode: "fixed", localA: a.local, localB: b.local });
        joint.name = "Rod";
    } else if (o.kind === "spring") {
        joint = new SpringJoint(a.body, b.body, {
            restLength: dist,
            stiffness: o.springStiffness,
            damping: o.springDamping,
            localA: a.local,
            localB: b.local,
        });
        joint.name = "Spring";
        joint.color = "#d4b24c";
    } else {
        // a hinge joins both bodies at the first point
        pB = pA;
        joint = new PinJoint(a.body, b.body, { localA: a.local, localB: b.body.toLocal(pB) });
        joint.name = "Hinge";
        joint.color = "#9aa0ad";
    }
    joint.name = `${joint.name} ${world.joints.filter((j) => j.listed).length + 1}`;
    world.addJoint(joint);
    return { joint };
}