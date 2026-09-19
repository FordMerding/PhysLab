import { SimObject } from "../simObject";
import { PhysicsBody } from "../physicsBody";
import { CircleCollider } from "../collider";

export class Circle extends SimObject {
    private radius: number;
    private color: string;

    constructor(body: PhysicsBody, radius: number, color: string, restitution: number = 1) {
        super(body, new CircleCollider(radius), restitution);
        this.radius = radius;
        this.color = color;
    }

    getRadius(): number {
        return this.radius;
    }

    render(ctx: CanvasRenderingContext2D): void {
        const pos = this.body.getPos();
        ctx.beginPath();
        ctx.fillStyle = this.color;
        ctx.arc(pos.x, pos.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}