import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Vec2 } from "../src/engine/vec2";
import { World } from "../src/engine/world";
import { PulleyJoint } from "../src/engine/joints";
import { Recorder, CHANNELS } from "../src/sim/recorder";
import { Ruler } from "../src/sim/ruler";
import { Stopwatch } from "../src/sim/stopwatch";
import { G, relError } from "./experiments";
import { Simulation } from "../src/sim/simulation";
import { scenes } from "../src/scenes";

function runWithRecorder(world: World, rec: Recorder, seconds: number): void {
    world.stepListeners.push((w) => rec.sample(w, null));
    for (let i = 0; i < Math.round(seconds / world.fixedDt); i++) world.stepOnce();
}

describe("stopwatch", () => {
    test("measures only while running; laps and reset", () => {
        const s = new Stopwatch();
        assert.equal(s.elapsed(5), 0);
        s.start(1);
        assert.equal(s.elapsed(3.5), 2.5);
        s.lap(3.5);
        s.stop(4);
        assert.equal(s.elapsed(10), 3); // stopped: does not advance
        s.start(10);
        assert.equal(s.elapsed(11), 4); // resumes, adds up
        assert.deepEqual(s.laps, [2.5]);
        s.reset();
        assert.equal(s.elapsed(20), 0);
        assert.equal(s.laps.length, 0);
    });
});

describe("ruler", () => {
    test("length, components and angle between two points", () => {
        const r = new Ruler();
        assert.equal(r.length(), null);
        r.tap({ body: null, local: new Vec2(1, 1) });
        assert.equal(r.length(), null); // one end only
        r.tap({ body: null, local: new Vec2(4, 5) });
        assert.equal(r.length(), 5);
        assert.ok(Math.abs((r.angleDeg() ?? 0) - 53.130102) < 1e-5);
        r.tap({ body: null, local: new Vec2(0, 0) }); // third tap starts over
        assert.equal(r.complete, false);
    });

    test("an end attached to a body follows it", () => {
        const w = new World();
        w.gravity = new Vec2(0, 0);
        const a = w.addCircle({ radius: 0.1, x: 0, y: 0 });
        const b = w.addCircle({ radius: 0.1, x: 3, y: 0 });
        b.vx = 2;
        const r = new Ruler();
        r.tap({ body: a, local: Vec2.ZERO });
        r.tap({ body: b, local: Vec2.ZERO });
        for (let i = 0; i < 120; i++) w.stepOnce(); // 1 s
        assert.ok(relError(r.length()!, 5) < 1e-6, `length ${r.length()}`);
    });
});

describe("recorder", () => {
    test("free fall: path length, speed, energy and sampling rate", () => {
        const w = new World();
        const b = w.addCircle({ radius: 0.1, x: 0, y: 10, mass: 2 });
        const rec = new Recorder();
        rec.setTarget(b);
        runWithRecorder(w, rec, 1);
        const s = rec.last!;
        assert.ok(relError(s.dist, 0.5 * G) < 5e-3, `distance ${s.dist}`);
        assert.ok(relError(s.disp, s.dist) < 1e-9);
        assert.ok(relError(s.speed, G) < 2e-3, `speed ${s.speed}`);
        assert.ok(relError(s.acc, G) < 1e-6);
        assert.ok(relError(s.t, 1) < 0.02, `time ${s.t}`);
        // total mechanical energy is conserved in free fall (first-order error of the integrator)
        const e0 = rec.samples[0].e;
        assert.ok(Math.abs(s.e - e0) / (0.5 * 2 * G * G) < 5e-3);
        assert.ok(Math.abs(rec.samples.length - 60) <= 1, `samples ${rec.samples.length}`);
    });

    test("force channel is the dynamometer reading (N = m g for a resting block)", () => {
        const w = new World();
        w.setBounds({ floor: 0 });
        const b = w.addBox({ w: 1, h: 1, x: 0, y: 0.5, mass: 5 });
        const rec = new Recorder();
        rec.setTarget(b);
        runWithRecorder(w, rec, 2);
        assert.ok(relError(rec.last!.force, 5 * G) < 1e-3, `force ${rec.last!.force}`);
        assert.ok(rec.last!.dist < 1e-3);
    });

    test("pause, retarget and removal", () => {
        const w = new World();
        const a = w.addCircle({ radius: 0.1, x: 0, y: 10 });
        const b = w.addCircle({ radius: 0.1, x: 1, y: 10 });
        const rec = new Recorder();
        rec.setTarget(a);
        runWithRecorder(w, rec, 0.5);
        const n = rec.samples.length;
        rec.recording = false;
        for (let i = 0; i < 60; i++) w.stepOnce();
        assert.equal(rec.samples.length, n); // paused recording adds nothing
        rec.setTarget(b); // a new body starts a new recording
        assert.equal(rec.samples.length, 0);
        rec.recording = true;
        for (let i = 0; i < 12; i++) w.stepOnce();
        assert.ok(rec.samples.length > 0);
        w.removeBody(b);
        w.stepOnce();
        assert.equal(rec.body, null);
    });

    test("CSV export: header with units, one row per sample, same number of columns", () => {
        const w = new World();
        const b = w.addCircle({ radius: 0.1, x: 0, y: 10 });
        const rec = new Recorder();
        rec.setTarget(b);
        runWithRecorder(w, rec, 0.5);
        const lines = rec.toCsv().trim().split("\n");
        assert.equal(lines.length, rec.samples.length + 1);
        assert.ok(lines[0].startsWith("t [s],x [m]"));
        for (const line of lines) assert.equal(line.split(",").length, CHANNELS.length);
    });
});

describe("PulleyJoint (ideal rope)", () => {
    test("a slack rope carries no force; the bodies fall freely until it is taut", () => {
        const w = new World();
        const a = w.addCircle({ radius: 0.1, x: -0.25, y: 10, mass: 1 });
        const b = w.addCircle({ radius: 0.1, x: 0.25, y: 10, mass: 1 });
        const rope = w.addJoint(
            new PulleyJoint(a, b, { groundA: new Vec2(-0.25, 12), groundB: new Vec2(0.25, 12), length: 8 })
        );
        for (let i = 0; i < 12; i++) w.stepOnce(); // 0.1 s, the rope is 4 m longer than the distance
        assert.equal(rope.tension(), 0);
        assert.ok(relError(a.vy, -G * 0.1) < 1e-3);
    });

    test("equal masses balance: no motion, tension = m g", () => {
        const w = new World();
        const a = w.addCircle({ radius: 0.1, x: -0.25, y: 4, mass: 2 });
        const b = w.addCircle({ radius: 0.1, x: 0.25, y: 4, mass: 2 });
        const rope = w.addJoint(new PulleyJoint(a, b, { groundA: new Vec2(-0.25, 6), groundB: new Vec2(0.25, 6) }));
        for (let i = 0; i < 240; i++) w.stepOnce();
        assert.ok(Math.abs(a.vy) < 1e-6);
        assert.ok(relError(rope.tension(), 2 * G) < 1e-6);
    });
});

describe("ruler mode", () => {
  test("after the second point the mode goes back to None and the reading stays", () => {
    const sim = new Simulation(scenes);
    sim.setMode("measure");
    sim.ruler.tap({ body: null, local: new Vec2(0, 0) });
    sim.ruler.tap({ body: null, local: new Vec2(3, 4) });
    // what ViewControls does after a tap
    if (sim.ruler.complete) sim.setMode("none");
    assert.equal(sim.mode, "none");
    assert.equal(sim.ruler.length(), 5);
  });
});
