import { Vector2 } from "./vector";

export type ColliderType = "circle" | "polygon" | "plane";

export interface Collider {
    readonly type: ColliderType;
}

export class CircleCollider implements Collider {
    readonly type = "circle" as const;
    public radius: number;
    constructor(radius: number) {
        this.radius = radius;
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

        for(let i = 0; i < worldVertices.length; i++){
            const a = worldVertices[i];
            const b = worldVertices[(i+1) % worldVertices.length];
            normals.push(b.sub(a).perp().normalize());
        }
        return normals;
    }
}

export class PlaneCollider implements Collider {
    readonly type = "plane" as const;

    public point: Vector2;
    public normal: Vector2;
    constructor(point: Vector2, normal: Vector2){
        this.point = point;
        this.normal = normal;
    }
}