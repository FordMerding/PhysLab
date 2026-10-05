import { Vec2 } from "./vec2";
import { Body } from "./body";
import { circle } from "./shapes";
import { MAX_POSITION_CORRECTION } from "./config";

// Joints correct drift in two separate places: `solve` works on velocities only, and
// `correctPosition` moves bodies directly without touching their velocity. Turning drift
// into velocity (Baumgarte) pumps energy into chains and makes ropes buzz.
export abstract class Joint {
    color = "#888888";
    dashed = false;
    visible = true;
    lineWidth = 0; // meters; 0 draws a thin line of constant screen width

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

    connects(): [Body, Body] {
        return [this.a, this.b];
    }

    anchors(): [Vec2, Vec2] {
        return [this.a.toWorld(this.localA), this.b.toWorld(this.localB)];
    }

    abstract prepare(dt: number): void;
    abstract warmStart(): void;
    abstract solve(): void;
    correctPosition(): void {}
}

// Shared 1D constraint along the line between the two anchors. Written with scalars
// because these joints (rope links) dominate the solver's run time.
abstract class AxisJoint extends Joint {
    protected nx = 1;
    protected ny = 0;
    protected dist = 0;
    protected k = 0;
    protected acc = 0;
    private rAx = 0;
    private rAy = 0;
    private rBx = 0;
    private rBy = 0;

    protected measure(): void {
        const a = this.a;
        const b = this.b;
        const lA = this.localA;
        const lB = this.localB;
        if (lA.x === 0 && lA.y === 0) {
            this.rAx = 0;
            this.rAy = 0;
        } else {
            const c = Math.cos(a.angle);
            const s = Math.sin(a.angle);
            this.rAx = lA.x * c - lA.y * s;
            this.rAy = lA.x * s + lA.y * c;
        }
        if (lB.x === 0 && lB.y === 0) {
            this.rBx = 0;
            this.rBy = 0;
        } else {
            const c = Math.cos(b.angle);
            const s = Math.sin(b.angle);
            this.rBx = lB.x * c - lB.y * s;
            this.rBy = lB.x * s + lB.y * c;
        }

        const dx = b.pos.x + this.rBx - (a.pos.x + this.rAx);
        const dy = b.pos.y + this.rBy - (a.pos.y + this.rAy);
        this.dist = Math.sqrt(dx * dx + dy * dy);
        if (this.dist > 1e-9) {
            this.nx = dx / this.dist;
            this.ny = dy / this.dist;
        } else {
            this.nx = 1;
            this.ny = 0;
        }
        const cA = this.rAx * this.ny - this.rAy * this.nx;
        const cB = this.rBx * this.ny - this.rBy * this.nx;
        this.k = a.invMass + b.invMass + a.invInertia * cA * cA + b.invInertia * cB * cB;
    }

    protected relSpeed(): number {
        const a = this.a;
        const b = this.b;
        const dvx = b.vx - b.angVel * this.rBy - (a.vx - a.angVel * this.rAy);
        const dvy = b.vy + b.angVel * this.rBx - (a.vy + a.angVel * this.rAx);
        return dvx * this.nx + dvy * this.ny;
    }

    protected applyAxis(lambda: number): void {
        const px = this.nx * lambda;
        const py = this.ny * lambda;
        this.a.applyImpulseXY(-px, -py, this.rAx, this.rAy);
        this.b.applyImpulseXY(px, py, this.rBx, this.rBy);
    }

    protected shiftAlongAxis(amount: number): void {
        const sx = this.nx * amount;
        const sy = this.ny * amount;
        this.a.applyPositionShiftXY(-sx, -sy, this.rAx, this.rAy);
        this.b.applyPositionShiftXY(sx, sy, this.rBx, this.rBy);
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
    private slack = 0;

    constructor(a: Body, b: Body, o: DistanceJointOptions) {
        super(a, b, o.localA, o.localB);
        this.length = o.length;
        this.mode = o.mode ?? "fixed";
    }

    private error(): number {
        const c = this.dist - this.length;
        if (this.mode === "max") return Math.max(c, 0);
        if (this.mode === "min") return Math.min(c, 0);
        return c;
    }

    prepare(dt: number): void {
        this.measure();
        this.mass = this.k > 0 ? 1 / this.k : 0;
        // not at its limit yet: let the bodies approach until the limit is exactly reached
        this.slack = this.error() === 0 && this.mode !== "fixed" ? (this.dist - this.length) / dt : 0;
    }

    solve(): void {
        const old = this.acc;
        let next = old - this.mass * (this.relSpeed() + this.slack);
        if (this.mode === "max") next = Math.min(0, next);
        else if (this.mode === "min") next = Math.max(0, next);
        this.acc = next;
        this.applyAxis(next - old);
    }

    override correctPosition(): void {
        this.measure();
        const c = this.error();
        if (c === 0 || this.k === 0) return;
        const clamped = Math.max(-MAX_POSITION_CORRECTION, Math.min(MAX_POSITION_CORRECTION, c));
        this.shiftAlongAxis(-clamped / this.k);
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

    private matrix(rA: Vec2, rB: Vec2, extra: number): [number, number, number] {
        const { a, b } = this;
        const m = a.invMass + b.invMass;
        return [
            m + a.invInertia * rA.y * rA.y + b.invInertia * rB.y * rB.y + extra,
            -a.invInertia * rA.x * rA.y - b.invInertia * rB.x * rB.y,
            m + a.invInertia * rA.x * rA.x + b.invInertia * rB.x * rB.x + extra,
        ];
    }

    prepare(dt: number): void {
        const [pA, pB] = this.anchors();
        this.rA = pA.sub(this.a.pos);
        this.rB = pB.sub(this.b.pos);

        const soft = this.softness();
        this.gamma = 0;
        this.bias = Vec2.ZERO;
        if (soft) {
            const g = dt * (soft.c + dt * soft.k);
            this.gamma = g > 0 ? 1 / g : 0;
            this.bias = pB.sub(pA).mul(dt * soft.k * this.gamma);
        }
        this.limit = this.impulseLimit(dt);
        [this.k00, this.k01, this.k11] = this.matrix(this.rA, this.rB, this.gamma);
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

    override correctPosition(): void {
        if (this.softness() !== null) return;
        const [pA, pB] = this.anchors();
        const rA = pA.sub(this.a.pos);
        const rB = pB.sub(this.b.pos);
        const [k00, k01, k11] = this.matrix(rA, rB, 0);
        const det = k00 * k11 - k01 * k01;
        if (det === 0) return;

        let err = pB.sub(pA);
        const len = err.len();
        if (len > MAX_POSITION_CORRECTION) err = err.mul(MAX_POSITION_CORRECTION / len);
        const shift = new Vec2((-k11 * err.x + k01 * err.y) / det, (k01 * err.x - k00 * err.y) / det);
        this.a.applyPositionShift(shift.neg(), rA);
        this.b.applyPositionShift(shift, rB);
    }
}

const MOUSE_ANGULAR_DAMPING = 4;

// Soft pin between the cursor and a grabbed body. Stiffness is per unit mass, using the mass of
// everything the body is jointed to (`pullMass`), so a light handle can still drag a heavy assembly.
export class MouseJoint extends PinJoint {
    private readonly pointer: Body;
    private readonly target: Body;
    private stiffness: number;
    private readonly maxAccel: number;
    private readonly pullMass: number;

    constructor(body: Body, grabPoint: Vec2, stiffness = 400, maxAccel = 40, pullMass = body.mass) {
        const pointer = new Body(circle(0), { x: grabPoint.x, y: grabPoint.y, static: true });
        super(pointer, body, { localB: body.toLocal(grabPoint) });
        this.pointer = pointer;
        this.target = body;
        this.stiffness = stiffness;
        this.maxAccel = maxAccel;
        this.pullMass = Math.max(pullMass, body.mass);
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
        const m = this.pullMass;
        return { k: m * this.stiffness, c: m * 2 * Math.sqrt(this.stiffness) };
    }

    protected override impulseLimit(dt: number): number {
        return this.pullMass * this.maxAccel * dt;
    }
}