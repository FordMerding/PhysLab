import { Vec2 } from "./vec2";
import { Body } from "./body";
import { circle } from "./shapes";
import { BAUMGARTE } from "./config";

export abstract class Joint {
    color = "#888888";
    dashed = false;
    visible = true;
    lineWidth = 2;

    protected readonly a: Body;
    protected readonly b: Body;
    protected readonly localA: Vec2;
    protected readonly localB: Vec2;
    protected rA: Vec2 = Vec2.ZERO;
    protected rB: Vec2 = Vec2.ZERO;

    constructor(a: Body, b: Body, localA: Vec2 = Vec2.ZERO, localB: Vec2 = Vec2.ZERO) {
        this.a = a;
        this.b = b;
        this.localA = localA;
        this.localB = localB;
    }

    anchors(): [Vec2, Vec2] {
        return [this.a.toWorld(this.localA), this.b.toWorld(this.localB)];
    }

    abstract prepare(dt: number): void;
    abstract warmStart(): void;
    abstract solve(): void;
}

// Shared 1D constraint along the line between the two anchors.
abstract class AxisJoint extends Joint {
    protected n: Vec2 = new Vec2(1, 0);
    protected dist = 0;
    protected k = 0;
    protected acc = 0;

    protected measure(): void {
        const [pA, pB] = this.anchors();
        const d = pB.sub(pA);
        this.dist = d.len();
        this.n = this.dist > 1e-9 ? d.div(this.dist) : new Vec2(1, 0);
        this.rA = pA.sub(this.a.pos);
        this.rB = pB.sub(this.b.pos);
        const cA = this.rA.cross(this.n);
        const cB = this.rB.cross(this.n);
        this.k = this.a.invMass + this.b.invMass + this.a.invInertia * cA * cA + this.b.invInertia * cB * cB;
    }

    protected relSpeed(): number {
        return this.b.velocityAt(this.rB).sub(this.a.velocityAt(this.rA)).dot(this.n);
    }

    protected applyAxis(lambda: number): void {
        const p = this.n.mul(lambda);
        this.a.applyImpulse(p.neg(), this.rA);
        this.b.applyImpulse(p, this.rB);
    }

    warmStart(): void {
        this.applyAxis(this.acc);
    }
}

export interface DistanceJointOptions {
    length: number;
    mode?: "fixed" | "max" | "min"; // "max" behaves like an inextensible rope
    localA?: Vec2;
    localB?: Vec2;
}

export class DistanceJoint extends AxisJoint {
    private readonly length: number;
    private readonly mode: "fixed" | "max" | "min";
    private mass = 0;
    private bias = 0;

    constructor(a: Body, b: Body, o: DistanceJointOptions) {
        super(a, b, o.localA, o.localB);
        this.length = o.length;
        this.mode = o.mode ?? "fixed";
    }

    prepare(dt: number): void {
        this.measure();
        this.mass = this.k > 0 ? 1 / this.k : 0;
        const c = this.dist - this.length;
        const violated = this.mode === "fixed" || (this.mode === "max" ? c > 0 : c < 0);
        this.bias = violated ? (c * BAUMGARTE) / dt : c / dt;
    }

    solve(): void {
        const old = this.acc;
        let next = old - this.mass * (this.relSpeed() + this.bias);
        if (this.mode === "max") next = Math.min(0, next);
        else if (this.mode === "min") next = Math.max(0, next);
        this.acc = next;
        this.applyAxis(next - old);
    }
}

export interface SpringJointOptions {
    restLength: number;
    stiffness: number;
    damping?: number;
    localA?: Vec2;
    localB?: Vec2;
}

export class SpringJoint extends AxisJoint {
    private readonly restLength: number;
    private readonly stiffness: number;
    private readonly damping: number;
    private mass = 0;
    private bias = 0;
    private gamma = 0;

    constructor(a: Body, b: Body, o: SpringJointOptions) {
        super(a, b, o.localA, o.localB);
        this.restLength = o.restLength;
        this.stiffness = o.stiffness;
        this.damping = o.damping ?? 0;
    }

    prepare(dt: number): void {
        this.measure();
        const g = dt * (this.damping + dt * this.stiffness);
        this.gamma = g > 0 ? 1 / g : 0;
        this.bias = (this.dist - this.restLength) * dt * this.stiffness * this.gamma;
        const k = this.k + this.gamma;
        this.mass = k > 0 ? 1 / k : 0;
    }

    solve(): void {
        const lambda = -this.mass * (this.relSpeed() + this.bias + this.gamma * this.acc);
        this.acc += lambda;
        this.applyAxis(lambda);
    }
}

export interface PinJointOptions {
    localA?: Vec2;
    localB?: Vec2;
}

// Keeps two anchor points together (a revolute joint); rotation stays free.
export class PinJoint extends Joint {
    private acc: Vec2 = Vec2.ZERO;
    private bias: Vec2 = Vec2.ZERO;
    private gamma = 0;
    private limit = Infinity;
    private k00 = 0;
    private k01 = 0;
    private k11 = 0;

    constructor(a: Body, b: Body, o: PinJointOptions = {}) {
        super(a, b, o.localA, o.localB);
    }

    // absolute spring constants; null means a rigid pin
    protected softness(): { k: number; c: number } | null {
        return null;
    }

    protected impulseLimit(_dt: number): number {
        return Infinity;
    }

    prepare(dt: number): void {
        const [pA, pB] = this.anchors();
        this.rA = pA.sub(this.a.pos);
        this.rB = pB.sub(this.b.pos);

        const soft = this.softness();
        let beta = BAUMGARTE / dt;
        this.gamma = 0;
        if (soft) {
            const g = dt * (soft.c + dt * soft.k);
            this.gamma = g > 0 ? 1 / g : 0;
            beta = dt * soft.k * this.gamma;
        }
        this.limit = this.impulseLimit(dt);
        this.bias = pB.sub(pA).mul(beta);

        const { a, b, rA, rB } = this;
        const m = a.invMass + b.invMass;
        this.k00 = m + a.invInertia * rA.y * rA.y + b.invInertia * rB.y * rB.y + this.gamma;
        this.k01 = -a.invInertia * rA.x * rA.y - b.invInertia * rB.x * rB.y;
        this.k11 = m + a.invInertia * rA.x * rA.x + b.invInertia * rB.x * rB.x + this.gamma;
    }

    private applyPoint(p: Vec2): void {
        this.a.applyImpulse(p.neg(), this.rA);
        this.b.applyImpulse(p, this.rB);
    }

    warmStart(): void {
        this.applyPoint(this.acc);
    }

    solve(): void {
        const det = this.k00 * this.k11 - this.k01 * this.k01;
        if (det === 0) return;

        const cdot = this.b.velocityAt(this.rB).sub(this.a.velocityAt(this.rA));
        const rhs = cdot.add(this.bias).add(this.acc.mul(this.gamma)).neg();
        const lambda = new Vec2(
            (this.k11 * rhs.x - this.k01 * rhs.y) / det,
            (this.k00 * rhs.y - this.k01 * rhs.x) / det
        );

        const old = this.acc;
        let next = old.add(lambda);
        const len = next.len();
        if (len > this.limit) next = next.mul(this.limit / len);
        this.acc = next;
        this.applyPoint(next.sub(old));
    }
}

const MOUSE_ANGULAR_DAMPING = 4;

// Soft pin between the cursor and a grabbed body. Stiffness is per unit mass,
// so heavy and light bodies feel the same.
export class MouseJoint extends PinJoint {
    private readonly pointer: Body;
    private readonly target: Body;
    private stiffness: number;
    private readonly maxAccel: number;

    constructor(body: Body, grabPoint: Vec2, stiffness = 400, maxAccel = 4000) {
        const pointer = new Body(circle(0), { x: grabPoint.x, y: grabPoint.y, static: true });
        super(pointer, body, { localB: body.toLocal(grabPoint) });
        this.pointer = pointer;
        this.target = body;
        this.stiffness = stiffness;
        this.maxAccel = maxAccel;
        this.color = "#3366cc";
        this.dashed = true;
    }

    setTarget(p: Vec2): void {
        this.pointer.pos = p;
    }

    setStiffness(s: number): void {
        this.stiffness = s;
    }

    // damps the spin a grabbed body would otherwise keep around the grab point
    override prepare(dt: number): void {
        super.prepare(dt);
        this.target.angVel /= 1 + dt * MOUSE_ANGULAR_DAMPING;
    }

    protected override softness(): { k: number; c: number } {
        const m = this.target.mass;
        return { k: m * this.stiffness, c: m * 2 * Math.sqrt(this.stiffness) };
    }

    protected override impulseLimit(dt: number): number {
        return this.target.mass * this.maxAccel * dt;
    }
}