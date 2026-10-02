import { Vec2 } from "./vec2";
import type { Body } from "./body";
import type { CollisionResult } from "./collision";
import { BAUMGARTE, LINEAR_SLOP, MAX_PUSH_SPEED, RESTITUTION_THRESHOLD } from "./config";

export interface Contact {
    point: Vec2;
    depth: number;
    id: number;
    rA: Vec2;
    rB: Vec2;
    normalMass: number;
    tangentMass: number;
    bias: number;
    jn: number; // accumulated normal impulse
    jt: number; // accumulated tangent impulse
}

export interface Manifold {
    a: Body;
    b: Body;
    normal: Vec2;
    tangent: Vec2;
    friction: number;
    restitution: number;
    contacts: Contact[];
}

export function createManifold(a: Body, b: Body, result: CollisionResult, prev?: Manifold): Manifold {
    const contacts: Contact[] = result.points.map((p) => {
        const old = prev?.contacts.find((c) => c.id === p.id);
        return {
            point: p.point,
            depth: p.depth,
            id: p.id,
            rA: Vec2.ZERO,
            rB: Vec2.ZERO,
            normalMass: 0,
            tangentMass: 0,
            bias: 0,
            jn: old?.jn ?? 0,
            jt: old?.jt ?? 0,
        };
    });
    return {
        a,
        b,
        normal: result.normal,
        tangent: result.normal.perp(),
        friction: Math.sqrt(a.friction * b.friction),
        restitution: Math.max(a.restitution, b.restitution),
        contacts,
    };
}

function effectiveMass(a: Body, b: Body, rA: Vec2, rB: Vec2, axis: Vec2): number {
    const cA = rA.cross(axis);
    const cB = rB.cross(axis);
    const k = a.invMass + b.invMass + a.invInertia * cA * cA + b.invInertia * cB * cB;
    return k > 0 ? 1 / k : 0;
}

function apply(m: Manifold, c: Contact, impulse: Vec2): void {
    m.a.applyImpulse(impulse.neg(), c.rA);
    m.b.applyImpulse(impulse, c.rB);
}

export function prepareManifold(m: Manifold, dt: number): void {
    const { a, b, normal, tangent } = m;
    for (const c of m.contacts) {
        c.rA = c.point.sub(a.pos);
        c.rB = c.point.sub(b.pos);
        c.normalMass = effectiveMass(a, b, c.rA, c.rB, normal);
        c.tangentMass = effectiveMass(a, b, c.rA, c.rB, tangent);

        // depth < 0 is a speculative contact: allow approaching until the shapes just touch
        c.bias =
            c.depth > 0
                ? Math.min((BAUMGARTE * Math.max(c.depth - LINEAR_SLOP, 0)) / dt, MAX_PUSH_SPEED)
                : c.depth / dt;
        const vn = b.velocityAt(c.rB).sub(a.velocityAt(c.rA)).dot(normal);
        if (vn < -RESTITUTION_THRESHOLD) c.bias = Math.max(c.bias, -m.restitution * vn);
    }
}

export function warmStartManifold(m: Manifold): void {
    for (const c of m.contacts) apply(m, c, m.normal.mul(c.jn).add(m.tangent.mul(c.jt)));
}

export function solveManifold(m: Manifold): void {
    const { a, b, normal, tangent } = m;

    for (const c of m.contacts) {
        const vt = b.velocityAt(c.rB).sub(a.velocityAt(c.rA)).dot(tangent);
        const maxF = m.friction * c.jn;
        const next = Math.max(-maxF, Math.min(maxF, c.jt - c.tangentMass * vt));
        apply(m, c, tangent.mul(next - c.jt));
        c.jt = next;
    }

    for (const c of m.contacts) {
        const vn = b.velocityAt(c.rB).sub(a.velocityAt(c.rA)).dot(normal);
        const next = Math.max(0, c.jn + c.normalMass * (-vn + c.bias));
        apply(m, c, normal.mul(next - c.jn));
        c.jn = next;
    }
}