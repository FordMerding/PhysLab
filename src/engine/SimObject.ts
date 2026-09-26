import { cross } from "./dynamics.ts";
import { PhysicsBody } from "./physicsBody";
import { type Collider, CircleCollider, PolygonCollider } from "./collider";
import { Vector2 } from "./vector";
import { Layers } from "./layers.ts";

export abstract class SimObject {
    protected body: PhysicsBody;
    protected collider: Collider;

    protected restitution: number;
    protected friction: number;

    // collision filtering: this object IS `category`, and only tests collision
    // against objects whose category appears in `mask`. Defaults collide with everything.
    protected category: number = Layers.DEFAULT;
    protected mask: number = Layers.ALL;

    // purely visual: draw order, higher draws on top. Unrelated to collision filtering.
    protected zIndex: number = 0;

    constructor(body: PhysicsBody, collider: Collider, restitution: number = 1, friction: number = 0.3) {
        this.body = body;
        this.collider = collider;
        this.restitution = restitution;
        this.friction = friction;

        // moment of inertia follows directly from the collider's shape + the body's mass -
        // no need for every subclass (Circle, Rectangle, Triangle...) to compute it itself.
        if (!body.isStatic()) {
            body.setMomentOfInertia(collider.computeInertia(body.getMass()));
        }
    }

    update(dt: number): void {
        this.body.update(dt);
    }

    getBody(): PhysicsBody {
        return this.body;
    }
    getCollider(): Collider {
        return this.collider;
    }
    getRestitution(): number {
        return this.restitution;
    }
    getFriction(): number {
        return this.friction;
    }

    getCategory(): number {
        return this.category;
    }
    getMask(): number {
        return this.mask;
    }
    // e.g. wheel.setCollisionFilter(Layers.WHEEL, Layers.ALL & ~Layers.CHASSIS) so a wheel
    // pinned to its chassis doesn't fight the chassis's collider, but still hits everything else.
    setCollisionFilter(category: number, mask: number): void {
        this.category = category;
        this.mask = mask;
    }

    getZIndex(): number {
        return this.zIndex;
    }
    setZIndex(z: number): void {
        this.zIndex = z;
    }

    getPos(): Vector2 {
        return this.body.getPos();
    }
    setPos(pos: Vector2): void {
        this.body.setPos(pos);
    }
    getVel(): Vector2 {
        return this.body.getVel();
    }
    setVel(vel: Vector2): void {
        this.body.setVel(vel);
    }

    abstract render(ctx: CanvasRenderingContext2D): void;

    containsPoint(point: Vector2): boolean {
        if (this.collider.type === "circle") {
            const radius = (this.collider as CircleCollider).radius;
            return this.body.getPos().distanceTo(point) <= radius;
        }
        if (this.collider.type === "polygon") {
            const verts = (this.collider as PolygonCollider).getWorldVertices(
                this.body.getPos(),
                this.body.getRotation()
            );
            // convex-polygon test: point is inside if it's on the same side of every edge
            let sign = 0;
            for (let i = 0; i < verts.length; i++) {
                const a = verts[i];
                const b = verts[(i + 1) % verts.length];
                const c = cross(b.sub(a), point.sub(a));
                if (c !== 0) {
                    if (sign === 0) sign = Math.sign(c);
                    else if (Math.sign(c) !== sign) return false;
                }
            }
            return true;
        }
        return false; // planes/walls aren't grabbable
    }
}