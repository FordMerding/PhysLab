import { Vector2 } from "./vector";

export class PhysicsBody {
    private pos: Vector2 = new Vector2(0, 0);
    private vel: Vector2 = new Vector2(0, 0);
    private acc: Vector2 = new Vector2(0, 0);
    private force: Vector2 = new Vector2(0, 0);

    private mass: number = 0;
    private rotation: number = 0;

    // rotational state
    private angularVel: number = 0; // ω, radians/sec
    private torque: number = 0;
    private momentOfInertia: number = 1; // I, set by SimObject from the collider's shape

    private static_: boolean = false;

    constructor(pos: Vector2, mass: number, rotation: number) {
        this.pos = pos;
        this.mass = mass;
        this.rotation = rotation;
    }

    static immovable(pos: Vector2, rotation: number = 0): PhysicsBody {
        const body = new PhysicsBody(pos, Infinity, rotation);
        body.static_ = true;
        return body;
    }

    getMass(): number {
        return this.mass;
    }

    // 0 for static bodies, so "invMassA + invMassB" in impulse math naturally
    // treats them as infinitely heavy without any special-casing at the call site.
    getInvMass(): number {
        return this.static_ ? 0 : 1 / this.mass;
    }

    isStatic(): boolean {
        return this.static_;
    }

    getPos(): Vector2 {
        return this.pos;
    }

    getImpulse(): Vector2 {
        if (this.static_) return new Vector2(0, 0);
        return this.vel.mult(this.mass);
    }

    getVel(): Vector2 {
        return this.vel;
    }

    getRotation(): number {
        return this.rotation;
    }

    setRotation(rotation: number): void {
        this.rotation = rotation;
    }

    getAngularVel(): number {
        return this.angularVel;
    }

    setAngularVel(w: number): void {
        if (this.static_) return;
        this.angularVel = w;
    }

    getMomentOfInertia(): number {
        return this.momentOfInertia;
    }

    // set once by SimObject at construction, from the collider's own inertia formula
    setMomentOfInertia(i: number): void {
        this.momentOfInertia = i;
    }

    getInvInertia(): number {
        return this.static_ ? 0 : 1 / this.momentOfInertia;
    }

    addForce(force: Vector2): void {
        if (this.static_) return;
        this.force = this.force.add(force);
    }

    // continuous torque (e.g. a motor); accumulates and is cleared each update(), like force
    addTorque(torque: number): void {
        if (this.static_) return;
        this.torque += torque;
    }

    addImpulse(impulse: Vector2): void {
        if (this.static_) return;
        this.vel = this.vel.add(impulse.div(this.mass));
    }

    // instantaneous angular impulse (change in angular momentum), used directly by collision resolution
    addAngularImpulse(angularImpulse: number): void {
        if (this.static_) return;
        this.angularVel += angularImpulse * this.getInvInertia();
    }

    setAcc(acc: Vector2): void {
        if (this.static_) return;
        this.acc = acc;
        this.force = acc.mult(this.mass);
    }

    setPos(pos: Vector2): void {
        this.pos = pos;
    }

    setVel(vel: Vector2): void {
        if (this.static_) return;
        this.vel = vel;
    }

    // reflects velocity off a surface with the given (unit) normal.
    reflectVel(normal: Vector2, restitution: number = 1): void {
        if (this.static_) return;
        const vn = this.vel.dot(normal);
        if (vn >= 0) return;
        this.vel = this.vel.sub(normal.mult((1 + restitution) * vn));
    }

    update(dt: number): void {
        if (this.static_) return;

        this.acc = this.force.div(this.mass);
        this.vel = this.vel.add(this.acc.mult(dt));
        this.pos = this.pos.add(this.vel.mult(dt));

        const angularAcc = this.torque / this.momentOfInertia;
        this.angularVel += angularAcc * dt;
        this.rotation += this.angularVel * dt;

        // clear per-frame accumulators (force previously wasn't reset - fixing that
        // here too, otherwise a one-time addForce() would accelerate the body forever)
        this.force = new Vector2(0, 0);
        this.torque = 0;
    }
}