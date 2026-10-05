import { Vec2 } from "./vec2";
import type { Body } from "./body";
import type { CollisionResult } from "./collision";
import { BAUMGARTE, LINEAR_SLOP, MAX_PUSH_SPEED, RESTITUTION_THRESHOLD } from "./config";

export interface Contact {
    point: Vec2;
    depth: number;
    id: number;
    rAx: number; // contact point relative to each body's center
    rAy: number;
    rBx: number;
    rBy: number;
    normalMass: number;
    tangentMass: number;
    push: number; // position-error correction speed, only applied while useBias is on
    speculative: number; // allowed approach speed for contacts that don't touch yet (<= 0)
    approachSpeed: number; // normal velocity before solving, for restitution
    jn: number; // accumulated normal impulse
    jt: number; // accumulated tangent impulse
}

export interface Manifold {
    a: Body;
    b: Body;
    nx: number; // normal, from a to b
    ny: number;
    tx: number; // tangent
    ty: number;
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
            rAx: 0,
            rAy: 0,
            rBx: 0,
            rBy: 0,
            normalMass: 0,
            tangentMass: 0,
            push: 0,
            speculative: 0,
            approachSpeed: 0,
            jn: old?.jn ?? 0,
            jt: old?.jt ?? 0,
        };
    });
    const n = result.normal;
    return {
        a,
        b,
        nx: n.x,
        ny: n.y,
        tx: -n.y,
        ty: n.x,
        friction: Math.sqrt(a.friction * b.friction),
        restitution: Math.max(a.restitution, b.restitution),
        contacts,
    };
}

function apply(m: Manifold, c: Contact, px: number, py: number): void {
    m.a.applyImpulseXY(-px, -py, c.rAx, c.rAy);
    m.b.applyImpulseXY(px, py, c.rBx, c.rBy);
}

// relative velocity of b's contact point with respect to a's, projected on (ux, uy)
function relSpeed(m: Manifold, c: Contact, ux: number, uy: number): number {
    const { a, b } = m;
    const dvx = b.vx - b.angVel * c.rBy - (a.vx - a.angVel * c.rAy);
    const dvy = b.vy + b.angVel * c.rBx - (a.vy + a.angVel * c.rAx);
    return dvx * ux + dvy * uy;
}

function effectiveMass(a: Body, b: Body, c: Contact, ux: number, uy: number): number {
    const cA = c.rAx * uy - c.rAy * ux;
    const cB = c.rBx * uy - c.rBy * ux;
    const k = a.invMass + b.invMass + a.invInertia * cA * cA + b.invInertia * cB * cB;
    return k > 0 ? 1 / k : 0;
}

export function prepareManifold(m: Manifold, dt: number): void {
    const { a, b } = m;
    for (const c of m.contacts) {
        c.rAx = c.point.x - a.pos.x;
        c.rAy = c.point.y - a.pos.y;
        c.rBx = c.point.x - b.pos.x;
        c.rBy = c.point.y - b.pos.y;
        c.normalMass = effectiveMass(a, b, c, m.nx, m.ny);
        c.tangentMass = effectiveMass(a, b, c, m.tx, m.ty);

        c.push = c.depth > 0 ? Math.min((BAUMGARTE * Math.max(c.depth - LINEAR_SLOP, 0)) / dt, MAX_PUSH_SPEED) : 0;
        c.speculative = c.depth < 0 ? c.depth / dt : 0;
        c.approachSpeed = relSpeed(m, c, m.nx, m.ny);
    }
}

export function warmStartManifold(m: Manifold): void {
    for (const c of m.contacts) apply(m, c, m.nx * c.jn + m.tx * c.jt, m.ny * c.jn + m.ty * c.jt);
}

// useBias=false is the "relax" pass: it removes the velocity that position correction added,
// so correcting overlap doesn't pump energy into the system.
export function solveManifold(m: Manifold, useBias: boolean): void {
    for (const c of m.contacts) {
        const maxF = m.friction * c.jn;
        const next = Math.max(-maxF, Math.min(maxF, c.jt - c.tangentMass * relSpeed(m, c, m.tx, m.ty)));
        const d = next - c.jt;
        c.jt = next;
        apply(m, c, m.tx * d, m.ty * d);
    }

    for (const c of m.contacts) {
        const bias = c.speculative + (useBias ? c.push : 0);
        const next = Math.max(0, c.jn + c.normalMass * (-relSpeed(m, c, m.nx, m.ny) + bias));
        const d = next - c.jn;
        c.jn = next;
        apply(m, c, m.nx * d, m.ny * d);
    }
}

export function applyRestitution(m: Manifold): void {
    if (m.restitution === 0) return;
    for (const c of m.contacts) {
        if (c.approachSpeed > -RESTITUTION_THRESHOLD) continue;
        const next = Math.max(0, c.jn + c.normalMass * (-relSpeed(m, c, m.nx, m.ny) - m.restitution * c.approachSpeed));
        const d = next - c.jn;
        c.jn = next;
        apply(m, c, m.nx * d, m.ny * d);
    }
}