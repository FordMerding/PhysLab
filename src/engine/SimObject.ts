import { PhysicsBody } from "./physicsBody";

export abstract class SimObject{
    protected body: PhysicsBody;

    constructor(body: PhysicsBody){
        this.body = body;
    }

    update(dt: number): void{
        this.body.update(dt);
    }

    abstract render(ctx: CanvasRenderingContext2D): void
}