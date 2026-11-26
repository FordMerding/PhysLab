// Reference experiments for the PhysLab engine.
//
// Every experiment builds a small world in SI units (m, kg, s, N), runs it, and compares one
// measured quantity with the value that follows from the textbook formula. The same list feeds
// the automated tests (physics.test.ts) and the "theory / result / error" table (npm run validate).
//
// Conventions used in every experiment:
//  * world.fixedDt = 1/120 s, 4 substeps, 20 + 12 velocity iterations, 6 position iterations
//    (the defaults), unless the experiment says otherwise.
//  * The engine combines the friction of two touching bodies as sqrt(mu_a * mu_b), so experiments
//    that need a given coefficient set it on BOTH bodies.
//  * relative error = |numeric - theory| / |theory|.

import { Vec2 } from "../src/engine/vec2";
import { Body } from "../src/engine/body";
import { World } from "../src/engine/world";
import { plane } from "../src/engine/shapes";
import { DistanceJoint, PulleyJoint } from "../src/engine/joints";
import { PulleyRope, wrapDirections, type RouteElement } from "../src/engine/pulleyRope";
import { Rope } from "../src/engine/rope";
import { ALL_LAYERS, ROPE_LAYER } from "../src/engine/filter";
import { arc } from "../src/scenes/arc";

export const G = 9.81;

export interface Experiment {
    id: string;
    title: string;
    setup: string; // parameters, so the experiment can be reproduced by hand
    quantity: string;
    unit: string;
    theory: number;
    numeric: number;
    tolerance: number; // allowed relative error
    note?: string;
}

export const relError = (numeric: number, theory: number): number =>
    theory === 0 ? Math.abs(numeric) : Math.abs(numeric - theory) / Math.abs(theory);

function run(world: World, seconds: number, each?: (step: number) => void): void {
    const n = Math.round(seconds / world.fixedDt);
    for (let i = 0; i < n; i++) {
        world.stepOnce();
        each?.(i);
    }
}

// ---------- helpers for scenes ----------

function inclinedPlane(world: World, angle: number, mu: number): Vec2 {
    // surface through the origin, rising to the right; returns the outward normal
    const n = new Vec2(-Math.sin(angle), Math.cos(angle));
    world.add(new Body(plane(n, Vec2.ZERO), { friction: mu }));
    return n;
}

// complete elliptic integral of the first kind via the arithmetic-geometric mean
function ellipticK(k: number): number {
    let a = 1;
    let b = Math.sqrt(1 - k * k);
    for (let i = 0; i < 30; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
    return Math.PI / (2 * a);
}

// exact period of a simple pendulum of any amplitude
export function pendulumPeriod(length: number, amplitude: number): number {
    return 4 * Math.sqrt(length / G) * ellipticK(Math.sin(amplitude / 2));
}

// ---------- individual experiments ----------

function freeFall(): Experiment[] {
    const w = new World();
    const b = w.addCircle({ radius: 0.1, x: 0, y: 10 });
    run(w, 1);
    return [
        {
            id: "free-fall-v",
            title: "Free fall: velocity",
            setup: "m = 1 kg, v0 = 0, no air, t = 1 s",
            quantity: "v(1 s)",
            unit: "m/s",
            theory: -G,
            numeric: b.vy,
            tolerance: 1e-3,
        },
        {
            id: "free-fall-y",
            title: "Free fall: distance",
            setup: "same, y0 = 10 m",
            quantity: "y(0) - y(1 s)",
            unit: "m",
            theory: 0.5 * G,
            numeric: 10 - b.pos.y,
            tolerance: 5e-3,
            note: "semi-implicit Euler: error is first order in the substep (see convergence test)",
        },
    ];
}

function projectile(): Experiment {
    const speed = 20;
    const angle = (45 * Math.PI) / 180;
    const w = new World();
    const b = w.addCircle({ radius: 0.1, x: 0, y: 0 });
    b.vx = speed * Math.cos(angle);
    b.vy = speed * Math.sin(angle);
    let range = NaN;
    let prevX = 0;
    let prevY = 0;
    for (let i = 0; i < 1000 && Number.isNaN(range); i++) {
        w.stepOnce();
        if (b.pos.y <= 0 && prevY > 0) {
            const f = prevY / (prevY - b.pos.y); // interpolate the landing point
            range = prevX + f * (b.pos.x - prevX);
        }
        prevX = b.pos.x;
        prevY = b.pos.y;
    }
    return {
        id: "projectile-range",
        title: "Projectile range",
        setup: "v0 = 20 m/s at 45 degrees, no air, launch and landing at y = 0",
        quantity: "range",
        unit: "m",
        theory: (speed * speed * Math.sin(2 * angle)) / G,
        numeric: range,
        tolerance: 0.02,
    };
}

function slidingStop(): Experiment {
    const mu = 0.3;
    const v0 = 3;
    const w = new World();
    w.setBounds({ floor: 0 });
    for (const b of w.bodies) b.friction = mu; // the floor
    const box = w.addBox({ w: 1, h: 1, x: 0, y: 0.5, mass: 2, friction: mu, restitution: 0 });
    box.vx = v0;
    run(w, 3);
    return {
        id: "sliding-stop",
        title: "Sliding with friction: stopping distance",
        setup: "box 2 kg, mu = 0.3 (box and floor), v0 = 3 m/s",
        quantity: "distance to stop",
        unit: "m",
        theory: (v0 * v0) / (2 * mu * G),
        numeric: box.pos.x,
        tolerance: 0.02,
    };
}

function inclineSlide(): Experiment {
    const angle = (30 * Math.PI) / 180;
    const mu = 0.2;
    const w = new World();
    const n = inclinedPlane(w, angle, mu);
    const start = new Vec2(Math.cos(angle) * 2, Math.sin(angle) * 2).add(n.mul(0.1));
    const box = w.addBox({ w: 0.4, h: 0.2, x: start.x, y: start.y, angle, mass: 1, friction: mu, restitution: 0 });
    const t = 1.5;
    run(w, t);
    const d = box.pos.sub(start).len();
    return {
        id: "incline-slide",
        title: "Block sliding down an incline: acceleration",
        setup: "30 degrees, mu = 0.2, m = 1 kg, from rest, t = 1.5 s",
        quantity: "a = 2d/t^2",
        unit: "m/s^2",
        theory: G * (Math.sin(angle) - mu * Math.cos(angle)),
        numeric: (2 * d) / (t * t),
        tolerance: 0.01,
    };
}

function inclineStatic(): Experiment {
    const angle = (30 * Math.PI) / 180;
    const mu = 0.7; // tan(30 degrees) = 0.577 < mu: the block must stay put
    const w = new World();
    const n = inclinedPlane(w, angle, mu);
    const start = new Vec2(Math.cos(angle) * 2, Math.sin(angle) * 2).add(n.mul(0.1));
    const box = w.addBox({ w: 0.4, h: 0.2, x: start.x, y: start.y, angle, mass: 1, friction: mu, restitution: 0 });
    run(w, 3);
    return {
        id: "incline-static",
        title: "Block at rest on a rough incline (mu > tan a)",
        setup: "30 degrees, mu = 0.7, m = 1 kg, t = 3 s",
        quantity: "displacement",
        unit: "m",
        theory: 0,
        numeric: box.pos.sub(start).len(),
        tolerance: 2e-3, // absolute, because the theory value is 0
        note: "tolerance is absolute (m)",
    };
}

function rollingDisk(): Experiment {
    const angle = (30 * Math.PI) / 180;
    const w = new World();
    const n = inclinedPlane(w, angle, 1);
    const r = 0.2;
    const start = new Vec2(Math.cos(angle) * 3, Math.sin(angle) * 3).add(n.mul(r));
    const disk = w.addCircle({ radius: r, x: start.x, y: start.y, mass: 2, friction: 1, restitution: 0 });
    const t = 1.5;
    run(w, t);
    const d = disk.pos.sub(start).len();
    return {
        id: "rolling-disk",
        title: "Solid disk rolling down an incline: acceleration",
        setup: "30 degrees, no slipping (mu = 1), solid disk r = 0.2 m, from rest, t = 1.5 s",
        quantity: "a = 2d/t^2",
        unit: "m/s^2",
        theory: (2 / 3) * G * Math.sin(angle),
        numeric: (2 * d) / (t * t),
        tolerance: 0.02,
    };
}

function pendulum(amplitude: number, id: string): Experiment[] {
    const L = 1;
    const w = new World();
    const hook = w.addCircle({ radius: 0.02, x: 0, y: 5, static: true });
    const bob = w.addCircle({
        radius: 0.05,
        x: L * Math.sin(amplitude),
        y: 5 - L * Math.cos(amplitude),
        mass: 1,
        restitution: 0,
    });
    w.addJoint(new DistanceJoint(hook, bob, { length: L, mode: "fixed" }));
    const angleOf = () => Math.atan2(bob.pos.x, 5 - bob.pos.y);
    const energy = () => 0.5 * (bob.vx ** 2 + bob.vy ** 2) + G * bob.pos.y;

    const e0 = energy();
    const keMax = e0 - G * (5 - L); // kinetic energy at the lowest point
    let drift = 0;
    const crossings: number[] = [];
    let prev = angleOf();
    run(w, 12, (i) => {
        const th = angleOf();
        if (prev > 0 && th <= 0) crossings.push((i + prev / (prev - th)) * w.fixedDt); // linear interpolation inside the step
        prev = th;
        drift = Math.max(drift, Math.abs(energy() - e0));
    });
    const periods = crossings.slice(1).map((c, i) => c - crossings[i]);
    const mean = periods.reduce((a, b) => a + b, 0) / periods.length;
    const deg = ((amplitude * 180) / Math.PI).toFixed(1);
    return [
        {
            id: `${id}-period`,
            title: `Pendulum period, amplitude ${deg} degrees`,
            setup: `L = 1 m, m = 1 kg, rigid rod, amplitude ${deg} degrees; mean of ${periods.length} periods`,
            quantity: "T",
            unit: "s",
            theory: pendulumPeriod(L, amplitude),
            numeric: mean,
            tolerance: 1e-3,
            note: "theory: exact elliptic-integral period, not the small-angle formula",
        },
        {
            id: `${id}-energy`,
            title: `Pendulum energy drift, amplitude ${deg} degrees`,
            setup: "same, 12 s; drift = max |E - E0| / (kinetic energy at the lowest point)",
            quantity: "energy drift",
            unit: "",
            theory: 0,
            numeric: drift / keMax,
            tolerance: 0.03, // absolute, because the theory value is 0
            note: "tolerance is absolute (fraction); energy is conserved only approximately, see README",
        },
    ];
}

function collision(m1: number, v1: number, m2: number, v2: number, e: number, id: string): Experiment[] {
    const w = new World();
    w.gravity = new Vec2(0, 0);
    const a = w.addCircle({ radius: 0.5, x: -2, y: 0, mass: m1, restitution: e });
    const b = w.addCircle({ radius: 0.5, x: 2, y: 0, mass: m2, restitution: e });
    a.vx = v1;
    b.vx = v2;
    run(w, 3);
    const thA = ((m1 - e * m2) * v1 + (1 + e) * m2 * v2) / (m1 + m2);
    const thB = ((m2 - e * m1) * v2 + (1 + e) * m1 * v1) / (m1 + m2);
    const setup = `m1 = ${m1} kg at ${v1} m/s, m2 = ${m2} kg at ${v2} m/s, e = ${e}, no gravity`;
    return [
        { id: `${id}-va`, title: `Collision e = ${e}: velocity of body 1`, setup, quantity: "v1'", unit: "m/s", theory: thA, numeric: a.vx, tolerance: 0.01 },
        { id: `${id}-vb`, title: `Collision e = ${e}: velocity of body 2`, setup, quantity: "v2'", unit: "m/s", theory: thB, numeric: b.vx, tolerance: 0.01 },
        {
            id: `${id}-p`,
            title: `Collision e = ${e}: momentum conservation`,
            setup,
            quantity: "p after",
            unit: "kg m/s",
            theory: m1 * v1 + m2 * v2,
            numeric: m1 * a.vx + m2 * b.vx,
            tolerance: 1e-6,
        },
    ];
}

function bounce(): Experiment {
    const e = 0.6;
    const w = new World();
    w.setBounds({ floor: 0 });
    const r = 0.1;
    const b = w.addCircle({ radius: r, x: 0, y: 2 + r, restitution: e });
    let rebounded = false;
    let top = 0;
    run(w, 3, () => {
        if (b.vy > 0) rebounded = true;
        if (rebounded) top = Math.max(top, b.pos.y - r);
    });
    return {
        id: "bounce-height",
        title: "Bounce height",
        setup: "ball dropped from 2 m, restitution e = 0.6 (floor restitution is 0)",
        quantity: "rebound height",
        unit: "m",
        theory: e * e * 2,
        numeric: top,
        tolerance: 0.03,
    };
}

function restingForce(): Experiment {
    const w = new World();
    w.setBounds({ floor: 0 });
    const m = 5;
    const b = w.addBox({ w: 1, h: 1, x: 0, y: 0.5, mass: m });
    run(w, 2);
    return {
        id: "normal-force",
        title: "Dynamometer: normal force on a resting block",
        setup: "m = 5 kg on the floor; force = contact impulse per step / step length",
        quantity: "N",
        unit: "N",
        theory: m * G,
        numeric: b.constraintForceY,
        tolerance: 1e-3,
    };
}

function hangingForce(): Experiment {
    const w = new World();
    const m = 2;
    const hook = w.addCircle({ radius: 0.05, x: 0, y: 5, static: true });
    const b = w.addCircle({ radius: 0.1, x: 0, y: 3, mass: m });
    const joint = w.addJoint(new DistanceJoint(hook, b, { length: 2, mode: "fixed" }));
    run(w, 2);
    return {
        id: "rod-tension",
        title: "Dynamometer: tension of a rod holding a hanging mass",
        setup: "m = 2 kg on a rigid rod, at rest; DistanceJoint.force() (positive = pushes apart)",
        quantity: "|T|",
        unit: "N",
        theory: m * G,
        numeric: Math.abs(joint.force()),
        tolerance: 1e-3,
    };
}

interface AtwoodResult {
    a: number;
    T: number;
    stretch: number;
    ropeMass: number;
    ropeLength: number;
}

// Two masses over a fixed frictionless pulley. Returns the measured acceleration of m1 (downwards)
// and the mean tension read from the engine's constraint force on m1.
function runAtwood(m1: number, m2: number, nodeMass: number, seconds = 1): AtwoodResult {
    const w = new World();
    w.setBounds({ floor: 0 });
    const free = ALL_LAYERS & ~ROPE_LAYER;
    const R = 0.2;
    const rr = 0.03;
    const track = R + rr;
    const c = new Vec2(0, 6);
    w.addCircle({ radius: R, x: c.x, y: c.y, static: true, friction: 0 });
    const A = new Vec2(-track, 4);
    const B = new Vec2(track, 4);
    const b1 = w.addCircle({ radius: 0.1, x: A.x, y: A.y, mass: m1, mask: free });
    const b2 = w.addCircle({ radius: 0.1, x: B.x, y: B.y, mass: m2, mask: free });
    const rope = new Rope([A, new Vec2(-track, 6), ...arc(c, track, Math.PI, 0), new Vec2(track, 6), B], {
        radius: rr,
        spacing: 0.1,
        nodeMass,
        friction: 0,
    });
    rope.pinStart(b1);
    rope.pinEnd(b2);
    rope.addTo(w);

    const y0 = b1.pos.y;
    let sum = 0;
    let n = 0;
    const settle = Math.round(0.25 / w.fixedDt);
    run(w, seconds, (i) => {
        if (i >= settle) {
            sum += b1.constraintForceY;
            n++;
        }
    });
    return {
        a: (2 * (y0 - b1.pos.y)) / (seconds * seconds),
        T: sum / n,
        stretch: rope.stretch(),
        ropeMass: rope.nodes.length * nodeMass,
        ropeLength: rope.restLength,
    };
}

function atwood(): Experiment[] {
    const m1 = 2;
    const m2 = 1;
    const r = runAtwood(m1, m2, 0.01);
    const setup = `m1 = 2 kg, m2 = 1 kg, frictionless fixed pulley r = 0.2 m, rope ${r.ropeLength.toFixed(2)} m / ${r.ropeMass.toFixed(2)} kg (node mass 0.01 kg), t = 1 s`;
    return [
        {
            id: "atwood-a",
            title: "Atwood machine: acceleration",
            setup,
            quantity: "a",
            unit: "m/s^2",
            theory: (G * (m1 - m2)) / (m1 + m2 + r.ropeMass),
            numeric: r.a,
            tolerance: 0.05,
            note: "theory counts the rope mass as extra inertia",
        },
        {
            id: "atwood-T",
            title: "Atwood machine: rope tension (dynamometer)",
            setup,
            quantity: "T",
            unit: "N",
            theory: (2 * m1 * m2 * G) / (m1 + m2),
            numeric: r.T,
            tolerance: 0.05,
            note: "mean of the per-step force on m1 from 0.25 s to 1 s",
        },
        {
            id: "atwood-stretch",
            title: "Atwood machine: rope inextensibility",
            setup,
            quantity: "stretch / length",
            unit: "",
            theory: 0,
            numeric: Math.abs(r.stretch) / r.ropeLength,
            tolerance: 0.01, // absolute (fraction of rope length)
            note: "tolerance is absolute (fraction of rope length)",
        },
    ];
}

export interface TackleRow {
    nodeMass: number;
    load: number; // movable pulley + load, kg
    handle: number; // kg
    ropeMass: number;
    massRatio: number; // load / node mass
    theory: number; // m/s^2, rope mass neglected
    numeric: number;
    error: number;
    maxStretch: number; // largest |rope stretch| / rope length during the run
}

// Movable pulley with a hanging load; rope: hook -> under the pulley -> over a fixed pulley -> handle.
// Ideal theory (massless rope, frictionless pulleys): a(handle) = (mh - M/2) g / (mh + M/4).
// The acceleration is measured between 0.5 s and 0.9 s, after the start-up transient.
export function tackleRun(nodeMass: number, load: number, handle: number, substeps = 4, iterations = 20): TackleRow {
    const w = new World();
    w.setBounds({ floor: 0 });
    w.substeps = substeps;
    w.iterations = iterations;
    const free = ALL_LAYERS & ~ROPE_LAYER;
    const R = 0.2;
    const rr = 0.03;
    const track = R + rr;
    const movablePos = new Vec2(0, 3);
    const fixedPos = new Vec2(2 * track, 5); // its left rim is above the movable pulley's right rim
    const hookPos = new Vec2(-track, 5);
    const handlePos = new Vec2(fixedPos.x + track, 3.6);

    w.addCircle({ radius: R, x: fixedPos.x, y: fixedPos.y, static: true, friction: 0 });
    const hook = w.addCircle({ radius: 0.05, x: hookPos.x, y: hookPos.y, static: true, mask: free });
    w.addCircle({ radius: R, x: movablePos.x, y: movablePos.y, mass: load, friction: 0 });
    const h = w.addCircle({ radius: 0.1, x: handlePos.x, y: handlePos.y, mass: handle, mask: free });
    const rope = new Rope(
        [hookPos, ...arc(movablePos, track, Math.PI, 2 * Math.PI), ...arc(fixedPos, track, Math.PI, 0), handlePos],
        { radius: rr, spacing: 0.1, nodeMass, friction: 0 }
    );
    rope.pinStart(hook);
    rope.pinEnd(h);
    rope.addTo(w);

    const t1 = 0.5;
    const t2 = 0.9;
    let v1 = 0;
    let v2 = 0;
    let maxStretch = 0;
    const n2 = Math.round(t2 / w.fixedDt);
    for (let i = 0; i <= n2; i++) {
        if (i === Math.round(t1 / w.fixedDt)) v1 = h.vy;
        if (i === n2) v2 = h.vy;
        maxStretch = Math.max(maxStretch, Math.abs(rope.stretch()) / rope.restLength);
        w.stepOnce();
    }
    const numeric = -(v2 - v1) / (t2 - t1);
    const theory = ((handle - load / 2) * G) / (handle + load / 4);
    return {
        nodeMass,
        load,
        handle,
        ropeMass: rope.nodes.length * nodeMass,
        massRatio: load / nodeMass,
        theory,
        numeric,
        error: relError(numeric, theory),
        maxStretch,
    };
}

// Configurations reported in the "limitations" part of the validation table. They are NOT pass/fail
// experiments: the rope's own mass and the heavy-load / light-rope mass ratio decide the accuracy.
export function tackleSweep(): TackleRow[] {
    const rows: TackleRow[] = [];
    for (const nodeMass of [0.005, 0.01, 0.02, 0.05, 0.1]) {
        for (const [load, handle] of [[20, 14], [20, 16], [10, 8]]) rows.push(tackleRun(nodeMass, load, handle));
    }
    return rows;
}

// Builds an ideal rope through the given stops; the wrap direction of each wheel comes from the shape of the route.
export function pulleyRouteOf(stops: Array<{ body: Body; local?: Vec2; radius?: number }>): PulleyRope {
    const centers = stops.map((s) => s.body.toWorld(s.local ?? Vec2.ZERO));
    const turn = wrapDirections(centers);
    const route: RouteElement[] = stops.map((s, i) => ({ body: s.body, local: s.local ?? Vec2.ZERO, radius: s.radius ?? 0, wrap: (s.radius ?? 0) > 0 ? turn[i] : 0 }));
    return new PulleyRope(route);
}

// Block and tackle with `segments` rope pieces carrying the load (2 or 4), built from real wheels with radii.
// Theory (ideal rope, massless wheels): a(handle) = (mh - M/n) g / (mh + M/n^2), handle moves n times as far as the load.
export function tackleWithWheels(segments: 2 | 4): { aHandle: number; theory: number; ratio: number; tension: number; tensionTheory: number } {
    const M = 20;
    const mh = segments === 2 ? 14 : 8;
    const r = 0.1;
    const w = new World();
    w.setBounds({ floor: 0 });
    const wheel = (x: number, y: number, rad: number): Body => w.addCircle({ radius: rad, x, y, static: true, mask: 0 });
    let rope: PulleyRope;
    let handle: Body;
    let load: Body;
    if (segments === 2) {
        const hook = wheel(-r, 7, 0.03);
        const fixed = wheel(r, 7, r);
        load = w.addCircle({ radius: r, x: 0, y: 3, mass: M });
        handle = w.addCircle({ radius: 0.08, x: 2 * r, y: 4, mass: mh });
        rope = pulleyRouteOf([{ body: hook }, { body: load, radius: r }, { body: fixed, radius: r }, { body: handle }]);
    } else {
        const hook = wheel(-0.3, 6.5, 0.03);
        const f1 = wheel(0, 6, r);
        const f2 = wheel(0.4, 6, r);
        load = w.addBox({ w: 0.6, h: 0.2, x: 0, y: 3, mass: M });
        handle = w.addCircle({ radius: 0.08, x: 0.5, y: 4, mass: mh });
        rope = pulleyRouteOf([
            { body: hook },
            { body: load, local: new Vec2(-0.2, 0), radius: r },
            { body: f1, radius: r },
            { body: load, local: new Vec2(0.2, 0), radius: r },
            { body: f2, radius: r },
            { body: handle },
        ]);
    }
    w.addJoint(rope);
    const h0 = handle.pos.y;
    const p0 = load.pos.y;
    let tension = 0;
    run(w, 1, () => (tension += rope.tension() / 120));
    const n = segments;
    const theory = ((mh - M / n) * G) / (mh + M / (n * n));
    return {
        aHandle: 2 * (h0 - handle.pos.y),
        theory,
        ratio: (h0 - handle.pos.y) / (load.pos.y - p0),
        tension,
        tensionTheory: mh * (G - theory),
    };
}

// Pulleys with an ideal rope (PulleyJoint): the textbook formulas apply exactly, no rope mass.
function idealPulleys(): Experiment[] {
    const m1 = 3;
    const m2 = 2;
    const w = new World();
    w.setBounds({ floor: 0 });
    const b1 = w.addBox({ w: 0.4, h: 0.4, x: -0.25, y: 5, mass: m1 });
    const b2 = w.addBox({ w: 0.4, h: 0.4, x: 0.25, y: 5, mass: m2 });
    const rope = w.addJoint(new PulleyJoint(b1, b2, { groundA: new Vec2(-0.25, 7), groundB: new Vec2(0.25, 7) }));
    const y0 = b1.pos.y;
    let tension = 0;
    run(w, 1, () => (tension += rope.tension() / 120));
    const atwoodSetup = "m1 = 3 kg, m2 = 2 kg, ideal rope over a frictionless fixed pulley, t = 1 s";

    const M = 20;
    const mh = 14;
    const w2 = new World();
    w2.setBounds({ floor: 0 });
    const handle = w2.addCircle({ radius: 0.1, x: 0.7, y: 4, mass: mh });
    const load = w2.addCircle({ radius: 0.2, x: 0, y: 3, mass: M });
    w2.addJoint(new PulleyJoint(handle, load, { groundA: new Vec2(0.7, 7), groundB: new Vec2(0, 7), ratio: 2 }));
    const h0 = handle.pos.y;
    const p0 = load.pos.y;
    run(w2, 1);
    const tackleSetup = `movable pulley + load ${M} kg, handle ${mh} kg, ideal rope, two segments carry the pulley, t = 1 s`;
    return [
        {
            id: "ideal-atwood-a",
            title: "Atwood machine, ideal rope: acceleration",
            setup: atwoodSetup,
            quantity: "a",
            unit: "m/s^2",
            theory: (G * (m1 - m2)) / (m1 + m2),
            numeric: (2 * (y0 - b1.pos.y)) / 1,
            tolerance: 5e-3,
            note: "semi-implicit Euler: first-order error in the substep",
        },
        {
            id: "ideal-atwood-T",
            title: "Atwood machine, ideal rope: tension",
            setup: atwoodSetup,
            quantity: "T",
            unit: "N",
            theory: (2 * m1 * m2 * G) / (m1 + m2),
            numeric: tension,
            tolerance: 1e-3,
            note: "mean tension over the run, PulleyJoint.tension()",
        },
        {
            id: "ideal-atwood-force",
            title: "Atwood machine, ideal rope: dynamometer on m1",
            setup: atwoodSetup,
            quantity: "F on m1",
            unit: "N",
            theory: (2 * m1 * m2 * G) / (m1 + m2),
            numeric: b1.constraintForceY,
            tolerance: 1e-3,
        },
        {
            id: "ideal-tackle-a",
            title: "Block and tackle, ideal rope: handle acceleration",
            setup: tackleSetup,
            quantity: "a(handle)",
            unit: "m/s^2",
            theory: ((mh - M / 2) * G) / (mh + M / 4),
            numeric: (2 * (h0 - handle.pos.y)) / 1,
            tolerance: 5e-3,
        },
        {
            id: "ideal-tackle-ratio",
            title: "Block and tackle, ideal rope: handle travels twice as far as the load",
            setup: tackleSetup,
            quantity: "d(handle) / d(load)",
            unit: "",
            theory: 2,
            numeric: (h0 - handle.pos.y) / (load.pos.y - p0),
            tolerance: 1e-3,
        },
    ];
}

function pulleyRopes(): Experiment[] {
    const out: Experiment[] = [];
    for (const n of [2, 4] as const) {
        const t = tackleWithWheels(n);
        const setup = `pulley rope over wheels with radii, load 20 kg carried by ${n} rope pieces, handle ${n === 2 ? 14 : 8} kg, t = 1 s`;
        out.push(
            { id: `rope-${n}-a`, title: `Pulley rope, ${n} pieces: handle acceleration`, setup, quantity: "a(handle)", unit: "m/s^2", theory: t.theory, numeric: t.aHandle, tolerance: 8e-3 },
            { id: `rope-${n}-ratio`, title: `Pulley rope, ${n} pieces: handle travels ${n} times as far as the load`, setup, quantity: "d(handle) / d(load)", unit: "", theory: n, numeric: t.ratio, tolerance: 1e-2 },
            { id: `rope-${n}-T`, title: `Pulley rope, ${n} pieces: tension`, setup, quantity: "T", unit: "N", theory: t.tensionTheory, numeric: t.tension, tolerance: 1e-2, note: "T = mh (g - a)" }
        );
    }
    return out;
}

export function allExperiments(): Experiment[] {
    return [
        ...freeFall(),
        projectile(),
        slidingStop(),
        inclineSlide(),
        inclineStatic(),
        rollingDisk(),
        ...pendulum(0.1, "pendulum-small"),
        ...pendulum(0.5, "pendulum-large"),
        ...collision(1, 3, 1, 0, 1, "collision-elastic"),
        ...collision(1, 4, 3, -1, 0.5, "collision-e05"),
        ...collision(1, 4, 3, -1, 0, "collision-plastic"),
        bounce(),
        restingForce(),
        hangingForce(),
        ...atwood(),
        ...idealPulleys(),
        ...pulleyRopes(),
    ];
}

// ---------- convergence ----------

// error of the free-fall distance after 1 s for a given number of substeps
export function freeFallError(substeps: number): number {
    const w = new World();
    w.substeps = substeps;
    const b = w.addCircle({ radius: 0.1, x: 0, y: 10 });
    run(w, 1);
    return Math.abs(10 - b.pos.y - 0.5 * G);
}

// relative error of the pendulum period for a given substep count and iteration count
export function pendulumPeriodError(substeps: number, iterations: number): number {
    const L = 1;
    const amp = 0.3;
    const w = new World();
    w.substeps = substeps;
    w.iterations = iterations;
    const hook = w.addCircle({ radius: 0.02, x: 0, y: 5, static: true });
    const bob = w.addCircle({ radius: 0.05, x: L * Math.sin(amp), y: 5 - L * Math.cos(amp), mass: 1 });
    w.addJoint(new DistanceJoint(hook, bob, { length: L, mode: "fixed" }));
    const crossings: number[] = [];
    let prev = amp;
    run(w, 8, (i) => {
        const th = Math.atan2(bob.pos.x, 5 - bob.pos.y);
        if (prev > 0 && th <= 0) crossings.push((i + prev / (prev - th)) * w.fixedDt);
        prev = th;
    });
    const periods = crossings.slice(1).map((c, i) => c - crossings[i]);
    return relError(periods.reduce((a, b) => a + b, 0) / periods.length, pendulumPeriod(L, amp));
}

// mean per-step force reading on m1 in an Atwood machine, for several rope node masses
export function atwoodForceReading(nodeMass: number): { mean: number; theory: number; stretch: number; a: number; aTheory: number } {
    const r = runAtwood(2, 1, nodeMass);
    return {
        mean: r.T,
        theory: (2 * 2 * 1 * G) / 3,
        stretch: r.stretch / r.ropeLength,
        a: r.a,
        aTheory: G / (3 + r.ropeMass),
    };
}

// ---------- dynamometer bookkeeping ----------

// Newton's second law for m1 in the Atwood machine, written with the engine's own force readout:
//   sum(F_constraint * dt) = m * (v_end - v_start) + m * g * T
// If the engine counted an impulse twice (or lost one), the two sides would differ.
export function impulseBalance(nodeMass: number): { impulse: number; momentum: number } {
    const w = new World();
    w.setBounds({ floor: 0 });
    const free = ALL_LAYERS & ~ROPE_LAYER;
    const R = 0.2;
    const rr = 0.03;
    const track = R + rr;
    const c = new Vec2(0, 6);
    w.addCircle({ radius: R, x: c.x, y: c.y, static: true, friction: 0 });
    const A = new Vec2(-track, 4);
    const B = new Vec2(track, 4);
    const m1 = 2;
    const b1 = w.addCircle({ radius: 0.1, x: A.x, y: A.y, mass: m1, mask: free });
    const b2 = w.addCircle({ radius: 0.1, x: B.x, y: B.y, mass: 1, mask: free });
    const rope = new Rope([A, new Vec2(-track, 6), ...arc(c, track, Math.PI, 0), new Vec2(track, 6), B], {
        radius: rr,
        spacing: 0.1,
        nodeMass,
        friction: 0,
    });
    rope.pinStart(b1);
    rope.pinEnd(b2);
    rope.addTo(w);
    const T = 1;
    let impulse = 0;
    run(w, T, () => {
        impulse += b1.constraintForceY * w.fixedDt;
    });
    return { impulse, momentum: m1 * b1.vy + m1 * G * T };
}

// stopping distance of a sliding box for given body / floor friction coefficients
export function slidingDistance(muBody: number, muFloor: number, v0 = 3): number {
    const w = new World();
    w.setBounds({ floor: 0 });
    for (const b of w.bodies) b.friction = muFloor;
    const box = w.addBox({ w: 1, h: 1, x: 0, y: 0.5, mass: 2, friction: muBody, restitution: 0 });
    box.vx = v0;
    run(w, 4);
    return box.pos.x;
}
