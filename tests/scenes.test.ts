import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Vec2 } from "../src/engine/vec2";
import { World } from "../src/engine/world";
import { PinJoint } from "../src/engine/joints";
import { scenes } from "../src/scenes";
import { buildChainRope, buildPulleyRope, DEFAULT_CONNECT } from "../src/sim/connect";
import type { Rope } from "../src/engine/rope";
import { PulleyRope } from "../src/engine/pulleyRope";
import type { Body } from "../src/engine/body";
import { Simulation } from "../src/sim/simulation";
import { LIMITS, parseScene, parseSceneText, sceneFileName, sceneFromData, serializeScene, type SceneFile } from "../src/sim/sceneIO";
import { loadSavedScenes, saveScenes } from "../src/sim/sceneStore";
import { G, relError } from "./experiments";

const view = { x: 0, y: 3, zoom: 100, w: 10, h: 7 };

function copyViaJson(scene: (typeof scenes)[number], seconds: number): { a: World; b: World; data: SceneFile } {
    const a = new World();
    scene.build(a);
    for (let i = 0; i < Math.round(seconds / a.fixedDt); i++) a.stepOnce();
    const data = parseSceneText(JSON.stringify(serializeScene(a, scene.name, scene.view)));
    const b = new World();
    sceneFromData(data).build(b);
    return { a, b, data };
}

const user = (b: World): World["bodies"] => b.bodies.filter((x) => !b.isBoundary(x));

describe("scene files: save and load", () => {
    for (const scene of scenes) {
        test(`${scene.name}: everything is restored (bodies, joints, ropes, settings)`, () => {
            const { a, b } = copyViaJson(scene, 0.5);
            assert.equal(b.bodies.length, a.bodies.length);
            assert.equal(b.joints.length, a.joints.length);
            assert.equal(b.ropes.length, a.ropes.length);
            assert.deepEqual(b.getBounds(), a.getBounds());
            assert.equal(b.gravity.y, a.gravity.y);
            const A = user(a);
            const B = user(b);
            for (let i = 0; i < A.length; i++) {
                assert.ok(A[i].pos.dist(B[i].pos) < 1e-12, `${A[i].name} position`);
                assert.equal(A[i].isStatic, B[i].isStatic);
                assert.equal(A[i].nominalMass, B[i].nominalMass);
            }
        });

        test(`${scene.name}: the restored scene behaves like the original`, () => {
            const { a, b } = copyViaJson(scene, 0.5);
            for (let i = 0; i < 120; i++) {
                a.stepOnce();
                b.stepOnce();
            }
            const A = user(a);
            const B = user(b);
            let worst = 0;
            for (let i = 0; i < A.length; i++) worst = Math.max(worst, A[i].pos.dist(B[i].pos));
            // scenes with many rope nodes and contacts are chaotic; the rest must match closely
            assert.ok(worst < (a.ropes.length > 0 ? 0.15 : 1e-6), `largest difference ${worst} m`);
        });

        test(`${scene.name}: saving twice gives the same file`, () => {
            const { b, data } = copyViaJson(scene, 0);
            assert.deepEqual(serializeScene(b, data.name, data.view), data);
        });
    }

    test("file name is a safe slug", () => {
        assert.equal(sceneFileName("My Atwood!"), "my-atwood.physlab.json");
        assert.equal(sceneFileName("../../etc/passwd"), "etc-passwd.physlab.json");
        assert.equal(sceneFileName("   "), "scene.physlab.json");
    });
});

describe("scene files: invalid input is rejected with a message", () => {
    const base = (): Record<string, unknown> => ({ format: "physlab-scene", version: 1, name: "x", bodies: [], joints: [], ropes: [] });
    const cases: Array<[string, unknown, RegExp]> = [
        ["not an object", 42, /not a PhysLab scene/],
        ["wrong format", { format: "other" }, /not a PhysLab scene/],
        ["wrong version", { ...base(), version: 99 }, /version/],
        ["negative radius", { ...base(), bodies: [{ shape: { type: "circle", r: -1 } }] }, /radius/],
        ["missing shape", { ...base(), bodies: [{}] }, /shape/],
        ["two-vertex polygon", { ...base(), bodies: [{ shape: { type: "polygon", v: [[0, 0], [1, 0]] } }] }, /3 vertices/],
        ["unknown shape", { ...base(), bodies: [{ shape: { type: "blob" } }] }, /unknown shape/],
        ["text as a number", { ...base(), bodies: [{ shape: { type: "circle", r: 1 }, x: "left" }] }, /must be a number/],
        ["joint to a missing body", { ...base(), joints: [{ type: "pin", a: 0, b: 1 }] }, /missing body/],
        ["unknown joint", { ...base(), bodies: [{ shape: { type: "circle", r: 1 } }], joints: [{ type: "magic", a: 0, b: 0 }] }, /unknown joint/],
        ["huge value", { ...base(), bodies: [{ shape: { type: "circle", r: 1 }, mass: 1e30 }] }, /out of range/],
        ["short rope", { ...base(), ropes: [{ restLength: 1, nodes: [[0, 0, 0, 0]] }] }, /at least 2 nodes/],
        [
            "too many bodies",
            { ...base(), bodies: Array.from({ length: LIMITS.bodies + 1 }, () => ({ shape: { type: "circle", r: 1 } })) },
            /too many/,
        ],
    ];
    for (const [name, input, message] of cases) {
        test(name, () => assert.throws(() => parseScene(input), message));
    }

    test("not JSON", () => assert.throws(() => parseSceneText("hello"), /not valid JSON/));

    test("text fields are cleaned: colors that are not colors, long names, control characters", () => {
        const data = parseScene({
            ...base(),
            name: "x".repeat(500) + "\n",
            bodies: [{ name: "a\u0007b", color: "red; background:url(x)", shape: { type: "circle", r: 1 } }],
        });
        assert.equal(data.name.length, 80);
        assert.equal(data.bodies[0].color, "#888888");
        assert.equal(data.bodies[0].name, "a b");
    });

    test("missing optional fields get defaults", () => {
        const data = parseScene({ format: "physlab-scene", version: 1, bodies: [{ shape: { type: "circle", r: 0.5 } }] });
        assert.equal(data.world.gravity[1], -9.81);
        assert.equal(data.bodies[0].friction, 0.4);
        const w = new World();
        sceneFromData(data).build(w);
        assert.equal(w.bodies.length, 1);
    });
});

describe("saved scenes in the browser", () => {
    class FakeStorage {
        data = new Map<string, string>();
        getItem(k: string): string | null {
            return this.data.get(k) ?? null;
        }
        setItem(k: string, v: string): void {
            this.data.set(k, v);
        }
    }

    test("saved scenes come back after a restart", () => {
        const w = new World();
        w.setBounds({ floor: 0 });
        w.addCircle({ radius: 0.3, x: 1, y: 2, mass: 4, name: "Ball" });
        const storage = new FakeStorage() as unknown as Storage;
        assert.ok(saveScenes([serializeScene(w, "Mine", view)], storage));
        const back = loadSavedScenes(storage);
        assert.equal(back.length, 1);
        assert.equal(back[0].name, "Mine");
        assert.equal(back[0].bodies[0].name, "Ball");
    });

    test("a damaged entry is skipped, the others survive", () => {
        const storage = new FakeStorage() as unknown as Storage;
        const good = serializeScene(new World(), "Good", view);
        storage.setItem("physlab.scenes.v1", JSON.stringify([{ format: "physlab-scene", version: 7 }, good, "junk"]));
        assert.deepEqual(loadSavedScenes(storage).map((s) => s.name), ["Good"]);
        storage.setItem("physlab.scenes.v1", "not json");
        assert.deepEqual(loadSavedScenes(storage), []);
    });

    test("blocked or full storage does not break anything", () => {
        const full = { getItem: () => null, setItem: () => { throw new Error("quota"); } } as unknown as Storage;
        assert.equal(saveScenes([], full), false);
        assert.deepEqual(loadSavedScenes(full), []);
        assert.equal(saveScenes([], undefined as unknown as Storage), false);
    });
});

describe("scene list", () => {
    const make = (name: string): ReturnType<typeof sceneFromData> => sceneFromData(serializeScene(new World(), name, view));

    test("add, replace and delete; built-in scenes cannot be deleted", () => {
        const sim = new Simulation(scenes);
        const n = sim.scenes.length;
        const mine = make("Mine");
        sim.addScene(mine);
        assert.equal(sim.scenes.length, n + 1);
        assert.equal(sim.scene, mine); // opened
        const newer = make("Mine v2");
        sim.replaceScene(mine, newer);
        assert.equal(sim.scene, newer);
        assert.equal(sim.scenes.indexOf(newer), n);
        sim.removeScene(scenes[0]); // built-in
        assert.equal(sim.scenes.length, n + 1);
        sim.removeScene(newer);
        assert.equal(sim.scenes.length, n);
        assert.notEqual(sim.scene, newer); // another scene was opened
    });
});

describe("pulley ropes made from the interface", () => {
    const tapAt = (point: Vec2) => ({ body: null, local: point });
    const tapOn = (body: Body, local: Vec2 = Vec2.ZERO) => ({ body, local });

    test("Atwood machine: tap object, empty space above, object; the new pulley is sized so the ropes hang straight", () => {
        const w = new World();
        const a = w.addCircle({ radius: 0.2, x: -0.3, y: 3, mass: 3 });
        const b = w.addCircle({ radius: 0.2, x: 0.3, y: 3, mass: 2 });
        const result = buildPulleyRope(w, [tapOn(a), tapAt(new Vec2(0, 6)), tapOn(b)]);
        assert.ok("joint" in result);
        const wheel = w.bodies.find((x) => x.name === "Pulley")!;
        assert.ok(wheel.isStatic && wheel.mask !== 0, "the new wheel is solid: objects cannot pass through it");
        assert.ok(relError((wheel.shape as { radius: number }).radius, 0.3) < 1e-9);
        const joint = (result as { joint: PulleyRope }).joint;
        const y0 = a.pos.y;
        for (let i = 0; i < 120; i++) w.stepOnce();
        assert.ok(relError(2 * (y0 - a.pos.y), G / 5) < 5e-3);
        assert.ok(relError(joint.tension(), (2 * 3 * 2 * G) / 5) < 1e-3);
    });

    test("an existing wheel is used as it is (no new wheel); order of taps decides the route", () => {
        const w = new World();
        const wheel = w.addCircle({ radius: 0.25, x: 0, y: 6, static: true });
        const a = w.addCircle({ radius: 0.2, x: 0.25, y: 3, mass: 3 });
        const b = w.addCircle({ radius: 0.2, x: -0.25, y: 3, mass: 2 });
        const result = buildPulleyRope(w, [tapOn(a), tapOn(wheel), tapOn(b)]);
        assert.ok("joint" in result);
        assert.equal(w.bodies.filter((x) => x.name === "Pulley").length, 0);
        const y0 = a.pos.y;
        for (let i = 0; i < 120; i++) w.stepOnce();
        assert.ok(relError(2 * (y0 - a.pos.y), G / 5) < 5e-3);
    });

    test("block and tackle with a movable pulley: tap handle, fixed wheel, movable wheel, hook", () => {
        const w = new World();
        const r = 0.25;
        const fixed = w.addCircle({ radius: r, x: r, y: 7, static: true });
        const load = w.addCircle({ radius: r, x: 0, y: 3, mass: 20 });
        const handle = w.addCircle({ radius: 0.1, x: 2 * r, y: 4, mass: 14 });
        // the rope: handle -> over the fixed wheel -> under the load's pulley -> hook above its left side
        const result = buildPulleyRope(w, [tapOn(handle), tapOn(fixed), tapOn(load), tapAt(new Vec2(-r, 7))]);
        assert.ok("joint" in result, JSON.stringify(result));
        const h0 = handle.pos.y;
        const p0 = load.pos.y;
        for (let i = 0; i < 120; i++) w.stepOnce();
        assert.ok(relError((h0 - handle.pos.y) / (load.pos.y - p0), 2) < 5e-3);
        assert.ok(relError(2 * (h0 - handle.pos.y), ((14 - 10) * G) / (14 + 5)) < 1e-2);
    });

    test("a route with several pulleys of both kinds is accepted (the old two-kind tool could not do this)", () => {
        const w = new World();
        const load = w.addBox({ w: 0.6, h: 0.2, x: 0, y: 3, mass: 20 });
        const f1 = w.addCircle({ radius: 0.1, x: 0, y: 6, static: true });
        const f2 = w.addCircle({ radius: 0.1, x: 0.4, y: 6, static: true });
        const handle = w.addCircle({ radius: 0.08, x: 0.5, y: 4, mass: 8 });
        const m1 = w.addCircle({ radius: 0.1, x: -0.2, y: 3, mass: 0.5 }); // wheel on the load's left, a separate body
        const m2 = w.addCircle({ radius: 0.1, x: 0.2, y: 3, mass: 0.5 });
        w.addJoint(new PinJoint(load, m1, { localA: new Vec2(-0.2, 0) }));
        w.addJoint(new PinJoint(load, m2, { localA: new Vec2(0.2, 0) }));
        const result = buildPulleyRope(w, [tapAt(new Vec2(-0.3, 6.5)), tapOn(m1), tapOn(f1), tapOn(m2), tapOn(f2), tapOn(handle)]);
        assert.ok("joint" in result, JSON.stringify(result));
        for (let i = 0; i < 120; i++) w.stepOnce();
        assert.ok(handle.pos.y < 4 && load.pos.y > 3, "the handle goes down, the load goes up");
        assert.ok(Number.isFinite(handle.pos.y));
    });

    test("mistakes give a message and change nothing", () => {
        const w = new World();
        const hook = w.addCircle({ radius: 0.1, x: 0, y: 5, static: true });
        const a = w.addCircle({ radius: 0.2, x: 1, y: 3, mass: 1 });
        const count = w.bodies.length;
        const cases: Array<[string, Parameters<typeof buildPulleyRope>[1], RegExp]> = [
            ["one point", [tapOn(a)], /two points/],
            ["nothing can move", [tapOn(hook), tapAt(new Vec2(1, 6)), tapAt(new Vec2(2, 5))], /can move/],
            ["same point twice", [tapOn(a), tapOn(a)], /same point/],
        ];
        for (const [name, taps, message] of cases) {
            const result = buildPulleyRope(w, taps);
            assert.ok("error" in result && message.test(result.error), `${name}: ${JSON.stringify(result)}`);
        }
        assert.equal(w.bodies.length, count, "no decoration was left behind");
        assert.equal(w.joints.length, 0);
    });

    test("through the Simulation: taps, Done opens the rope; Cancel forgets the taps", () => {
        const sim = new Simulation(scenes);
        sim.loadScene(sim.scenes[0]);
        sim.world = new World();
        const a = sim.world.addCircle({ radius: 0.2, x: -0.3, y: 3, mass: 2 });
        const b = sim.world.addCircle({ radius: 0.2, x: 0.3, y: 3, mass: 1 });
        sim.connectOptions.kind = "pulley";
        sim.setMode("connect");
        assert.match(sim.modeHint(), /first end/);
        sim.connectTaps.push(tapOn(a));
        assert.ok(sim.routeActive);
        assert.match(sim.modeHint(), /pulley the rope goes around, or the other end/);
        sim.finishRoute(); // too early
        assert.match(sim.modeHint(), /two points/);
        sim.connectTaps.push(tapAt(new Vec2(0, 6)), tapOn(b));
        assert.match((sim.routeMessage = "", sim.modeHint()), /3 points/);
        sim.finishRoute();
        assert.equal(sim.mode, "none");
        assert.ok(sim.selectedJoint instanceof PulleyRope);
        sim.setMode("connect");
        sim.connectTaps.push(tapOn(a));
        sim.cancelRoute();
        assert.equal(sim.connectTaps.length, 0);
        assert.equal(sim.routeActive, false);
    });

    test("pulley ropes survive saving a scene and behave the same afterwards", () => {
        const w = new World();
        const a = w.addCircle({ radius: 0.2, x: -0.3, y: 3, mass: 3 });
        const b = w.addCircle({ radius: 0.2, x: 0.3, y: 3, mass: 2 });
        buildPulleyRope(w, [tapOn(a), tapAt(new Vec2(0, 6)), tapOn(b)]);
        const copy = new World();
        sceneFromData(parseSceneText(JSON.stringify(serializeScene(w, "p", view)))).build(copy);
        const rope = copy.joints.find((j): j is PulleyRope => j instanceof PulleyRope)!;
        assert.ok(rope);
        assert.equal(rope.route.length, 3);
        const [ca] = copy.bodies.filter((x) => !x.isStatic);
        const y0 = ca.pos.y;
        for (let i = 0; i < 120; i++) copy.stepOnce();
        assert.ok(relError(2 * (y0 - ca.pos.y), G / 5) < 5e-3);
    });

    test("a broken route in a file is rejected", () => {
        const route = (r: unknown): unknown => ({
            format: "physlab-scene",
            version: 1,
            bodies: [{ shape: { type: "circle", r: 1 } }],
            joints: [{ type: "route", a: 0, b: 0, length: 3, route: r }],
        });
        assert.throws(() => parseScene(route([{ body: 0 }])), /at least 2/);
        assert.throws(() => parseScene(route([{ body: 0 }, { body: 5 }])), /missing body/);
        assert.throws(() => parseScene(route([{ body: 0, radius: -1 }, { body: 0 }])), /out of range/);
    });
});

describe("rope laid along a route", () => {
    const tapAt = (x: number, y: number) => ({ body: null, local: new Vec2(x, y) });
    const tapOn = (body: Body) => ({ body, local: Vec2.ZERO });

    test("three points: the rope follows the tapped path, its ends are tied to the first and the last", () => {
        const w = new World();
        const a = w.addCircle({ radius: 0.2, x: 0, y: 3, mass: 1 });
        const result = buildChainRope(w, [tapOn(a), tapAt(2, 3), tapAt(2, 1)], { ...DEFAULT_CONNECT, ropeRadius: 0.04 });
        assert.ok("rope" in result);
        const rope = (result as { rope: Rope }).rope;
        assert.ok(relError(rope.restLength, 4) < 0.02, `length ${rope.restLength}`); // 2 m across + 2 m down
        const corner = rope.nodes.reduce((best, n) => (n.pos.dist(new Vec2(2, 3)) < best.pos.dist(new Vec2(2, 3)) ? n : best));
        assert.ok(corner.pos.dist(new Vec2(2, 3)) < 0.1, "the rope passes the middle point");
        assert.deepEqual(rope.pins.map((p) => p.end), ["start", "end"]);
        assert.equal(rope.pins[0].body, a);
        assert.ok(w.bodies.some((b) => b.name === "Anchor"), "an end in empty space is tied to a new anchor");
    });

    test("two points keep the slack setting", () => {
        const w = new World();
        const a = w.addCircle({ radius: 0.2, x: 0, y: 3, mass: 1 });
        const b = w.addCircle({ radius: 0.2, x: 3, y: 3, mass: 1 });
        const result = buildChainRope(w, [tapOn(a), tapOn(b)], { ...DEFAULT_CONNECT, ropeLengthFactor: 1.5 });
        assert.ok("rope" in result);
        assert.ok(relError((result as { rope: Rope }).rope.restLength, 4.5) < 0.05);
    });

    test("mistakes give a message and change nothing", () => {
        const w = new World();
        const n = w.bodies.length;
        let r = buildChainRope(w, [tapAt(0, 0)], DEFAULT_CONNECT);
        assert.ok("error" in r && /two points/.test(r.error));
        r = buildChainRope(w, [tapAt(0, 0), tapAt(0.01, 0)], DEFAULT_CONNECT);
        assert.ok("error" in r && /too short/.test(r.error));
        r = buildChainRope(w, [tapAt(0, 0), tapAt(5000, 0)], DEFAULT_CONNECT);
        assert.ok("error" in r && /too long/.test(r.error));
        assert.equal(w.bodies.length, n);
        assert.equal(w.ropes.length, 0);
    });

    test("through the Simulation: points, then the same point again finishes; Done works too", () => {
        const sim = new Simulation(scenes);
        sim.world = new World();
        const a = sim.world.addCircle({ radius: 0.2, x: 0, y: 3, mass: 1 });
        sim.connectOptions.kind = "rope";
        sim.setMode("connect");
        assert.match(sim.modeHint(), /first end/);
        sim.addRoutePoint(a, Vec2.ZERO);
        sim.addRoutePoint(null, new Vec2(2, 3));
        sim.addRoutePoint(null, new Vec2(2, 1));
        assert.match(sim.modeHint(), /3 points/);
        sim.addRoutePoint(null, new Vec2(2, 1)); // tap the last point again
        assert.equal(sim.mode, "none");
        assert.equal(sim.world.ropes.length, 1);
        assert.equal(sim.selectedRope, sim.world.ropes[0]);

        sim.setMode("connect");
        sim.addRoutePoint(null, new Vec2(5, 3));
        sim.addRoutePoint(null, new Vec2(5, 3)); // a repeat of the only point does nothing
        assert.equal(sim.connectTaps.length, 1);
        sim.addRoutePoint(null, new Vec2(7, 3));
        sim.finishRoute(); // Done
        assert.equal(sim.world.ropes.length, 2);
    });
});
