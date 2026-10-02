import { Vec2 } from "./vec2";
import { Body, type BodyOptions } from "./body";
import { type Shape, box, circle, plane } from "./shapes";
import type { Joint } from "./joints";
import { canCollide } from "./filter";
import { collide } from "./collision";
import { type Manifold, createManifold, prepareManifold, solveManifold, warmStartManifold } from "./solver";
import { FIXED_DT, ITERATIONS, MAX_FRAME_TIME } from "./config";

export class World {
    readonly bodies: Body[] = [];
    readonly joints: Joint[] = [];
    gravity: Vec2 = Vec2.ZERO;
    iterations = ITERATIONS;
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

    // Replaces any previously added bounds, so it can be called again on resize.
    addBounds(width: number, height: number): void {
        for (const b of this.bounds) this.remove(b);
        const wall = (normal: Vec2, point: Vec2) =>
            this.addBody(plane(normal, point), { restitution: 0, color: "#444444" });
        this.bounds = [
            wall(new Vec2(0, 1), new Vec2(0, 0)),
            wall(new Vec2(0, -1), new Vec2(0, height)),
            wall(new Vec2(1, 0), new Vec2(0, 0)),
            wall(new Vec2(-1, 0), new Vec2(width, 0)),
        ];
    }

    pickAt(point: Vec2): Body | null {
        for (let i = this.bodies.length - 1; i >= 0; i--) {
            const b = this.bodies[i];
            if (!b.isStatic && b.contains(point)) return b;
        }
        return null;
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
            for (const m of manifolds) solveManifold(m);
        }

        for (const b of this.bodies) b.integratePosition(dt);
    }

    private detect(): Manifold[] {
        const manifolds: Manifold[] = [];
        const next = new Map<number, Manifold>();
        const boxes = this.bodies.map((b) => b.aabb());

        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const a = this.bodies[i];
                const b = this.bodies[j];
                if (a.isStatic && b.isStatic) continue;
                if (!canCollide(a, b)) continue;

                const p = boxes[i];
                const q = boxes[j];
                if (p && q && (p.maxX < q.minX || q.maxX < p.minX || p.maxY < q.minY || q.maxY < p.minY)) continue;

                const result = collide(a, b);
                if (!result) continue;

                const key = a.id * 1048576 + b.id;
                const m = createManifold(a, b, result, this.cache.get(key));
                next.set(key, m);
                manifolds.push(m);
            }
        }

        this.cache = next;
        return manifolds;
    }
}