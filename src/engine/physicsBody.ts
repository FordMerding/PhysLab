import { Vector2 } from "./vector";

export class PhysicsBody{
    private pos  : Vector2 = new Vector2(0, 0);
    private vel  : Vector2 = new Vector2(0, 0);
    private acc  : Vector2 = new Vector2(0, 0);
    private force: Vector2 = new Vector2(0, 0);

    private mass    : number = 0;
    private rotation: number = 0;
    
    constructor (pos: Vector2, mass: number){
        this.pos = pos;
        this.mass = mass;
    }

    getMass(): number{
        return this.mass;
    }
    
    getPos(): Vector2{
        return this.pos;
    }
    
    getImpulse(): Vector2{
        return this.vel.mult(this.mass);
    }

    getRotation(): number{
        return this.rotation;
    }

    addForce(force: Vector2): void{
        this.force = this.force.add(force);
    }

    addImpulse(impulse: Vector2): void{
        this.vel = this.vel.add(impulse.div(this.mass));
    }

    setAcc(acc: Vector2): void{
        this.acc = acc;
        this.force = acc.mult(this.mass);
    }

    setPos(pos: Vector2): void{
        this.pos = pos;
    }

    setVel(vel: Vector2): void{
        this.vel = vel;
    }

    update(dt: number): void{
        this.acc = this.force.div(this.mass);
        this.vel = this.vel.add(this.acc.mult(dt));
        this.pos = this.pos.add(this.vel.mult(dt));
    }
}