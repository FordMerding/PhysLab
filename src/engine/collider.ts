import { Vector2 } from "./vector";

export type ColliderType = "circle" | "polygon" | "plane";

export interface Collider {
    readonly type: ColliderType;
    // rotational inertia (I) about the body's own center, for a given mass
    computeInertia(mass: number): number;
}

export class CircleCollider implements Collider {
    readonly type = "circle" as const;
    public radius: number;

    constructor(radius: number) {
        this.radius = radius;
    }

    computeInertia(mass: number): number {
        // solid disk: I = 1/2 * m * r^2
        return 0.5 * mass * this.radius * this.radius;
    }
}

export class PolygonCollider implements Collider {
    readonly type = "polygon" as const;

    public localVertices: Vector2[];

    constructor(localVertices: Vector2[]) {
        this.localVertices = localVertices;
    }

    getWorldVertices(pos: Vector2, rotation: number): Vector2[] {
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);

        return this.localVertices.map(
            (v) => new Vector2(pos.x + v.x * cos - v.y * sin, pos.y + v.x * sin + v.y * cos)
        );
    }

    static getEdgeNormals(worldVertices: Vector2[]): Vector2[] {
        const normals: Vector2[] = [];

        for (let i = 0; i < worldVertices.length; i++) {
            const a = worldVertices[i];
            const b = worldVertices[(i + 1) % worldVertices.length];
            normals.push(b.sub(a).perp().normalize());
        }
        return normals;
    }

    // standard polygon moment-of-inertia formula (as used by e.g. Box2D), assuming
    // localVertices are already given relative to the shape's own centroid - true
    // for Rectangle and Triangle.regular here, since both are built symmetric about (0,0).
    computeInertia(mass: number): number {
        const verts = this.localVertices;
        let area = 0;
        let iAccum = 0;

        for (let i = 0; i < verts.length; i++) {
            const e1 = verts[i];
            const e2 = verts[(i + 1) % verts.length];
            const cross = e1.x * e2.y - e1.y * e2.x;
            area += 0.5 * cross;

            const intx2 = e1.x * e1.x + e1.x * e2.x + e2.x * e2.x;
            const inty2 = e1.y * e1.y + e1.y * e2.y + e2.y * e2.y;
            iAccum += (cross / 12) * (intx2 + inty2);
        }

        const density = mass / area;
        return iAccum * density;
    }
}

export class PlaneCollider implements Collider {
    readonly type = "plane" as const;

    public point: Vector2;
    public normal: Vector2;

    constructor(point: Vector2, normal: Vector2) {
        this.point = point;
        this.normal = normal;
    }

    computeInertia(_mass: number): number {
        return Infinity; // never used: walls are always static (getInvInertia() is 0 regardless)
    }
}