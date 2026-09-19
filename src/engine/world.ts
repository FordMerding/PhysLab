import { SimObject } from "./simObject";
import { Wall } from "./objects/wall";
import { testCollision, resolveCollision } from "./collision";

export class World {
    private objects: SimObject[] = [];
    private walls: Wall[] = [];

    add(obj: SimObject): void {    
        this.objects.push(obj);
    }
    addWalls(walls: Wall[]): void {
        this.walls.push(...walls);
    }
    update(dt: number): void {
        for (const obj of this.objects) obj.update(dt);

        for(let i = 0; i < this.objects.length; i++){
            for(let j = i + 1; j < this.objects.length; j++){
                const info = testCollision(this.objects[i], this.objects[j]);
                if(info) resolveCollision(this.objects[i], this.objects[j], info);
            }   
        }

        for (const obj of this.objects){
            for (const wall of this.walls){
                const info = testCollision(obj, wall);
                if(info) resolveCollision(obj, wall, info);
            }
        }
    }

    render(ctx: CanvasRenderingContext2D): void {
        for(const wall of this.walls) wall.render(ctx);
        for(const obj of this.objects) obj.render(ctx);
    }
}