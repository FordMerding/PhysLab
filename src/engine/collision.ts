import { Vector2 } from "./vector";
import { SimObject } from "./simObject";
import { CircleCollider, PolygonCollider, PlaneCollider } from "./collider";

export interface CollisionInfo {
    normal: Vector2;
    depth: number;
}

function average(vertices: Vector2[]): Vector2{
    return vertices.reduce((sum, v) => sum.add(v), new Vector2(0, 0)).div(vertices.length);
}

function circleVsCircle(posA: Vector2, rA: number, posB: Vector2, rB: number): CollisionInfo | null {
    const delta = posB.sub(posA);
    const dist = delta.length();
    const overlap = rA+rB - dist;
    if(overlap <= 0) return null;
    const normal = dist === 0 ? new Vector2(1, 0) : delta.normalize();
    return { normal, depth: overlap};
}

function circleVsPlane(pos: Vector2, radius: number, plane: PlaneCollider): CollisionInfo | null {
    const dist = pos.sub(plane.point).dot(plane.normal);
    const overlap = radius - dist;
    if(overlap <= 0) return null;
    return {normal: plane.normal.mult(-1), depth: overlap};
}

function polygonVsPlane(vertices: Vector2[], plane: PlaneCollider): CollisionInfo | null {
    let minDist = Infinity;
    for(const v of vertices) {
        minDist = Math.min(minDist, v.sub(plane.point).dot(plane.normal))        
    }
    if(minDist >= 0) return null;
    return {normal: plane.normal.mult(-1), depth:-minDist};
}

function polygonVsPolygon(vertsA: Vector2[], vertsB: Vector2[]): CollisionInfo | null {
    const axes = [...PolygonCollider.getEdgeNormals(vertsA), ...PolygonCollider.getEdgeNormals(vertsB)]

    let minOverlap = Infinity;
    let smallestAxis: Vector2 | null = null;

    for(const axis of axes) {
        let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
        
        for(const v of vertsA) {
            const p = v.dot(axis);
            aMin = Math.min(aMin, p);
            aMax = Math.max(aMax, p);
        }
        for(const v of vertsB) {
            const p = v.dot(axis);
            bMin = Math.min(bMin, p);
            bMax = Math.max(bMax, p);
        }
        const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
        if(overlap <= 0) return null;
        if(overlap < minOverlap) {
            minOverlap = overlap;
            smallestAxis = axis;
        }
    }
    if(!smallestAxis) return null;

    const normal = average(vertsB).sub(average(vertsA)).dot(smallestAxis) < 0 ? smallestAxis.mult(-1) : smallestAxis;

    return {normal, depth: minOverlap};
}

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
    if (bestSeparation >= radius) return null; // clearly outside that face, so outside the polygon

    const v1 = verts[bestIndex];
    const v2 = verts[(bestIndex + 1) % verts.length];
    const faceNormal = outwardNormals[bestIndex];

    if (bestSeparation < 0) {
        // circle center is inside the polygon: push it out along the least-penetrated face
        return { normal: faceNormal.mult(-1), depth: radius - bestSeparation };
    }

    const edgeDir = v2.sub(v1).normalize();
    const u1 = circlePos.sub(v1).dot(edgeDir);
    const u2 = circlePos.sub(v2).dot(edgeDir.mult(-1));

    if (u1 <= 0) {
        const dist = circlePos.distanceTo(v1);
        if (dist > radius) return null;
        return { normal: v1.sub(circlePos).normalize(), depth: radius - dist };
    }
    if (u2 <= 0) {
        const dist = circlePos.distanceTo(v2);
        if (dist > radius) return null;
        return { normal: v2.sub(circlePos).normalize(), depth: radius - dist };
    }
    return { normal: faceNormal.mult(-1), depth: radius - bestSeparation };
}

function flip(info: CollisionInfo | null): CollisionInfo | null {
    return info ? { normal: info.normal.mult(-1), depth: info.depth } : null;
    // return info;
}

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

export function resolveCollision(a: SimObject, b: SimObject, info: CollisionInfo): void {
    const bodyA = a.getBody();
    const bodyB = b.getBody();
 
    const invMassA = bodyA.isStatic() ? 0 : 1 / bodyA.getMass();
    const invMassB = bodyB.isStatic() ? 0 : 1 / bodyB.getMass();
    if (invMassA === 0 && invMassB === 0) return;
 
    const relVel = bodyB.getVel().sub(bodyA.getVel());
    const velAlongNormal = relVel.dot(info.normal);
    if (velAlongNormal > 0) return;

    const restitution = Math.min(a.getRestitution(), b.getRestitution());
    const j = (-(1 + restitution) * velAlongNormal) / (invMassA + invMassB);
    const impulse = info.normal.mult(j);
 
    bodyA.setVel(bodyA.getVel().sub(impulse.mult(invMassA)));
    bodyB.setVel(bodyB.getVel().add(impulse.mult(invMassB)));

    const percent = 0.8;
    const slop = 0.01;
    const correctionMag = (Math.max(info.depth - slop, 0) / (invMassA + invMassB)) * percent;
    const correction = info.normal.mult(correctionMag);
    bodyA.setPos(bodyA.getPos().sub(correction.mult(invMassA)));
    bodyB.setPos(bodyB.getPos().add(correction.mult(invMassB)));
}