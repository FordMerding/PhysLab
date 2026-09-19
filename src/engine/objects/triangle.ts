import { SimObject } from "../simObject";
import { PhysicsBody } from "../physicsBody";
import { Vector2 } from "../vector";
import { PolygonCollider } from "../collider";

export class Triangle extends SimObject {
    private color: string;

    constructor(
        body: PhysicsBody,
        localVertices: [Vector2, Vector2, Vector2],
        color: string,
        restitution: number = 1,
        friction: number = 0.3
    ) {
        super(body, new PolygonCollider(localVertices), restitution, friction);
        this.color = color;
    }

    static regular(body: PhysicsBody, size: number, color: string, restitution: number = 1, friction: number = 0.3) {
        const verts: [Vector2, Vector2, Vector2] = [
            new Vector2(0, -size),
            new Vector2(size * 0.87, size * 0.5),
            new Vector2(-size * 0.87, size * 0.5),
        ];
        return new Triangle(body, verts, color, restitution, friction);
    }

    render(ctx: CanvasRenderingContext2D): void {
        const pos = this.body.getPos();
        const rotation = this.body.getRotation();
        const verts = (this.collider as PolygonCollider).getWorldVertices(pos, rotation);

        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}