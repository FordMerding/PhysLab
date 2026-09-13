export class Vector2{
    public x: number = 0;
    public y: number = 0;
    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    add(v: Vector2): Vector2 {
        return new Vector2(this.x + v.x, this.y + v.y);
    }
    sub(v: Vector2): Vector2 {
        return new Vector2(this.x - v.x, this.y - v.y);
    }
    mult(scalar: number): Vector2 {
        return new Vector2(this.x * scalar, this.y * scalar);
    }
    div(scalar: number): Vector2 {
        return new Vector2(this.x / scalar, this.y / scalar);
    }
    dot(v: Vector2): number {
        return (this.x * v.x + this.y * v.y);
    }
    length(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    normalize(): Vector2 {
        const len = this.length();

        if(len === 0){
            return new Vector2(0, 0);
        }
        return new Vector2(this.x / len, this.y / len);
    }
}