import { SimObject } from "../../engine/SimObject";
import { PhysicsBody } from "../../engine/physicsBody";

export class Rectangle extends SimObject{
    private width: number = 1;
    private height: number = 1;
    private color: string = "#000000";

    constructor(body: PhysicsBody, width: number, height: number, color: string){
        super(body);
        
        this.width = width;
        this.height = height;
        this.color = color;
    }

    render(ctx: CanvasRenderingContext2D): void {
        const pos = this.body.getPos();

        ctx.fillStyle = this.color;
        ctx.fillRect(pos.x, pos.y, this.width, this.height);
    }
}