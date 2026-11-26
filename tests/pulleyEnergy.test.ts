import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Vec2 } from "../src/engine/vec2";
import { World } from "../src/engine/world";
import { buildPulleyRope } from "../src/sim/connect";
import type { PulleyRope } from "../src/engine/pulleyRope";
import { G } from "./experiments";

// An ideal rope must never add energy: a frictionless system can only keep its mechanical energy or lose some
// (in inelastic contacts). These tests build random pulley systems the way a user does, with the rope tool,
// let them run into every kind of trouble (masses hitting the wheel, swinging round it, blocks meeting,
// passing through solid parts) and check that the total energy never goes above where it started.

function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const energy = (w: World): number =>
    w.bodies.filter((b) => !b.isStatic).reduce((e, b) => e + 0.5 * b.mass * (b.vx ** 2 + b.vy ** 2) + 0.5 * b.inertia * b.angVel ** 2 + b.mass * G * b.pos.y, 0);

const tap = (b: ConstructorParameters<typeof Object>[0] & { toWorld: unknown }, local = Vec2.ZERO) => ({ body: b as never, local });
const at = (x: number, y: number) => ({ body: null, local: new Vec2(x, y) });

type Kind = "atwood" | "tackle" | "multi";

function build(seed: number, kind: Kind): World {
    const R = rng(seed);
    const u = (a: number, b: number): number => a + (b - a) * R();
    const w = new World();
    if (R() < 0.6) w.setBounds({ floor: 0 });
    let result: ReturnType<typeof buildPulleyRope>;
    if (kind === "atwood") {
        const wy = u(5, 8);
        const wx = u(-1, 1);
        const a = w.addCircle({ radius: u(0.1, 0.3), x: wx - u(0.2, 1), y: u(1, wy - 2), mass: u(0.5, 20), restitution: u(0, 0.5) });
        const b = w.addCircle({ radius: u(0.1, 0.3), x: wx + u(0.2, 1), y: u(1, wy - 2), mass: u(0.5, 20), restitution: u(0, 0.5) });
        result = buildPulleyRope(w, [tap(a as never), at(wx, wy), tap(b as never)]);
    } else if (kind === "tackle") {
        const r = u(0.12, 0.3);
        const fx = u(-1, 1);
        const fy = u(6, 8);
        const fixed = w.addCircle({ radius: r, x: fx, y: fy, static: true });
        const load = w.addCircle({ radius: u(0.1, 0.3), x: fx - 2 * r - u(0, 0.5), y: u(2, 4.5), mass: u(2, 40), restitution: 0 });
        const handle = w.addCircle({ radius: u(0.08, 0.2), x: fx + r, y: u(2, 5), mass: u(2, 40), restitution: 0 });
        result = buildPulleyRope(w, [tap(handle as never), tap(fixed as never), tap(load as never), at(load.pos.x - 0.1, fy)]);
    } else {
        const f1 = w.addCircle({ radius: u(0.1, 0.25), x: -0.6, y: 7, static: true });
        const f2 = w.addCircle({ radius: u(0.1, 0.25), x: 0.6, y: 7, static: true });
        const mv = w.addCircle({ radius: u(0.1, 0.25), x: u(-0.2, 0.2), y: u(3, 5), mass: u(1, 15), restitution: 0 });
        const h = w.addCircle({ radius: 0.15, x: -0.8, y: u(2, 4), mass: u(1, 15), restitution: 0 });
        const m = w.addCircle({ radius: 0.15, x: 0.8, y: u(2, 4), mass: u(1, 15), restitution: 0 });
        result = buildPulleyRope(w, [tap(h as never), tap(f1 as never), tap(mv as never), tap(f2 as never), tap(m as never)]);
    }
    assert.ok("joint" in result, "the route must be accepted");
    return w;
}

// the largest amount of energy the system has gained since the start, as a share of m g * 5 m
function worstGain(w: World, seconds: number): number {
    const scale = w.bodies.filter((b) => !b.isStatic).reduce((s, b) => s + b.mass * G * 5, 0);
    const e0 = energy(w);
    let gain = -Infinity;
    for (let i = 0; i < Math.round(seconds / w.fixedDt); i++) {
        w.stepOnce();
        const e = energy(w);
        assert.ok(Number.isFinite(e), `the simulation blew up at t = ${w.time.toFixed(2)} s`);
        gain = Math.max(gain, e - e0);
    }
    return gain / scale;
}

describe("an ideal rope never adds energy", () => {
    // 17 and 20 were the seeds that exposed the problem (a mass slid round the wheel and the rope length jumped)
    const seeds: Array<[Kind, number]> = [
        ["atwood", 17],
        ["atwood", 3],
        ["atwood", 9],
        ["tackle", 20],
        ["tackle", 36],
        ["tackle", 5],
        ["multi", 3],
        ["multi", 11],
    ];
    for (const [kind, seed] of seeds) {
        test(`${kind}, seed ${seed}: solid parts`, () => {
            assert.ok(worstGain(build(seed, kind), 6) < 0.01);
        });
    }
    for (const [kind, seed] of seeds.filter((s) => s[1] % 2 === 1)) {
        test(`${kind}, seed ${seed}: nothing collides (bodies pass through the wheels)`, () => {
            const w = build(seed, kind);
            for (const b of w.bodies) if (!w.isBoundary(b)) b.mask = 0;
            assert.ok(worstGain(w, 6) < 0.02);
        });
    }

    test("the load runs into the fixed pulley (blocks jam) and the system stays sane", () => {
        const w = new World();
        const r = 0.25;
        const fixed = w.addCircle({ radius: r, x: r, y: 7, static: true, mask: 0 });
        const load = w.addCircle({ radius: r, x: 0, y: 3, mass: 20, mask: 0 });
        const handle = w.addCircle({ radius: 0.1, x: 2 * r, y: 4, mass: 14, mask: 0 });
        const result = buildPulleyRope(w, [tap(handle as never), tap(fixed as never), tap(load as never), at(-r, 7)]);
        assert.ok("joint" in result);
        assert.ok(worstGain(w, 12) < 0.01);
    });

    test("a mass that swings round the wheel: the rope lets go instead of throwing the bodies about", () => {
        const w = new World();
        const a = w.addCircle({ radius: 0.13, x: -0.21, y: 2.96, mass: 6, restitution: 0.1 });
        const b = w.addCircle({ radius: 0.15, x: 0.81, y: 3.05, mass: 6.4, restitution: 0.1 });
        const result = buildPulleyRope(w, [tap(a as never), at(0.06, 5.58), tap(b as never)]);
        assert.ok("joint" in result);
        assert.ok(worstGain(w, 8) < 0.01);
        const rope = (result as { joint: PulleyRope }).joint;
        assert.ok(Number.isFinite(rope.tension()));
    });

    test("points that are too close for the wheel between them are refused", () => {
        const w = new World();
        const m = w.addCircle({ radius: 0.15, x: 1.5, y: 4, mass: 2 });
        // the hook (0, 7) would lie inside the wheel (0, 6.5), which is sized to its neighbours
        const result = buildPulleyRope(w, [at(0, 7), at(0, 6.5), tap(m as never)]);
        assert.ok("error" in result && /too close/.test(result.error));
        assert.equal(w.bodies.length, 1);
    });
});
