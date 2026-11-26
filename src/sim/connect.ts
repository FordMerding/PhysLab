import { Vec2 } from "../engine/vec2";
import { Body } from "../engine/body";
import { circle } from "../engine/shapes";
import { DistanceJoint, PinJoint, SpringJoint, type Joint } from "../engine/joints";
import { PulleyRope, traceRoute, wrapDirections, type RouteElement } from "../engine/pulleyRope";
import { Rope, sagPath } from "../engine/rope";
import { ALL_LAYERS, ROPE_LAYER } from "../engine/filter";
import type { World } from "../engine/world";

// "rope": a rope with mass laid along the tapped points; "pulley": an ideal rope over any number of pulleys.
// Both are tapped point by point and finished with Done.
export type ConnectKind = "rope" | "rod" | "spring" | "pin" | "pulley";

// the instruction shown for each tap of a two-point connection
export const CONNECT_STEPS: Record<Exclude<ConnectKind, "pulley" | "rope">, string[]> = {
    rod: ["Tap the first point (an object or empty space)", "Tap the second point (an object or empty space)"],
    spring: ["Tap the first point (an object or empty space)", "Tap the second point (an object or empty space)"],
    pin: ["Tap the first point (an object or empty space)", "Tap the second point (an object or empty space)"],
};

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

export const isRouteKind = (k: ConnectKind): k is "rope" | "pulley" => k === "rope" || k === "pulley";

// What to say while the route of a rope is being tapped.
export function routeHint(kind: "rope" | "pulley", taps: number, message: string): string {
    if (message) return message;
    const pulley = kind === "pulley";
    if (taps === 0) return pulley ? "Tap the first end of the rope: an object, or empty space for a hook" : "Tap the first end of the rope: an object, or empty space";
    if (taps === 1) return pulley ? "Tap a pulley the rope goes around, or the other end of the rope" : "Tap the points the rope passes through, or the other end";
    const next = pulley ? "the next pulley or the end" : "the next point or the end";
    return `${taps} points. Tap ${next}. Press Done (or tap the last point again) to finish`;
}

export interface RouteTap {
    body: Body | null;
    local: Vec2;
}

// Builds an ideal rope from the points tapped one after another: the first and the last are the ends of
// the rope, every point between is a pulley. Tapping a circle makes the rope wrap that circle (a movable
// pulley when the circle is a moving object); a tap on empty space makes a small fixed pulley (or, at the
// ends, a hook). Nothing is added to the world unless the whole route is valid.
// With `preview` the rope is only made to be drawn: nothing is added to the world.
export function buildPulleyRope(world: World, taps: readonly RouteTap[], preview = false): { joint: Joint } | { error: string } {
    if (!preview) {
        const dry = buildPulleyRope(world, taps, true); // check the whole route before anything is added
        if ("error" in dry) return dry;
    }
    if (taps.length < 2) return { error: "Tap at least two points: the two ends of the rope" };
    const last = taps.length - 1;
    const where = (t: RouteTap): Vec2 => (t.body ? t.body.toWorld(t.local) : t.local);

    // plan every element first (a decoration is described, not yet created)
    interface Plan {
        body: Body | null; // null: make a static decoration at `at`
        at: Vec2;
        local: Vec2;
        radius: number;
        name: string;
    }
    const plans: Plan[] = taps.map((t, i): Plan => {
        const at = where(t);
        const end = i === 0 || i === last;
        const body = t.body;
        if (!body) {
            if (end) return { body: null, at, local: Vec2.ZERO, radius: 0.05, name: "Hook" };
            // a new pulley is sized to fit between its neighbours, so that the rope hangs straight down from its rim
            const gap = Math.abs(where(taps[i + 1]).x - where(taps[i - 1]).x) / 2;
            return { body: null, at, local: Vec2.ZERO, radius: Math.min(0.6, Math.max(0.12, gap)), name: "Pulley" };
        }
        if (end) return { body, at, local: body.isStatic ? t.local : Vec2.ZERO, radius: 0, name: "" }; // tied to the centre of a moving object
        if (body.shape.type === "circle") return { body, at: body.pos, local: Vec2.ZERO, radius: body.shape.radius, name: "" };
        return { body, at, local: t.local, radius: 0, name: "" }; // a point of a box or polygon
    });
    if (!plans.some((p) => p.body && !p.body.isStatic)) return { error: "The rope needs at least one object that can move" };
    for (let i = 1; i < plans.length; i++) {
        const same = plans[i].body !== null && plans[i].body === plans[i - 1].body && plans[i].at.dist(plans[i - 1].at) < 1e-6;
        if (same) return { error: "Two taps are on the same point; tap different points" };
    }

    const turn = wrapDirections(plans.map((p) => p.at));
    const route: RouteElement[] = plans.map((p, i) => {
        const end = i === 0 || i === last;
        const isDecoration = p.body === null;
        // a new wheel is solid (objects stop against it); a hook is only a mark
        const options = { name: p.name, x: p.at.x, y: p.at.y, static: true, color: "#777777", mask: p.radius > 0.05 ? undefined : 0 };
        const body = p.body ?? (preview ? new Body(circle(p.radius), options) : world.addBody(circle(p.radius), options));
        const wheel = !end && p.radius > 0;
        return { body, local: isDecoration ? Vec2.ZERO : p.local, radius: wheel ? p.radius : 0, wrap: wheel ? turn[i] : 0 };
    });
    if (traceRoute(route, null).overlap) return { error: "These points are too close together: the rope cannot run between those pulleys" };
    const joint = new PulleyRope(route);
    if (preview) return { joint };
    joint.name = `Pulley rope ${world.joints.filter((j) => j.listed).length + 1}`;
    world.addJoint(joint);
    return { joint };
}

const MAX_ROPE_NODES = 1500;

// Builds a rope (a chain of small bodies, with mass) along the tapped points: the first and the last
// are its ends, tied to an object if one was tapped or to a new fixed anchor in empty space; the points
// between only show the way. With two points the rope is laid with the "Length x" slack, with more it
// follows the tapped path exactly. Nothing is added to the world when the route is not valid.
export function buildChainRope(world: World, taps: readonly RouteTap[], o: ConnectOptions): { rope: Rope } | { error: string } {
    if (taps.length < 2) return { error: "Tap at least two points: the two ends of the rope" };
    const points = taps.map((t) => (t.body ? t.body.toWorld(t.local) : t.local));
    let length = 0;
    for (let i = 1; i < points.length; i++) length += points[i].dist(points[i - 1]);
    if (length < 0.05) return { error: "The rope would be too short; tap points further apart" };
    const spacing = o.ropeRadius * 2.5;
    const path = points.length === 2 ? sagPath(points[0], points[1], length * Math.max(1, o.ropeLengthFactor)) : points;
    const total = path === points ? length : length * Math.max(1, o.ropeLengthFactor);
    if (total / spacing > MAX_ROPE_NODES) return { error: "The rope is too long for this radius; use a larger radius or a shorter rope" };

    const first = taps[0];
    const last = taps[taps.length - 1];
    const a = anchorAt(world, points[0], first.body);
    const b = anchorAt(world, points[points.length - 1], last.body);
    a.body.ignoreCollisionWith(b.body);
    const rope = new Rope(path, {
        name: `Rope ${world.ropes.length + 1}`,
        radius: o.ropeRadius,
        spacing,
        nodeMass: o.ropeNodeMass,
    });
    rope.pinStart(a.body, a.local);
    rope.pinEnd(b.body, b.local);
    rope.addTo(world);
    return { rope };
}
