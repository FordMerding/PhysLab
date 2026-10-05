import { Vec2 } from "./vec2";
import { type Shape, inertiaPerMass } from "./shapes";
import { ALL_LAYERS, DEFAULT_LAYER } from "./filter";

export interface BodyOptions {
    x?: number;
    y?: number;
    angle?: number;
    mass?: number; // <= 0 or `static: true` makes the body immovable
    static?: boolean;
    restitution?: number;
    friction?: number;
    category?: number;
    mask?: number;
    color?: string;
    z?: number;
    visible?: boolean;
    linearDamping?: number; // 1/s, velocity drag
    angularDamping?: number;
}

export interface Aabb {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

let nextId = 1;

export class Body {
    readonly id: number = nextId++;
    readonly shape: Shape;
    readonly isStatic: boolean;
    readonly mass: number;
    readonly invMass: number;
    readonly inertia: number;
    readonly invInertia: number;

    pos: Vec2;
    angle: number;
    vx = 0;
    vy = 0;
    angVel = 0;

    restitution: number;
    friction: number;
    category: number;
    mask: number;
    color: string;
    z: number;
    visible: boolean;
    linearDamping: number;
    angularDamping: number;

    private fx = 0;
    private fy = 0;
    private torque = 0;

    private vertexCache: Vec2[] = [];
    private cacheX = NaN;
    private cacheY = NaN;
    private cacheAngle = NaN;

    constructor(shape: Shape, o: BodyOptions = {}) {
        const mass = o.mass ?? 1;
        this.shape = shape;
        this.isStatic = o.static === true || shape.type === "plane" || mass <= 0;
        this.mass = this.isStatic ? 0 : mass;
        this.invMass = this.isStatic ? 0 : 1 / mass;
        this.inertia = this.isStatic ? 0 : mass * inertiaPerMass(shape);
        this.invInertia = this.inertia > 0 ? 1 / this.inertia : 0;

        this.pos = new Vec2(o.x ?? 0, o.y ?? 0);
        this.angle = o.angle ?? 0;
        this.restitution = o.restitution ?? 0.2;
        this.friction = o.friction ?? 0.4;
        this.category = o.category ?? DEFAULT_LAYER;
        this.mask = o.mask ?? ALL_LAYERS;
        this.color = o.color ?? "#888888";
        this.z = o.z ?? 0;
        this.visible = o.visible ?? true;
        this.linearDamping = o.linearDamping ?? 0;
        this.angularDamping = o.angularDamping ?? 0;
    }

    // Velocity is stored as scalars (the solver's hot loops avoid allocating vectors);
    // this accessor is for everything else.
    get vel(): Vec2 {
        return new Vec2(this.vx, this.vy);
    }

    set vel(v: Vec2) {
        this.vx = v.x;
        this.vy = v.y;
    }

    toWorld(local: Vec2): Vec2 {
        return this.pos.add(local.rotate(this.angle));
    }

    toLocal(world: Vec2): Vec2 {
        return world.sub(this.pos).rotate(-this.angle);
    }

    velocityAt(r: Vec2): Vec2 {
        return new Vec2(this.vx - this.angVel * r.y, this.vy + this.angVel * r.x);
    }

    // `r` is the offset from the center of mass.
    applyImpulse(impulse: Vec2, r: Vec2): void {
        this.applyImpulseXY(impulse.x, impulse.y, r.x, r.y);
    }

    applyImpulseXY(px: number, py: number, rx: number, ry: number): void {
        if (this.invMass === 0) return;
        this.vx += px * this.invMass;
        this.vy += py * this.invMass;
        this.angVel += this.invInertia * (rx * py - ry * px);
    }

    // Moves the body directly (no velocity change); used by position-correction passes.
    applyPositionShift(shift: Vec2, r: Vec2): void {
        this.applyPositionShiftXY(shift.x, shift.y, r.x, r.y);
    }

    applyPositionShiftXY(sx: number, sy: number, rx: number, ry: number): void {
        if (this.invMass === 0) return;
        this.pos = new Vec2(this.pos.x + sx * this.invMass, this.pos.y + sy * this.invMass);
        this.angle += this.invInertia * (rx * sy - ry * sx);
    }

    applyForce(force: Vec2, worldPoint?: Vec2): void {
        if (this.isStatic) return;
        this.fx += force.x;
        this.fy += force.y;
        if (worldPoint) this.torque += worldPoint.sub(this.pos).cross(force);
    }

    integrateVelocity(gravity: Vec2, dt: number): void {
        if (this.isStatic) return;
        this.vx += (gravity.x + this.fx * this.invMass) * dt;
        this.vy += (gravity.y + this.fy * this.invMass) * dt;
        this.angVel += this.torque * this.invInertia * dt;
        if (this.linearDamping !== 0) {
            const d = 1 / (1 + dt * this.linearDamping);
            this.vx *= d;
            this.vy *= d;
        }
        if (this.angularDamping !== 0) this.angVel /= 1 + dt * this.angularDamping;
        this.fx = 0;
        this.fy = 0;
        this.torque = 0;
    }

    integratePosition(dt: number): void {
        if (this.isStatic) return;
        this.pos = new Vec2(this.pos.x + this.vx * dt, this.pos.y + this.vy * dt);
        this.angle += this.angVel * dt;
    }

    worldVertices(): Vec2[] {
        if (this.shape.type !== "polygon") return [];
        if (this.cacheX !== this.pos.x || this.cacheY !== this.pos.y || this.cacheAngle !== this.angle) {
            this.vertexCache = this.shape.vertices.map((v) => this.toWorld(v));
            this.cacheX = this.pos.x;
            this.cacheY = this.pos.y;
            this.cacheAngle = this.angle;
        }
        return this.vertexCache;
    }

    // `margin` grows the shape (in meters) so thin things are easier to pick.
    contains(point: Vec2, margin = 0): boolean {
        const s = this.shape;
        if (s.type === "circle") return point.dist(this.pos) <= s.radius + margin;
        if (s.type === "polygon") {
            const local = this.toLocal(point);
            const v = s.vertices;
            for (let i = 0; i < v.length; i++) {
                const a = v[i];
                const b = v[(i + 1) % v.length];
                const e = b.sub(a);
                if (e.cross(local.sub(a)) < -margin * e.len()) return false;
            }
            return true;
        }
        return false;
    }

    // null means unbounded (planes).
    aabb(): Aabb | null {
        const s = this.shape;
        if (s.type === "circle") {
            return {
                minX: this.pos.x - s.radius,
                minY: this.pos.y - s.radius,
                maxX: this.pos.x + s.radius,
                maxY: this.pos.y + s.radius,
            };
        }
        if (s.type === "polygon") {
            const box: Aabb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
            for (const v of this.worldVertices()) {
                box.minX = Math.min(box.minX, v.x);
                box.minY = Math.min(box.minY, v.y);
                box.maxX = Math.max(box.maxX, v.x);
                box.maxY = Math.max(box.maxY, v.y);
            }
            return box;
        }
        return null;
    }
}