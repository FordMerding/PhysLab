import { Vec2 } from "./vec2";

export interface CircleShape {
    readonly type: "circle";
    readonly radius: number;
}

// Vertices are counter-clockwise (positive signed area) and centered on the centroid.
export interface PolygonShape {
    readonly type: "polygon";
    readonly vertices: readonly Vec2[];
}

// Free half-space is dot(p, normal) >= offset.
export interface PlaneShape {
    readonly type: "plane";
    readonly normal: Vec2;
    readonly offset: number;
}

export type Shape = CircleShape | PolygonShape | PlaneShape;

export function circle(radius: number): CircleShape {
    return { type: "circle", radius };
}

export function polygon(points: readonly Vec2[]): PolygonShape {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const c = a.cross(b);
        area += c / 2;
        cx += (a.x + b.x) * c;
        cy += (a.y + b.y) * c;
    }
    if (area === 0) throw new Error("Degenerate polygon");

    const centroid = new Vec2(cx / (6 * area), cy / (6 * area));
    const vertices = points.map((p) => p.sub(centroid));
    if (area < 0) vertices.reverse();
    return { type: "polygon", vertices };
}

export function box(w: number, h: number): PolygonShape {
    const hw = w / 2;
    const hh = h / 2;
    return polygon([new Vec2(-hw, -hh), new Vec2(hw, -hh), new Vec2(hw, hh), new Vec2(-hw, hh)]);
}

export function regularPolygon(sides: number, radius: number, startAngle = -Math.PI / 2): PolygonShape {
    const pts: Vec2[] = [];
    for (let i = 0; i < sides; i++) {
        const a = startAngle + (i * 2 * Math.PI) / sides;
        pts.push(new Vec2(Math.cos(a) * radius, Math.sin(a) * radius));
    }
    return polygon(pts);
}

export function plane(normal: Vec2, point: Vec2): PlaneShape {
    const n = normal.normalize();
    return { type: "plane", normal: n, offset: n.dot(point) };
}

// Moment of inertia about the centroid, divided by mass.
export function inertiaPerMass(shape: Shape): number {
    if (shape.type === "circle") return 0.5 * shape.radius * shape.radius;
    if (shape.type === "plane") return 0;

    const v = shape.vertices;
    let area = 0;
    let sum = 0;
    for (let i = 0; i < v.length; i++) {
        const a = v[i];
        const b = v[(i + 1) % v.length];
        const c = a.cross(b);
        area += c / 2;
        sum += (c / 12) * (a.x * a.x + a.x * b.x + b.x * b.x + a.y * a.y + a.y * b.y + b.y * b.y);
    }
    return sum / area;
}

export function shapeArea(shape: Shape): number {
    if (shape.type === "circle") return Math.PI * shape.radius * shape.radius;
    if (shape.type === "plane") return 0;
    const v = shape.vertices;
    let area = 0;
    for (let i = 0; i < v.length; i++) area += v[i].cross(v[(i + 1) % v.length]) / 2;
    return area;
}

// width and height of a polygon's local bounding box
export function polygonSize(shape: PolygonShape): { w: number; h: number } {
    const xs = shape.vertices.map((v) => v.x);
    const ys = shape.vertices.map((v) => v.y);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function scalePolygon(shape: PolygonShape, sx: number, sy: number): PolygonShape {
    return polygon(shape.vertices.map((v) => new Vec2(v.x * sx, v.y * sy)));
}