import { SimObject } from "../simObject";
import { PhysicsBody } from "../physicsBody";
import { Vector2 } from "../vector";
import { PlaneCollider } from "../collider";

export class Wall extends SimObject {
    private color: string;

    constructor(point: Vector2, normal: Vector2, color: string = "#444444", restitution: number = 1, friction: number = 0.3) {
        super(PhysicsBody.immovable(point), new PlaneCollider(point, normal.normalize()), restitution, friction);
        this.color = color;
    }

    render(ctx: CanvasRenderingContext2D): void {
        const plane = this.collider as PlaneCollider;
        const tangent = plane.normal.perp();
        const p1 = plane.point.add(tangent.mult(4000));
        const p2 = plane.point.sub(tangent.mult(4000));

        ctx.strokeStyle = this.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }
}

export function createScreenBounds(width: number, height: number): Wall[] {
    return [
        new Wall(new Vector2(0, 0), new Vector2(0, 1)),
        new Wall(new Vector2(0, height), new Vector2(0, -1)),
        new Wall(new Vector2(0, 0), new Vector2(1, 0)),
        new Wall(new Vector2(width, 0), new Vector2(-1, 0)),
    ];
}