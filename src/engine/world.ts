import { Vec2 } from "./vec2";
import { Body, type BodyOptions } from "./body";
import { type Shape, box, circle, plane } from "./shapes";
import type { Joint } from "./joints";
import { canCollide } from "./filter";
import { collide } from "./collision";
import {
    type Manifold,
    applyRestitution,
    createManifold,
    prepareManifold,
    solveManifold,
    warmStartManifold,
} from "./solver";
import { FIXED_DT, ITERATIONS, MAX_FRAME_TIME, POSITION_ITERATIONS, SPECULATIVE_MARGIN } from "./config";

const GRID_CELL = 0.5; // m

export interface BoundsOptions {
    floor?: number; // y of the floor
    ceiling?: number;
    left?: number; // x of the left wall
    right?: number;
}

export class World {
    readonly bodies: Body[] = [];
    readonly joints: Joint[] = [];
    gravity: Vec2 = new Vec2(0, -9.81);
    iterations = ITERATIONS;
    relaxIterations = 12;
    positionIterations = POSITION_ITERATIONS;
    substeps = 1;

    private bounds: Body[] = [];
    private cache = new Map<number, Manifold>();
    private accumulator = 0;

    add(body: Body): Body {
        this.bodies.push(body);
        return body;
    }

    addBody(shape: Shape, opts: BodyOptions = {}): Body {
        return this.add(new Body(shape, opts));
    }

    addCircle(opts: BodyOptions & { radius: number }): Body {
        return this.addBody(circle(opts.radius), opts);
    }

    addBox(opts: BodyOptions & { w: number; h: number }): Body {
        return this.addBody(box(opts.w, opts.h), opts);
    }

    remove(body: Body): void {
        const i = this.bodies.indexOf(body);
        if (i !== -1) this.bodies.splice(i, 1);
    }

    addJoint<T extends Joint>(joint: T): T {
        this.joints.push(joint);
        return joint;
    }

    removeJoint(joint: Joint): void {
        const i = this.joints.indexOf(joint);
        if (i !== -1) this.joints.splice(i, 1);
    }

    // Replaces any previously set bounds. Omitted sides stay open, so the world is unbounded by default.
    setBounds(b: BoundsOptions): void {
        for (const old of this.bounds) this.remove(old);
        this.bounds = [];
        const wall = (normal: Vec2, point: Vec2) =>
            this.bounds.push(this.addBody(plane(normal, point), { restitution: 0, color: "#444444" }));
        if (b.floor !== undefined) wall(new Vec2(0, 1), new Vec2(0, b.floor));
        if (b.ceiling !== undefined) wall(new Vec2(0, -1), new Vec2(0, b.ceiling));
        if (b.left !== undefined) wall(new Vec2(1, 0), new Vec2(b.left, 0));
        if (b.right !== undefined) wall(new Vec2(-1, 0), new Vec2(b.right, 0));
    }

    // Visible bodies win over invisible ones (rope nodes), and an exact hit wins over a near miss.
    pickAt(point: Vec2, margin = 0): Body | null {
        const passes: Array<[boolean, number]> = [
            [true, 0],
            [true, margin],
            [false, margin],
        ];
        for (const [visibleOnly, m] of passes) {
            for (let i = this.bodies.length - 1; i >= 0; i--) {
                const b = this.bodies[i];
                if (b.isStatic || (visibleOnly && !b.visible)) continue;
                if (b.contains(point, m)) return b;
            }
        }
        return null;
    }

    // Total mass of the dynamic bodies reachable from `body` through joints (static bodies end the search).
    connectedMass(body: Body): number {
        const links = new Map<Body, Body[]>();
        for (const j of this.joints) {
            const [a, b] = j.connects();
            if (a.isStatic || b.isStatic) continue;
            links.set(a, [...(links.get(a) ?? []), b]);
            links.set(b, [...(links.get(b) ?? []), a]);
        }
        const seen = new Set<Body>([body]);
        const stack = [body];
        let mass = 0;
        while (stack.length > 0) {
            const b = stack.pop()!;
            mass += b.mass;
            for (const n of links.get(b) ?? []) {
                if (!seen.has(n)) {
                    seen.add(n);
                    stack.push(n);
                }
            }
        }
        return mass;
    }

    step(dt: number): void {
        this.accumulator += Math.min(dt, MAX_FRAME_TIME);
        while (this.accumulator >= FIXED_DT) {
            this.fixedStep(FIXED_DT);
            this.accumulator -= FIXED_DT;
        }
    }

    private fixedStep(dt: number): void {
        const h = dt / this.substeps;
        for (let i = 0; i < this.substeps; i++) this.subStep(h);
    }

    private subStep(dt: number): void {
        for (const b of this.bodies) b.integrateVelocity(this.gravity, dt);

        const manifolds = this.detect();
        for (const m of manifolds) prepareManifold(m, dt);
        for (const j of this.joints) j.prepare(dt);

        for (const j of this.joints) j.warmStart();
        for (const m of manifolds) warmStartManifold(m);

        for (let i = 0; i < this.iterations; i++) {
            for (const j of this.joints) j.solve();
            for (const m of manifolds) solveManifold(m, true);
        }

        for (const b of this.bodies) b.integratePosition(dt);

        for (let i = 0; i < this.positionIterations; i++) {
            for (const j of this.joints) j.correctPosition();
        }

        for (let i = 0; i < this.relaxIterations; i++) {
            for (const j of this.joints) j.solve();
            for (const m of manifolds) solveManifold(m, false);
        }
        for (const m of manifolds) applyRestitution(m);
    }

    // Broad phase: bodies are bucketed into a uniform grid, and only bodies sharing a cell
    // are tested. Unbounded bodies (planes) are tested against everything.
    private candidatePairs(): Array<[Body, Body]> {
        const bodies = this.bodies;
        const pairs: Array<[Body, Body]> = [];
        const seen = new Set<number>();
        const add = (i: number, j: number): void => {
            const lo = Math.min(i, j);
            const hi = Math.max(i, j);
            const key = lo * 1048576 + hi;
            if (seen.has(key)) return;
            seen.add(key);
            const a = bodies[lo];
            const b = bodies[hi];
            if (a.isStatic && b.isStatic) return;
            if (canCollide(a, b)) pairs.push([a, b]);
        };

        const cells = new Map<number, number[]>();
        const unbounded: number[] = [];
        bodies.forEach((body, i) => {
            const box = body.aabb();
            if (!box) {
                unbounded.push(i);
                return;
            }
            const x0 = Math.floor((box.minX - SPECULATIVE_MARGIN) / GRID_CELL);
            const x1 = Math.floor((box.maxX + SPECULATIVE_MARGIN) / GRID_CELL);
            const y0 = Math.floor((box.minY - SPECULATIVE_MARGIN) / GRID_CELL);
            const y1 = Math.floor((box.maxY + SPECULATIVE_MARGIN) / GRID_CELL);
            for (let x = x0; x <= x1; x++) {
                for (let y = y0; y <= y1; y++) {
                    const key = x * 1048576 + y;
                    const cell = cells.get(key);
                    if (cell) {
                        for (const j of cell) add(i, j);
                        cell.push(i);
                    } else {
                        cells.set(key, [i]);
                    }
                }
            }
        });
        for (const u of unbounded) for (let j = 0; j < bodies.length; j++) if (j !== u) add(u, j);
        return pairs;
    }

    private detect(): Manifold[] {
        const manifolds: Manifold[] = [];
        const next = new Map<number, Manifold>();

        for (const [a, b] of this.candidatePairs()) {
            const result = collide(a, b);
            if (!result) continue;
            const key = a.id * 1048576 + b.id;
            const m = createManifold(a, b, result, this.cache.get(key));
            next.set(key, m);
            manifolds.push(m);
        }

        this.cache = next;
        return manifolds;
    }
}