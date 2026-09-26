import { Vector2 } from "./vector";
import { PhysicsBody } from "./physicsBody";
import { cross, pointVelocity, applyImpulseAtPoint, applyForceAtPoint, worldAnchor } from "./dynamics";

// A constraint connects two bodies but is never itself a collidable SimObject - it
// simply never goes through testCollision/resolveCollision. `applyForce` runs before
// body.update(dt) each frame (for continuous forces, like a spring). `applyCorrection`
// runs after collision resolution (for velocity/position constraints, like a rope going
// taut). A constraint only needs to implement whichever one it actually uses.
export interface Constraint {
    applyForce?(): void;
    applyCorrection?(dt?: number): void;
    render(ctx: CanvasRenderingContext2D): void;
}

// Hooke's law spring: pulls or pushes to reach `restLength`, with damping to keep it
// from oscillating forever. Works as a pin/axle too if restLength=0 and stiffness is high
// (though RopeConstraint below is usually a better fit for a rigid pin - see its note).
export class SpringConstraint implements Constraint {
    private bodyA: PhysicsBody;
    private bodyB: PhysicsBody;
    private restLength: number;
    private stiffness: number;
    private damping: number = 0;
    private localAnchorA: Vector2 = new Vector2(0, 0);
    private localAnchorB: Vector2 = new Vector2(0, 0);
    constructor(
        bodyA: PhysicsBody,
        bodyB: PhysicsBody,
        restLength: number,
        stiffness: number,
        damping: number = 0,
        localAnchorA: Vector2 = new Vector2(0, 0),
        localAnchorB: Vector2 = new Vector2(0, 0)
    ) {
        this.bodyA = bodyA;
        this.bodyB = bodyB;
        this.restLength = restLength;
        this.stiffness = stiffness;
        this.damping = damping;
        this.localAnchorA = localAnchorA;
        this.localAnchorB = localAnchorB;
    }

    applyForce(): void {
        const pA = worldAnchor(this.bodyA, this.localAnchorA);
        const pB = worldAnchor(this.bodyB, this.localAnchorB);
        const delta = pB.sub(pA);
        const dist = delta.length();
        if (dist === 0) return;
        const dir = delta.div(dist);

        const rA = pA.sub(this.bodyA.getPos());
        const rB = pB.sub(this.bodyB.getPos());

        const stretch = dist - this.restLength;
        const relVel = pointVelocity(this.bodyB, rB).sub(pointVelocity(this.bodyA, rA));
        const dampingForce = this.damping * relVel.dot(dir);

        const force = dir.mult(this.stiffness * stretch + dampingForce);

        applyForceAtPoint(this.bodyA, rA, force);
        applyForceAtPoint(this.bodyB, rB, force.mult(-1));
    }

    render(ctx: CanvasRenderingContext2D): void {
        const pA = worldAnchor(this.bodyA, this.localAnchorA);
        const pB = worldAnchor(this.bodyB, this.localAnchorB);
        ctx.strokeStyle = "#888833";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
    }
}

// Inextensible rope (or rigid pin, if maxLength=0): does nothing while slack, and once
// stretched to maxLength it stops further separation outright (restitution 0 by default -
// a rope going taut doesn't bounce). A wheel's axle is just this with maxLength=0: it
// snaps the wheel's center back to the chassis anchor every frame, while leaving the
// wheel's own rotation completely free.
//
// NOTE: this is one-directional (only resists separating past maxLength) and solved in
// a single pass with an 80%-correction + slop, which is fine for a single axle/tether.
// It is NOT what the physical Rope class below uses for its segment-to-segment links -
// a chain of these still lets a real (if small) gap open under load, since each link
// only softly corrects once per frame. Use RigidLinkConstraint for anything where a gap
// between two anchored points must never appear (see its comment for why).
export class RopeConstraint implements Constraint {
    private bodyA: PhysicsBody;
    private bodyB: PhysicsBody;
    private maxLength: number;
    private restitution: number = 0;
    private localAnchorA: Vector2 = new Vector2(0, 0);
    private localAnchorB: Vector2 = new Vector2(0, 0);
    constructor(
        bodyA: PhysicsBody,
        bodyB: PhysicsBody,
        maxLength: number,
        localAnchorA: Vector2 = new Vector2(0, 0),
        localAnchorB: Vector2 = new Vector2(0, 0),
        restitution: number = 0
    ) {
        this.bodyA = bodyA;
        this.bodyB = bodyB;
        this.maxLength = maxLength;
        this.localAnchorA = localAnchorA;
        this.localAnchorB = localAnchorB;
        this.restitution = restitution;
    }

    applyCorrection(): void {
        const pA = worldAnchor(this.bodyA, this.localAnchorA);
        const pB = worldAnchor(this.bodyB, this.localAnchorB);
        const delta = pB.sub(pA);
        const dist = delta.length();
        if (dist <= this.maxLength || dist === 0) return; // slack: rope does nothing

        const normal = delta.div(dist); // points from A to B
        const rA = pA.sub(this.bodyA.getPos());
        const rB = pB.sub(this.bodyB.getPos());

        const invMassA = this.bodyA.getInvMass();
        const invMassB = this.bodyB.getInvMass();
        const invIA = this.bodyA.getInvInertia();
        const invIB = this.bodyB.getInvInertia();
        if (invMassA === 0 && invMassB === 0) return;

        const relVel = pointVelocity(this.bodyB, rB).sub(pointVelocity(this.bodyA, rA));
        const velAlongNormal = relVel.dot(normal);

        // only resist further STRETCHING (points separating); a rope never pushes back
        if (velAlongNormal > 0) {
            const rACrossN = cross(rA, normal);
            const rBCrossN = cross(rB, normal);
            const denom = invMassA + invMassB + rACrossN * rACrossN * invIA + rBCrossN * rBCrossN * invIB;
            const j = (-(1 + this.restitution) * velAlongNormal) / denom;
            applyImpulseAtPoint(this.bodyA, this.bodyB, rA, rB, normal.mult(j));
        }

        // positional correction: pull back to exactly maxLength apart
        const stretch = dist - this.maxLength;
        const percent = 0.8;
        const slop = 0.005;
        const correctionMag = (Math.max(stretch - slop, 0) / (invMassA + invMassB)) * percent;
        const correction = normal.mult(correctionMag);
        this.bodyA.setPos(this.bodyA.getPos().add(correction.mult(invMassA)));
        this.bodyB.setPos(this.bodyB.getPos().sub(correction.mult(invMassB)));
    }

    render(ctx: CanvasRenderingContext2D): void {
        const pA = worldAnchor(this.bodyA, this.localAnchorA);
        const pB = worldAnchor(this.bodyB, this.localAnchorB);
        ctx.strokeStyle = "#555555";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
    }
}

export class MouseConstraint implements Constraint {
    private body: PhysicsBody;
    private localAnchor: Vector2; // grab point, in the body's own local frame
    private target: Vector2;
    private stiffness: number;
    private damping: number;

    constructor(body: PhysicsBody, worldGrabPoint: Vector2, stiffness: number = 10000, damping: number = 40) {
        this.body = body;
        const rotation = -body.getRotation();
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const offset = worldGrabPoint.sub(body.getPos());
        // store the offset un-rotated, so worldAnchor() re-rotates it correctly
        // as the body spins - otherwise dragging a spinning object would drift
        this.localAnchor = new Vector2(offset.x * cos - offset.y * sin, offset.x * sin + offset.y * cos);
        this.target = worldGrabPoint;
        this.stiffness = stiffness;
        this.damping = damping;
    }

    setTarget(target: Vector2): void {
        this.target = target;
    }

    applyForce(): void {
        const anchor = worldAnchor(this.body, this.localAnchor);
        const delta = this.target.sub(anchor);
        const r = anchor.sub(this.body.getPos());
        const relVel = pointVelocity(this.body, r);

        const force = delta.mult(this.stiffness).sub(relVel.mult(this.damping));
        applyForceAtPoint(this.body, r, force);
    }

    render(ctx: CanvasRenderingContext2D): void {
        const anchor = worldAnchor(this.body, this.localAnchor);
        ctx.strokeStyle = "#3366cc";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(anchor.x, anchor.y);
        ctx.lineTo(this.target.x, this.target.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}