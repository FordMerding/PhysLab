import { Vec2 } from "./vec2";
import type { Body } from "./body";
import type { CircleShape, PlaneShape } from "./shapes";
import { LINEAR_SLOP, SPECULATIVE_MARGIN } from "./config";

export interface ContactPoint {
    point: Vec2;
    depth: number;
    id: number; // stable feature id, used to carry impulses between frames
}

export interface CollisionResult {
    normal: Vec2; // points from a to b
    points: ContactPoint[];
}

function flip(r: CollisionResult | null): CollisionResult | null {
    return r && { normal: r.normal.neg(), points: r.points };
}

function outwardNormals(v: readonly Vec2[]): Vec2[] {
    return v.map((a, i) => {
        const e = v[(i + 1) % v.length].sub(a);
        return new Vec2(e.y, -e.x).normalize();
    });
}

// normal points from the body toward the plane
function vsPlane(body: Body, plane: PlaneShape): CollisionResult | null {
    const normal = plane.normal.neg();
    const s = body.shape;

    if (s.type === "circle") {
        const depth = s.radius - (plane.normal.dot(body.pos) - plane.offset);
        if (depth <= -SPECULATIVE_MARGIN) return null;
        return { normal, points: [{ point: body.pos.add(normal.mul(s.radius)), depth, id: 0 }] };
    }

    const points: ContactPoint[] = [];
    body.worldVertices().forEach((v, i) => {
        const d = plane.normal.dot(v) - plane.offset;
        if (d < SPECULATIVE_MARGIN) points.push({ point: v, depth: -d, id: i });
    });
    return points.length > 0 ? { normal, points } : null;
}

function circleCircle(a: Body, ra: number, b: Body, rb: number): CollisionResult | null {
    const d = b.pos.sub(a.pos);
    const dist = d.len();
    const depth = ra + rb - dist;
    if (depth <= -SPECULATIVE_MARGIN) return null;
    const normal = dist > 1e-9 ? d.div(dist) : new Vec2(1, 0);
    return { normal, points: [{ point: a.pos.add(normal.mul(ra)), depth, id: 0 }] };
}

// normal points from the circle to the polygon
function circlePolygon(cb: Body, c: CircleShape, pb: Body): CollisionResult | null {
    const verts = pb.worldVertices();
    const normals = outwardNormals(verts);
    const center = cb.pos;

    let best = -Infinity;
    let idx = 0;
    for (let i = 0; i < verts.length; i++) {
        const s = center.sub(verts[i]).dot(normals[i]);
        if (s > best) {
            best = s;
            idx = i;
        }
    }
    if (best > c.radius + SPECULATIVE_MARGIN) return null;

    const n = normals[idx];
    const v1 = verts[idx];
    const v2 = verts[(idx + 1) % verts.length];
    const onFace = (): CollisionResult => ({
        normal: n.neg(),
        points: [{ point: center.sub(n.mul(best)), depth: c.radius - best, id: 0 }],
    });
    const onVertex = (v: Vec2, id: number): CollisionResult | null => {
        const d = center.dist(v);
        if (d > c.radius + SPECULATIVE_MARGIN) return null;
        const normal = d > 1e-9 ? v.sub(center).div(d) : n.neg();
        return { normal, points: [{ point: v, depth: c.radius - d, id }] };
    };

    if (best < 0) return onFace();
    const e = v2.sub(v1);
    if (center.sub(v1).dot(e) <= 0) return onVertex(v1, 1);
    if (center.sub(v2).dot(e) >= 0) return onVertex(v2, 2);
    return onFace();
}

function maxSeparation(va: Vec2[], na: Vec2[], vb: Vec2[]): { sep: number; edge: number } {
    let sep = -Infinity;
    let edge = 0;
    for (let i = 0; i < va.length; i++) {
        let min = Infinity;
        for (const p of vb) min = Math.min(min, na[i].dot(p.sub(va[i])));
        if (min > sep) {
            sep = min;
            edge = i;
        }
    }
    return { sep, edge };
}

// keeps the part of segment pts where dot(n, p) <= c, preserving point order
function clip(pts: Vec2[], n: Vec2, c: number): Vec2[] {
    const d0 = n.dot(pts[0]) - c;
    const d1 = n.dot(pts[1]) - c;
    const out: Vec2[] = [];
    if (d0 <= 0) out.push(pts[0]);
    if (d0 * d1 < 0) out.push(pts[0].add(pts[1].sub(pts[0]).mul(d0 / (d0 - d1))));
    if (d1 <= 0) out.push(pts[1]);
    return out;
}

function polygonPolygon(a: Body, b: Body): CollisionResult | null {
    const va = a.worldVertices();
    const vb = b.worldVertices();
    const na = outwardNormals(va);
    const nb = outwardNormals(vb);

    const sa = maxSeparation(va, na, vb);
    if (sa.sep > SPECULATIVE_MARGIN) return null;
    const sb = maxSeparation(vb, nb, va);
    if (sb.sep > SPECULATIVE_MARGIN) return null;

    const refIsB = sb.sep > sa.sep + 0.1 * LINEAR_SLOP;
    const refV = refIsB ? vb : va;
    const incV = refIsB ? va : vb;
    const incN = refIsB ? na : nb;
    const edge = refIsB ? sb.edge : sa.edge;
    const normal = (refIsB ? nb : na)[edge];

    let inc = 0;
    let minDot = Infinity;
    for (let i = 0; i < incN.length; i++) {
        const d = normal.dot(incN[i]);
        if (d < minDot) {
            minDot = d;
            inc = i;
        }
    }

    const v1 = refV[edge];
    const v2 = refV[(edge + 1) % refV.length];
    const tangent = v2.sub(v1).normalize();

    let pts = [incV[inc], incV[(inc + 1) % incV.length]];
    pts = clip(pts, tangent.neg(), -tangent.dot(v1));
    if (pts.length < 2) return null;
    pts = clip(pts, tangent, tangent.dot(v2));
    if (pts.length < 2) return null;

    const points: ContactPoint[] = [];
    pts.forEach((p, k) => {
        const sep = normal.dot(p.sub(v1));
        if (sep <= SPECULATIVE_MARGIN) points.push({ point: p, depth: -sep, id: (refIsB ? 1000 : 0) + edge * 2 + k });
    });
    if (points.length === 0) return null;

    return { normal: refIsB ? normal.neg() : normal, points };
}

export function collide(a: Body, b: Body): CollisionResult | null {
    const sa = a.shape;
    const sb = b.shape;

    if (sa.type === "plane") return sb.type === "plane" ? null : flip(vsPlane(b, sa));
    if (sb.type === "plane") return vsPlane(a, sb);

    if (sa.type === "circle") {
        if (sb.type === "circle") return circleCircle(a, sa.radius, b, sb.radius);
        return circlePolygon(a, sa, b);
    }
    if (sb.type === "circle") return flip(circlePolygon(b, sb, a));
    return polygonPolygon(a, b);
}