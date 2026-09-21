import { Vector2 } from "./vector";
import { PhysicsBody } from "./physicsBody";

// 2D "cross product": the scalar z-component of the 3D cross product
export function cross(a: Vector2, b: Vector2): number {
    return a.x * b.y - a.y * b.x;
}

// velocity of the point at world-offset `r` from a body's center, including its spin.
// ω × r in 2D is (-ω*r.y, ω*r.x).
export function pointVelocity(body: PhysicsBody, r: Vector2): Vector2 {
    const w = body.getAngularVel();
    return body.getVel().add(new Vector2(-w * r.y, w * r.x));
}

// applies an instantaneous impulse at rA (offset from bodyA's center, subtracted)
// and rB (offset from bodyB's center, added) - same linear+angular split collision
// resolution uses, reused here so constraints behave consistently with collisions.
export function applyImpulseAtPoint(bodyA: PhysicsBody, bodyB: PhysicsBody, rA: Vector2, rB: Vector2, impulse: Vector2): void {
    bodyA.setVel(bodyA.getVel().sub(impulse.mult(bodyA.getInvMass())));
    bodyB.setVel(bodyB.getVel().add(impulse.mult(bodyB.getInvMass())));
    bodyA.addAngularImpulse(-cross(rA, impulse));
    bodyB.addAngularImpulse(cross(rB, impulse));
}

// applies a continuous force at world-offset `r` from a body's center - adds the
// linear force as usual, plus the torque that an off-center force implies (r × F).
export function applyForceAtPoint(body: PhysicsBody, r: Vector2, force: Vector2): void {
    body.addForce(force);
    body.addTorque(cross(r, force));
}

// rotates a local offset by a body's current rotation and adds its position -
// used to turn a rope/spring's local anchor into a world-space attachment point.
export function worldAnchor(body: PhysicsBody, local: Vector2): Vector2 {
    const rotation = body.getRotation();
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return body.getPos().add(new Vector2(local.x * cos - local.y * sin, local.x * sin + local.y * cos));
}