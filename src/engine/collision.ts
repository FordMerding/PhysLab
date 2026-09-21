import { Vector2 } from "./vector";
import { SimObject } from "./simObject";
import { CircleCollider, PolygonCollider, PlaneCollider } from "./collider";
import { cross, pointVelocity, applyImpulseAtPoint } from "./dynamics";

export interface CollisionInfo {
    // points from object A toward object B
    normal: Vector2;
    // how far the two shapes overlap along `normal`
    depth: number;
    // approximate world-space point where the two shapes touch - needed to know how
    // much torque an impact applies (an off-center hit spins things, a dead-center one doesn't)
    point: Vector2;
}

function average(vertices: Vector2[]): Vector2 {
    return vertices.reduce((sum, v) => sum.add(v), new Vector2(0, 0)).div(vertices.length);
}

// --- circle vs circle ---
function circleVsCircle(posA: Vector2, rA: number, posB: Vector2, rB: number): CollisionInfo | null {
    const delta = posB.sub(posA);
    const dist = delta.length();
    const overlap = rA + rB - dist;
    if (overlap <= 0) return null;
    const normal = dist === 0 ? new Vector2(1, 0) : delta.normalize();
    const point = posA.add(normal.mult(rA)); // on A's surface, facing B
    return { normal, depth: overlap, point };
}

// --- circle vs plane (world border) ---
function circleVsPlane(pos: Vector2, radius: number, plane: PlaneCollider): CollisionInfo | null {
    const dist = pos.sub(plane.point).dot(plane.normal);
    const overlap = radius - dist;
    if (overlap <= 0) return null;
    const point = pos.sub(plane.normal.mult(radius)); // on the circle's surface, facing the wall
    return { normal: plane.normal.mult(-1), depth: overlap, point };
}

// --- convex polygon vs plane ---
function polygonVsPlane(vertices: Vector2[], plane: PlaneCollider): CollisionInfo | null {
    let minDist = Infinity;
    let contact = vertices[0];
    for (const v of vertices) {
        const d = v.sub(plane.point).dot(plane.normal);
        if (d < minDist) {
            minDist = d;
            contact = v;
        }
    }
    if (minDist >= 0) return null;
    return { normal: plane.normal.mult(-1), depth: -minDist, point: contact };
}

// --- convex polygon vs convex polygon (SAT) ---
function polygonVsPolygon(vertsA: Vector2[], vertsB: Vector2[]): CollisionInfo | null {
    const candidates = [
        ...PolygonCollider.getEdgeNormals(vertsA).map((axis) => ({ axis, fromA: true })),
        ...PolygonCollider.getEdgeNormals(vertsB).map((axis) => ({ axis, fromA: false })),
    ];

    let minOverlap = Infinity;
    let smallestAxis: Vector2 | null = null;
    let axisFromA = true;

    for (const { axis, fromA } of candidates) {
        let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
        for (const v of vertsA) {
            const p = v.dot(axis);
            aMin = Math.min(aMin, p);
            aMax = Math.max(aMax, p);
        }
        for (const v of vertsB) {
            const p = v.dot(axis);
            bMin = Math.min(bMin, p);
            bMax = Math.max(bMax, p);
        }
        const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
        if (overlap <= 0) return null; // separating axis found
        if (overlap < minOverlap) {
            minOverlap = overlap;
            smallestAxis = axis;
            axisFromA = fromA;
        }
    }
    if (!smallestAxis) return null;

    const normal = average(vertsB).sub(average(vertsA)).dot(smallestAxis) < 0 ? smallestAxis.mult(-1) : smallestAxis;

    // Approximate contact point: the "incident" polygon's (the one whose FACE didn't win)
    // vertex that penetrates deepest along the normal. This is a single-point simplification
    // of the standard clipped 2-point manifold - good enough for this engine; it can look
    // slightly off for a perfectly flush box-on-box edge contact, but is stable and simple.
    const incidentVerts = axisFromA ? vertsB : vertsA;
    let contactPoint = incidentVerts[0];
    let minProj = contactPoint.dot(normal);
    for (const v of incidentVerts) {
        const p = v.dot(normal);
        if (p < minProj) {
            minProj = p;
            contactPoint = v;
        }
    }

    return { normal, depth: minOverlap, point: contactPoint };
}

// --- circle vs convex polygon ---
// Standard face-then-region algorithm: find the single face the circle center is most
// outside of, then check whether the circle is closest to that face's segment or has
// slipped past one of its two endpoints (a vertex region).
function circleVsPolygon(circlePos: Vector2, radius: number, verts: Vector2[]): CollisionInfo | null {
    const center = average(verts);

    let bestSeparation = -Infinity;
    let bestIndex = -1;
    const outwardNormals: Vector2[] = [];

    for (let i = 0; i < verts.length; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        let n = b.sub(a).perp().normalize();
        if (n.dot(center.sub(a)) > 0) n = n.mult(-1); // force outward, regardless of winding order
        outwardNormals.push(n);

        const separation = circlePos.sub(a).dot(n);
        if (separation > bestSeparation) {
            bestSeparation = separation;
            bestIndex = i;
        }
    }
    if (bestSeparation >= radius) return null;

    const v1 = verts[bestIndex];
    const v2 = verts[(bestIndex + 1) % verts.length];
    const faceNormal = outwardNormals[bestIndex];

    if (bestSeparation < 0) {
        // circle center is inside the polygon: push it out along the least-penetrated face
        const point = circlePos.sub(faceNormal.mult(bestSeparation));
        return { normal: faceNormal.mult(-1), depth: radius - bestSeparation, point };
    }

    const edgeDir = v2.sub(v1).normalize();
    const u1 = circlePos.sub(v1).dot(edgeDir);
    const u2 = circlePos.sub(v2).dot(edgeDir.mult(-1));

    if (u1 <= 0) {
        const dist = circlePos.distanceTo(v1);
        if (dist > radius) return null;
        return { normal: v1.sub(circlePos).normalize(), depth: radius - dist, point: v1 };
    }
    if (u2 <= 0) {
        const dist = circlePos.distanceTo(v2);
        if (dist > radius) return null;
        return { normal: v2.sub(circlePos).normalize(), depth: radius - dist, point: v2 };
    }
    const point = circlePos.sub(faceNormal.mult(bestSeparation));
    return { normal: faceNormal.mult(-1), depth: radius - bestSeparation, point };
}

function flip(info: CollisionInfo | null): CollisionInfo | null {
    return info ? { normal: info.normal.mult(-1), depth: info.depth, point: info.point } : null;
}

// dispatches to the right narrow-phase test based on each object's collider type.
export function testCollision(a: SimObject, b: SimObject): CollisionInfo | null {
    const colA = a.getCollider();
    const colB = b.getCollider();

    if (colA.type === "circle" && colB.type === "circle") {
        return circleVsCircle(a.getPos(), (colA as CircleCollider).radius, b.getPos(), (colB as CircleCollider).radius);
    }
    if (colA.type === "circle" && colB.type === "plane") {
        return circleVsPlane(a.getPos(), (colA as CircleCollider).radius, colB as PlaneCollider);
    }
    if (colA.type === "plane" && colB.type === "circle") {
        return flip(circleVsPlane(b.getPos(), (colB as CircleCollider).radius, colA as PlaneCollider));
    }
    if (colA.type === "polygon" && colB.type === "polygon") {
        const vertsA = (colA as PolygonCollider).getWorldVertices(a.getPos(), a.getBody().getRotation());
        const vertsB = (colB as PolygonCollider).getWorldVertices(b.getPos(), b.getBody().getRotation());
        return polygonVsPolygon(vertsA, vertsB);
    }
    if (colA.type === "polygon" && colB.type === "plane") {
        const verts = (colA as PolygonCollider).getWorldVertices(a.getPos(), a.getBody().getRotation());
        return polygonVsPlane(verts, colB as PlaneCollider);
    }
    if (colA.type === "plane" && colB.type === "polygon") {
        const verts = (colB as PolygonCollider).getWorldVertices(b.getPos(), b.getBody().getRotation());
        return flip(polygonVsPlane(verts, colA as PlaneCollider));
    }
    if (colA.type === "circle" && colB.type === "polygon") {
        const verts = (colB as PolygonCollider).getWorldVertices(b.getPos(), b.getBody().getRotation());
        return circleVsPolygon(a.getPos(), (colA as CircleCollider).radius, verts);
    }
    if (colA.type === "polygon" && colB.type === "circle") {
        const verts = (colA as PolygonCollider).getWorldVertices(a.getPos(), a.getBody().getRotation());
        return flip(circleVsPolygon(b.getPos(), (colB as CircleCollider).radius, verts));
    }
    return null;
}

// full rigid-body impulse resolution: linear + angular response, Coulomb friction, and
// positional de-penetration. `info.point` is what makes the angular part possible - the
// torque an impact applies is proportional to how far the contact point is from each
// body's center (that's the r × impulse term below).
export function resolveCollision(a: SimObject, b: SimObject, info: CollisionInfo): void {
    const bodyA = a.getBody();
    const bodyB = b.getBody();

    const invMassA = bodyA.getInvMass();
    const invMassB = bodyB.getInvMass();
    const invIA = bodyA.getInvInertia();
    const invIB = bodyB.getInvInertia();
    if (invMassA === 0 && invMassB === 0) return;

    const rA = info.point.sub(bodyA.getPos());
    const rB = info.point.sub(bodyB.getPos());

    const relVel = pointVelocity(bodyB, rB).sub(pointVelocity(bodyA, rA));
    const velAlongNormal = relVel.dot(info.normal);
    if (velAlongNormal > 0) return; // already separating

    const restitution = Math.min(a.getRestitution(), b.getRestitution());

    const rACrossN = cross(rA, info.normal);
    const rBCrossN = cross(rB, info.normal);
    const normalDenom = invMassA + invMassB + rACrossN * rACrossN * invIA + rBCrossN * rBCrossN * invIB;

    const j = (-(1 + restitution) * velAlongNormal) / normalDenom;
    const impulse = info.normal.mult(j);
    applyImpulseAtPoint(bodyA, bodyB, rA, rB, impulse);

    // Coulomb friction along the tangent, computed AFTER the normal impulse (standard
    // sequential-impulse order). This is what actually turns sliding into rolling.
    const tangent = info.normal.perp();
    const relVelAfterNormal = pointVelocity(bodyB, rB).sub(pointVelocity(bodyA, rA));
    const velAlongTangent = relVelAfterNormal.dot(tangent);

    const rACrossT = cross(rA, tangent);
    const rBCrossT = cross(rB, tangent);
    const tangentDenom = invMassA + invMassB + rACrossT * rACrossT * invIA + rBCrossT * rBCrossT * invIB;

    if (tangentDenom > 0) {
        const friction = Math.sqrt(a.getFriction() * b.getFriction());
        let jt = -velAlongTangent / tangentDenom;
        const maxFriction = friction * Math.abs(j);
        jt = Math.max(-maxFriction, Math.min(maxFriction, jt)); // Coulomb's cone, clamped

        const frictionImpulse = tangent.mult(jt);
        applyImpulseAtPoint(bodyA, bodyB, rA, rB, frictionImpulse);
    }

    // positional correction (linear only - rotation isn't corrected positionally, just
    // like before; this only prevents slow sinking, it doesn't need to be exact)
    const percent = 0.8;
    const slop = 0.01;
    const correctionMag = (Math.max(info.depth - slop, 0) / (invMassA + invMassB)) * percent;
    const correction = info.normal.mult(correctionMag);
    bodyA.setPos(bodyA.getPos().sub(correction.mult(invMassA)));
    bodyB.setPos(bodyB.getPos().add(correction.mult(invMassB)));
}