import { PhysicsBody } from "./physicsBody";
import { type Collider } from "./collider";
import { Vector2 } from "./vector";

export abstract class SimObject {
    protected body: PhysicsBody;
    protected collider: Collider;

    protected restitution: number;
    protected friction: number;

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
}