import { SimObject } from "../simObject";
import { PhysicsBody } from "../physicsBody";
import { CircleCollider } from "../collider";

export class Circle extends SimObject {
    private radius: number;
    private color: string;

    constructor(body: PhysicsBody, radius: number, color: string, restitution: number = 1, friction: number = 0.3) {
        super(body, new CircleCollider(radius), restitution, friction);
        this.radius = radius;
        this.color = color;
    }

    getRadius(): number {
        return this.radius;
    }

    render(ctx: CanvasRenderingContext2D): void {
        const pos = this.body.getPos();
        const rotation = this.body.getRotation();

        ctx.beginPath();
        ctx.fillStyle = this.color;
        ctx.arc(pos.x, pos.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // a plain filled circle looks identical at any rotation - draw a spoke so
        // spin is actually visible on screen.
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pos.x + Math.cos(rotation) * this.radius, pos.y + Math.sin(rotation) * this.radius);
        ctx.stroke();
    }
}