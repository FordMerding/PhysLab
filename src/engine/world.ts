import { SimObject } from "./simObject";
import { Wall } from "./objects/wall";
import { Vector2 } from "./vector";
import { testCollision, resolveCollision } from "./collision";

function shouldCollide(a: SimObject, b: SimObject): boolean {
    return (a.getCategory() & b.getMask()) !== 0 && (b.getCategory() & a.getMask()) !== 0;
}

export class World {
    private objects: SimObject[] = [];
    private walls: Wall[] = [];
    private gravity: Vector2 = new Vector2(0, 0);

    add(obj: SimObject): void {
        this.objects.push(obj);
    }
    addWalls(walls: Wall[]): void {
        this.walls.push(...walls);
    }

    // e.g. world.setGravity(new Vector2(0, 500)) for "down" in canvas coordinates.
    // Off by default so existing scenes are unaffected.
    setGravity(g: Vector2): void {
        this.gravity = g;
    }

    update(dt: number): void {
        // continuous forces (springs) apply before integration, same as gravity

        for (const obj of this.objects) {
            const body = obj.getBody();
            if (!body.isStatic()) body.addForce(this.gravity.mult(body.getMass()));
            obj.update(dt);
        }

        for (let i = 0; i < this.objects.length; i++) {
            for (let j = i + 1; j < this.objects.length; j++) {
                if (!shouldCollide(this.objects[i], this.objects[j])) continue;
                const info = testCollision(this.objects[i], this.objects[j]);
                if (info) resolveCollision(this.objects[i], this.objects[j], info);
            }
        }

        for (const obj of this.objects) {
            for (const wall of this.walls) {
                if (!shouldCollide(obj, wall)) continue;
                const info = testCollision(obj, wall);
                if (info) resolveCollision(obj, wall, info);
            }
        }
    }

    render(ctx: CanvasRenderingContext2D): void {
        for (const wall of this.walls) wall.render(ctx);
        
        const sorted = [...this.objects].sort((a, b) => a.getZIndex() - b.getZIndex());
        for (const obj of sorted) obj.render(ctx);
    }
}