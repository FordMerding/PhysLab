import { SimObject } from "../simObject";
import { PhysicsBody } from "../physicsBody";
import { Vector2 } from "../vector";
import { PolygonCollider } from "../collider";

export class Rectangle extends SimObject {
    private width: number = 1;
    private height: number = 1;
    private color: string = "#000000";

    constructor(
        body: PhysicsBody,
        width: number,
        height: number,
        color: string,
        restitution: number = 1,
        friction: number = 0.3
    ) {
        const hw = width / 2;
        const hh = height / 2;
        const localVertices = [
            new Vector2(-hw, -hh),
            new Vector2(hw, -hh),
            new Vector2(hw, hh),
            new Vector2(-hw, hh),
        ];
        super(body, new PolygonCollider(localVertices), restitution, friction);

        this.width = width;
        this.height = height;
        this.color = color;
    }

    render(ctx: CanvasRenderingContext2D): void {
        const pos = this.body.getPos();
        const rotation = this.body.getRotation();

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(rotation);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();
    }
}