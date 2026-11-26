import { Vec2 } from "../engine/vec2";
import { Body } from "../engine/body";
import { World } from "../engine/world";
import { Rope } from "../engine/rope";
import { DistanceJoint, PinJoint, PulleyJoint, SpringJoint, type Joint } from "../engine/joints";
import { PulleyRope } from "../engine/pulleyRope";
import type { Shape } from "../engine/shapes";
import type { Scene } from "../scenes/scene";

// Saving and loading scenes as JSON (a .json file, or the browser's local storage).
//
// A scene file holds the world settings, every body, joint and rope with its position and velocity, and
// the camera. Floor / wall planes are stored as bounds; the nodes of a rope are stored with the rope.
// Files may come from anywhere, so loading checks every field and limits the size.

export const SCENE_FORMAT = "physlab-scene";
export const SCENE_VERSION = 1;

type V2 = [number, number];
// a body in the file's body list, or a node of a rope: [rope index, node index]
type Ref = number | [number, number];

export type ShapeData =
    | { type: "circle"; r: number }
    | { type: "polygon"; v: V2[] }
    | { type: "plane"; n: V2; offset: number };

export interface BodyData {
    name: string;
    shape: ShapeData;
    x: number;
    y: number;
    angle: number;
    vx: number;
    vy: number;
    w: number; // angular velocity
    mass: number;
    static: boolean;
    restitution: number;
    friction: number;
    linearDamping: number;
    angularDamping: number;
    color: string;
    category: number;
    mask: number;
    z: number;
    visible: boolean;
    ignore: number[]; // bodies it never collides with
}

interface JointBase {
    name: string;
    color: string;
    lineWidth: number;
    a: Ref;
    b: Ref;
    localA: V2;
    localB: V2;
}

export type JointData =
    | (JointBase & { type: "distance"; length: number; mode: "fixed" | "max" | "min" })
    | (JointBase & { type: "spring"; restLength: number; stiffness: number; damping: number })
    | (JointBase & { type: "pin" })
    | (JointBase & { type: "pulley"; groundA: V2 | number; groundB: V2 | number; ratio: number; length: number })
    | (JointBase & { type: "route"; length: number; route: Array<{ body: number; local: V2; radius: number; wrap: number }> });

export interface RopeData {
    name: string;
    radius: number;
    nodeMass: number;
    friction: number;
    damping: number;
    color: string;
    restLength: number;
    nodes: Array<[number, number, number, number]>; // x, y, vx, vy
    pins: Array<{ end: "start" | "end"; body: number; local: V2 }>;
}

export interface SceneFile {
    format: typeof SCENE_FORMAT;
    version: typeof SCENE_VERSION;
    name: string;
    view: { x: number; y: number; zoom: number; w: number; h: number };
    world: {
        gravity: V2;
        bounds: { floor?: number; ceiling?: number; left?: number; right?: number };
        fixedDt: number;
        substeps: number;
        iterations: number;
        relaxIterations: number;
        positionIterations: number;
    };
    bodies: BodyData[];
    ropes: RopeData[];
    joints: JointData[];
}

export const LIMITS = { bodies: 1000, joints: 2000, ropes: 100, ropeNodes: 5000, vertices: 64, fileBytes: 5_000_000 };

// ---------------------------------------------------------------------------------------------
// world -> file

const v2 = (v: Vec2): V2 => [v.x, v.y];

export function serializeScene(world: World, name: string, view: SceneFile["view"]): SceneFile {
    const ropeOf = new Map<Body, [number, number]>();
    world.ropes.forEach((r, ri) => r.nodes.forEach((n, ni) => ropeOf.set(n, [ri, ni])));
    const listed = world.bodies.filter((b) => !world.isBoundary(b) && !ropeOf.has(b));
    const index = new Map<Body, number>(listed.map((b, i) => [b, i]));
    const ref = (b: Body): Ref | null => index.get(b) ?? ropeOf.get(b) ?? null;

    const bodies: BodyData[] = listed.map((b) => ({
        name: b.name,
        shape: shapeData(b.shape),
        x: b.pos.x,
        y: b.pos.y,
        angle: b.angle,
        vx: b.vx,
        vy: b.vy,
        w: b.angVel,
        mass: b.nominalMass,
        static: b.isStatic,
        restitution: b.restitution,
        friction: b.friction,
        linearDamping: b.linearDamping,
        angularDamping: b.angularDamping,
        color: b.color,
        category: b.category,
        mask: b.mask,
        z: b.z,
        visible: b.visible,
        ignore: b.ignoredBodies.map((o) => index.get(o)).filter((i): i is number => i !== undefined),
    }));

    const ropes: RopeData[] = world.ropes.map((r) => ({
        name: r.name,
        radius: r.radius,
        nodeMass: r.nodeMass,
        friction: r.friction,
        damping: r.damping,
        color: r.nodes[0].color,
        restLength: r.restLength,
        nodes: r.nodes.map((n) => [n.pos.x, n.pos.y, n.vx, n.vy]),
        pins: r.pins.flatMap((p) => {
            const i = index.get(p.body);
            return i === undefined ? [] : [{ end: p.end, body: i, local: v2(p.local) }];
        }),
    }));

    const joints: JointData[] = [];
    for (const j of world.joints) {
        const data = jointData(j, ref, index);
        if (data) joints.push(data);
    }

    return {
        format: SCENE_FORMAT,
        version: SCENE_VERSION,
        name,
        view: { ...view },
        world: {
            gravity: v2(world.gravity),
            bounds: world.getBounds(),
            fixedDt: world.fixedDt,
            substeps: world.substeps,
            iterations: world.iterations,
            relaxIterations: world.relaxIterations,
            positionIterations: world.positionIterations,
        },
        bodies,
        ropes,
        joints,
    };
}

function shapeData(s: Shape): ShapeData {
    if (s.type === "circle") return { type: "circle", r: s.radius };
    if (s.type === "polygon") return { type: "polygon", v: s.vertices.map(v2) };
    return { type: "plane", n: v2(s.normal), offset: s.offset };
}

function jointData(j: Joint, ref: (b: Body) => Ref | null, index: Map<Body, number>): JointData | null {
    if (!j.listed) return null; // rope internals and the mouse grab
    const [a, b] = j.connects();
    const ra = ref(a);
    const rb = ref(b);
    if (ra === null || rb === null) return null;
    const [la, lb] = j.localAnchors;
    const base = { name: j.name, color: j.color, lineWidth: j.lineWidth, a: ra, b: rb, localA: v2(la), localB: v2(lb) };
    if (j instanceof DistanceJoint) return { ...base, type: "distance", length: j.length, mode: j.mode };
    if (j instanceof SpringJoint) return { ...base, type: "spring", restLength: j.restLength, stiffness: j.stiffness, damping: j.damping };
    if (j instanceof PulleyJoint) {
        const ground = (g: Vec2 | Body): V2 | number | null => ("pos" in g ? (index.get(g) ?? null) : v2(g));
        const gA = ground(j.groundA);
        const gB = ground(j.groundB);
        if (gA === null || gB === null) return null;
        return { ...base, type: "pulley", groundA: gA, groundB: gB, ratio: j.ratio, length: j.length };
    }
    if (j instanceof PulleyRope) {
        const route = j.route.map((e) => ({ body: index.get(e.body), local: v2(e.local), radius: e.radius, wrap: e.wrap }));
        if (route.some((e) => e.body === undefined)) return null; // a rope node in the route cannot be saved
        return { ...base, type: "route", length: j.length, route: route as Array<{ body: number; local: V2; radius: number; wrap: number }> };
    }
    if (j.constructor === PinJoint) return { ...base, type: "pin" };
    return null;
}

// ---------------------------------------------------------------------------------------------
// file -> checked data

class SceneError extends Error {}
const fail = (message: string): never => {
    throw new SceneError(message);
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function num(v: unknown, what: string, min = -1e6, max = 1e6, fallback?: number): number {
    if (v === undefined && fallback !== undefined) return fallback;
    if (typeof v !== "number" || !Number.isFinite(v)) return fail(`${what} must be a number`);
    if (v < min || v > max) return fail(`${what} is out of range`);
    return v;
}

function vec(v: unknown, what: string, fallback?: V2): V2 {
    if (v === undefined && fallback) return fallback;
    if (!Array.isArray(v) || v.length !== 2) return fail(`${what} must be [x, y]`);
    return [num(v[0], `${what}[0]`), num(v[1], `${what}[1]`)];
}

function text(v: unknown, fallback: string): string {
    // eslint-disable-next-line no-control-regex
    return typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80) || fallback : fallback;
}

function color(v: unknown, fallback: string): string {
    return typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
    return typeof v === "boolean" ? v : fallback;
}

function list(v: unknown, what: string, max: number): unknown[] {
    if (v === undefined) return [];
    if (!Array.isArray(v)) return fail(`${what} must be a list`);
    if (v.length > max) return fail(`${what}: too many entries (limit ${max})`);
    return v;
}

function parseShape(v: unknown): ShapeData {
    if (!isObject(v)) return fail("body shape is missing");
    if (v.type === "circle") return { type: "circle", r: num(v.r, "circle radius", 0.001, 1000) };
    if (v.type === "polygon") {
        const pts = list(v.v, "polygon vertices", LIMITS.vertices).map((p) => vec(p, "vertex"));
        if (pts.length < 3) return fail("a polygon needs at least 3 vertices");
        return { type: "polygon", v: pts };
    }
    if (v.type === "plane") {
        const n = vec(v.n, "plane normal");
        if (Math.hypot(n[0], n[1]) < 1e-6) return fail("plane normal is zero");
        return { type: "plane", n, offset: num(v.offset, "plane offset") };
    }
    return fail(`unknown shape "${String(v.type)}"`);
}

const parseRef = (v: unknown, what: string): Ref => {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
    if (Array.isArray(v) && v.length === 2 && v.every((x) => Number.isInteger(x) && x >= 0)) return [v[0] as number, v[1] as number];
    return fail(`${what} is not a valid reference`);
};

// Checks an untrusted value and returns clean scene data; throws an Error with a readable message.
export function parseScene(input: unknown): SceneFile {
    if (!isObject(input) || input.format !== SCENE_FORMAT) return fail("This is not a PhysLab scene file");
    if (input.version !== SCENE_VERSION) return fail(`Unsupported scene version ${String(input.version)}`);
    const w = isObject(input.world) ? input.world : {};
    const view = isObject(input.view) ? input.view : {};
    const b = isObject(w.bounds) ? w.bounds : {};
    const bound = (k: string): number | undefined => (b[k] === undefined || b[k] === null ? undefined : num(b[k], `bound ${k}`));

    const bodies: BodyData[] = list(input.bodies, "bodies", LIMITS.bodies).map((raw, i) => {
        if (!isObject(raw)) return fail(`body ${i} is not an object`);
        return {
            name: text(raw.name, `Body ${i + 1}`),
            shape: parseShape(raw.shape),
            x: num(raw.x, "x", -1e5, 1e5, 0),
            y: num(raw.y, "y", -1e5, 1e5, 0),
            angle: num(raw.angle, "angle", -1e4, 1e4, 0),
            vx: num(raw.vx, "vx", -1e4, 1e4, 0),
            vy: num(raw.vy, "vy", -1e4, 1e4, 0),
            w: num(raw.w, "angular velocity", -1e4, 1e4, 0),
            mass: num(raw.mass, "mass", 0, 1e9, 1),
            static: bool(raw.static, false),
            restitution: num(raw.restitution, "restitution", 0, 1, 0.2),
            friction: num(raw.friction, "friction", 0, 100, 0.4),
            linearDamping: num(raw.linearDamping, "linear damping", 0, 1000, 0),
            angularDamping: num(raw.angularDamping, "angular damping", 0, 1000, 0),
            color: color(raw.color, "#888888"),
            category: num(raw.category, "category", -2147483648, 4294967295, 1),
            mask: num(raw.mask, "mask", -2147483648, 4294967295, 0xffffffff),
            z: num(raw.z, "z", -1000, 1000, 0),
            visible: bool(raw.visible, true),
            ignore: list(raw.ignore, "ignore", LIMITS.bodies).map((r) => {
                const ref = parseRef(r, "ignored body");
                return typeof ref === "number" ? ref : fail("ignored body must be a body");
            }),
        };
    });

    let nodeTotal = 0;
    const ropes: RopeData[] = list(input.ropes, "ropes", LIMITS.ropes).map((raw, i) => {
        if (!isObject(raw)) return fail(`rope ${i} is not an object`);
        const nodes = list(raw.nodes, "rope nodes", LIMITS.ropeNodes).map((n) => {
            if (!Array.isArray(n) || n.length !== 4) return fail("a rope node must be [x, y, vx, vy]");
            return [num(n[0], "node x"), num(n[1], "node y"), num(n[2], "node vx", -1e4, 1e4), num(n[3], "node vy", -1e4, 1e4)] as [number, number, number, number];
        });
        if (nodes.length < 2) return fail("a rope needs at least 2 nodes");
        nodeTotal += nodes.length;
        if (nodeTotal > LIMITS.ropeNodes) return fail(`too many rope nodes (limit ${LIMITS.ropeNodes})`);
        return {
            name: text(raw.name, `Rope ${i + 1}`),
            radius: num(raw.radius, "rope radius", 0.001, 10, 0.03),
            nodeMass: num(raw.nodeMass, "rope node mass", 1e-6, 1e6, 0.1),
            friction: num(raw.friction, "rope friction", 0, 100, 0.02),
            damping: num(raw.damping, "rope damping", 0, 1000, 50),
            color: color(raw.color, "#c9a227"),
            restLength: num(raw.restLength, "rope length", 0.001, 1e5),
            nodes,
            pins: list(raw.pins, "rope pins", 2).map((p) => {
                if (!isObject(p) || (p.end !== "start" && p.end !== "end")) return fail("invalid rope pin");
                const body = parseRef(p.body, "rope pin");
                if (typeof body !== "number") return fail("a rope can only be pinned to a body");
                return { end: p.end, body, local: vec(p.local, "pin point", [0, 0]) };
            }),
        };
    });

    const joints: JointData[] = list(input.joints, "joints", LIMITS.joints).map((raw, i) => {
        if (!isObject(raw)) return fail(`joint ${i} is not an object`);
        const base = {
            name: text(raw.name, `Joint ${i + 1}`),
            color: color(raw.color, "#888888"),
            lineWidth: num(raw.lineWidth, "line width", 0, 10, 0),
            a: parseRef(raw.a, "joint end a"),
            b: parseRef(raw.b, "joint end b"),
            localA: vec(raw.localA, "localA", [0, 0]),
            localB: vec(raw.localB, "localB", [0, 0]),
        };
        switch (raw.type) {
            case "distance": {
                const mode = raw.mode === "max" || raw.mode === "min" ? raw.mode : "fixed";
                return { ...base, type: "distance", length: num(raw.length, "joint length", 0.001, 1e5), mode };
            }
            case "spring":
                return {
                    ...base,
                    type: "spring",
                    restLength: num(raw.restLength, "spring length", 0, 1e5),
                    stiffness: num(raw.stiffness, "stiffness", 0.001, 1e9),
                    damping: num(raw.damping, "damping", 0, 1e9, 0),
                };
            case "pin":
                return { ...base, type: "pin" };
            case "pulley": {
                const ground = (g: unknown, what: string): V2 | number => (typeof g === "number" ? (parseRef(g, what) as number) : vec(g, what));
                return {
                    ...base,
                    type: "pulley",
                    groundA: ground(raw.groundA, "pulley point A"),
                    groundB: ground(raw.groundB, "pulley point B"),
                    ratio: num(raw.ratio, "pulley ratio", 0.1, 10, 1),
                    length: num(raw.length, "rope length", 0.001, 1e5),
                };
            }
            case "route": {
                const route = list(raw.route, "pulley route", 64).map((e) => {
                    if (!isObject(e)) return fail("invalid pulley route");
                    const body = parseRef(e.body, "route body");
                    if (typeof body !== "number") return fail("a route can only use bodies");
                    const wrap = num(e.wrap, "wrap", -1, 1, 0);
                    return { body, local: vec(e.local, "route point", [0, 0]), radius: num(e.radius, "wheel radius", 0, 1000, 0), wrap: Math.sign(wrap) };
                });
                if (route.length < 2) return fail("a pulley rope needs at least 2 points");
                return { ...base, type: "route", length: num(raw.length, "rope length", 0.001, 1e5), route };
            }
            default:
                return fail(`unknown joint type "${String(raw.type)}"`);
        }
    });

    // every reference must point at something that exists
    const refOk = (r: Ref): boolean =>
        typeof r === "number" ? r < bodies.length : r[0] < ropes.length && r[1] < ropes[r[0]].nodes.length;
    for (const j of joints) {
        if (!refOk(j.a) || !refOk(j.b)) return fail(`joint "${j.name}" refers to a missing body`);
        if (j.type === "route" && j.route.some((e) => e.body >= bodies.length)) return fail(`joint "${j.name}" refers to a missing body`);
        if (j.type === "pulley") for (const g of [j.groundA, j.groundB]) if (typeof g === "number" && g >= bodies.length) return fail(`joint "${j.name}" refers to a missing body`);
    }
    for (const r of ropes) for (const p of r.pins) if (p.body >= bodies.length) return fail(`rope "${r.name}" is pinned to a missing body`);
    for (const bd of bodies) for (const o of bd.ignore) if (o >= bodies.length) return fail(`body "${bd.name}" ignores a missing body`);

    return {
        format: SCENE_FORMAT,
        version: SCENE_VERSION,
        name: text(input.name, "Imported scene"),
        view: {
            x: num(view.x, "view x", -1e5, 1e5, 0),
            y: num(view.y, "view y", -1e5, 1e5, 0),
            zoom: num(view.zoom, "view zoom", 1, 10000, 100),
            w: num(view.w, "view width", 0.1, 1e5, 10),
            h: num(view.h, "view height", 0.1, 1e5, 10),
        },
        world: {
            gravity: vec(w.gravity, "gravity", [0, -9.81]),
            bounds: Object.fromEntries(
                ["floor", "ceiling", "left", "right"].flatMap((k) => {
                    const v = bound(k);
                    return v === undefined ? [] : [[k, v]];
                })
            ),
            fixedDt: num(w.fixedDt, "step length", 1 / 960, 1 / 30, 1 / 120),
            substeps: Math.round(num(w.substeps, "substeps", 1, 16, 4)),
            iterations: Math.round(num(w.iterations, "iterations", 1, 100, 20)),
            relaxIterations: Math.round(num(w.relaxIterations, "relax iterations", 0, 50, 12)),
            positionIterations: Math.round(num(w.positionIterations, "position iterations", 0, 30, 6)),
        },
        bodies,
        ropes,
        joints,
    };
}

// Reads a scene from JSON text; the error message says what is wrong with the file.
export function parseSceneText(json: string): SceneFile {
    if (json.length > LIMITS.fileBytes) throw new Error("The file is too large");
    let value: unknown;
    try {
        value = JSON.parse(json);
    } catch {
        throw new Error("The file is not valid JSON");
    }
    return parseScene(value);
}

// ---------------------------------------------------------------------------------------------
// file -> world

function shapeOf(d: ShapeData): Shape {
    if (d.type === "circle") return { type: "circle", radius: d.r };
    if (d.type === "polygon") return { type: "polygon", vertices: d.v.map(([x, y]) => new Vec2(x, y)) };
    return { type: "plane", normal: new Vec2(d.n[0], d.n[1]).normalize(), offset: d.offset };
}

export function buildWorld(data: SceneFile, world: World): void {
    const s = data.world;
    world.gravity = new Vec2(s.gravity[0], s.gravity[1]);
    world.fixedDt = s.fixedDt;
    world.substeps = s.substeps;
    world.iterations = s.iterations;
    world.relaxIterations = s.relaxIterations;
    world.positionIterations = s.positionIterations;
    world.setBounds(s.bounds);

    const bodies = data.bodies.map((d) => {
        const body = new Body(shapeOf(d.shape), {
            name: d.name,
            x: d.x,
            y: d.y,
            angle: d.angle,
            mass: d.mass,
            static: d.static,
            restitution: d.restitution,
            friction: d.friction,
            linearDamping: d.linearDamping,
            angularDamping: d.angularDamping,
            color: d.color,
            category: d.category,
            mask: d.mask,
            z: d.z,
            visible: d.visible,
        });
        body.vx = d.vx;
        body.vy = d.vy;
        body.angVel = d.w;
        return world.add(body);
    });
    data.bodies.forEach((d, i) => d.ignore.forEach((o) => bodies[i].ignoreCollisionWith(bodies[o])));

    const ropes = data.ropes.map((d) => {
        const segments = d.nodes.length - 1;
        const rope = new Rope([new Vec2(0, 0), new Vec2(d.restLength, 0)], {
            name: d.name,
            radius: d.radius,
            spacing: d.restLength / segments,
            nodeMass: d.nodeMass,
            friction: d.friction,
            damping: d.damping,
            color: d.color,
        });
        rope.nodes.forEach((n, i) => {
            const [x, y, vx, vy] = d.nodes[i];
            n.pos = new Vec2(x, y);
            n.vx = vx;
            n.vy = vy;
        });
        for (const p of d.pins) (p.end === "start" ? rope.pinStart : rope.pinEnd).call(rope, bodies[p.body], new Vec2(p.local[0], p.local[1]));
        rope.addTo(world);
        return rope;
    });

    const body = (r: Ref): Body => (typeof r === "number" ? bodies[r] : ropes[r[0]].nodes[r[1]]);
    const point = (v: V2): Vec2 => new Vec2(v[0], v[1]);
    for (const d of data.joints) {
        const a = body(d.a);
        const b = body(d.b);
        const localA = point(d.localA);
        const localB = point(d.localB);
        let joint: Joint;
        if (d.type === "distance") joint = new DistanceJoint(a, b, { length: d.length, mode: d.mode, localA, localB });
        else if (d.type === "spring") joint = new SpringJoint(a, b, { restLength: d.restLength, stiffness: d.stiffness, damping: d.damping, localA, localB });
        else if (d.type === "pin") joint = new PinJoint(a, b, { localA, localB });
        else if (d.type === "route") {
            joint = new PulleyRope(
                d.route.map((e) => ({ body: bodies[e.body], local: point(e.local), radius: e.radius, wrap: e.wrap })),
                d.length
            );
        } else {
            const ground = (g: V2 | number): Vec2 | Body => (typeof g === "number" ? bodies[g] : point(g));
            joint = new PulleyJoint(a, b, { groundA: ground(d.groundA), groundB: ground(d.groundB), ratio: d.ratio, length: d.length, localA, localB });
        }
        joint.name = d.name;
        joint.color = d.color;
        joint.lineWidth = d.lineWidth;
        world.addJoint(joint);
    }
}

// A scene that builds itself from saved data. `data` marks it as a user scene.
export function sceneFromData(data: SceneFile): Scene {
    return { name: data.name, view: { ...data.view }, build: (world) => buildWorld(data, world), data };
}

// a safe file name for a scene
export function sceneFileName(name: string): string {
    const slug = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    return `${slug || "scene"}.physlab.json`;
}
