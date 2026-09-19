import { Vector2 } from "./vector";

export class PhysicsBody{
    private pos  : Vector2 = new Vector2(0, 0);
    private vel  : Vector2 = new Vector2(0, 0);
    private acc  : Vector2 = new Vector2(0, 0);
    private force: Vector2 = new Vector2(0, 0);

    private mass    : number = 0;
    private rotation: number = 0;

    private static_: boolean = false;

    constructor (pos: Vector2, mass: number, rotation: number){
        this.pos = pos;
        this.mass = mass;
        this.rotation = rotation
    }

    static immovable(pos: Vector2, rotation: number = 0): PhysicsBody{
        const body = new PhysicsBody(pos, Infinity, rotation);
        body.static_ = true;
        return body;
    }

    getMass(): number{
        return this.mass;
    }
    
    isStatic(): boolean {
        return this.static_;
    }

    getPos(): Vector2{
        return this.pos;
    }
    
    getImpulse(): Vector2{
        return this.vel.mult(this.mass);
    }

    getVel(): Vector2{
        return this.vel;
    }

    getRotation(): number{
        return this.rotation;
    }

    addForce(force: Vector2): void{
        if(this.static_) return;
        this.force = this.force.add(force);
    }

    addImpulse(impulse: Vector2): void{
        if(this.static_) return;
        this.vel = this.vel.add(impulse.div(this.mass));
    }

    setAcc(acc: Vector2): void{
        if(this.static_) return;
        this.acc = acc;
        this.force = acc.mult(this.mass);
    }

    setPos(pos: Vector2): void{
        this.pos = pos;
    }

    setVel(vel: Vector2): void{
        if(this.static_) return;
        this.vel = vel;
    }

    reflectVel(normal: Vector2, restitution: number){   
        if(this.static_) return;
        const vn = this.vel.dot(normal);
        if(vn >= 0) return;
        this.vel = this.vel.sub(normal.mult((1+restitution) * vn));
    }

    update(dt: number): void{
        if(this.static_) return;
        this.acc = this.force.div(this.mass);
        this.vel = this.vel.add(this.acc.mult(dt));
        this.pos = this.pos.add(this.vel.mult(dt));
    }
}