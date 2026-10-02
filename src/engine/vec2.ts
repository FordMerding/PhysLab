export class Vec2 {
    static readonly ZERO = new Vec2(0, 0);

    readonly x: number;
    readonly y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    add(v: Vec2): Vec2 { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v: Vec2): Vec2 { return new Vec2(this.x - v.x, this.y - v.y); }
    mul(s: number): Vec2 { return new Vec2(this.x * s, this.y * s); }
    div(s: number): Vec2 { return new Vec2(this.x / s, this.y / s); }
    neg(): Vec2 { return new Vec2(-this.x, -this.y); }
    dot(v: Vec2): number { return this.x * v.x + this.y * v.y; }
    cross(v: Vec2): number { return this.x * v.y - this.y * v.x; }
    perp(): Vec2 { return new Vec2(-this.y, this.x); }
    lenSq(): number { return this.x * this.x + this.y * this.y; }
    len(): number { return Math.sqrt(this.lenSq()); }
    dist(v: Vec2): number { return this.sub(v).len(); }

    normalize(): Vec2 {
        const l = this.len();
        return l === 0 ? Vec2.ZERO : this.div(l);
    }

    rotate(angle: number): Vec2 {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
    }
}