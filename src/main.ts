import { Vector2 } from "./engine/vector";
import { PhysicsBody } from "./engine/physicsBody";
import { Rectangle } from "./engine/objects/rect";
import { Circle } from "./engine/objects/circle";
import { Triangle } from "./engine/objects/triangle";
import { createScreenBounds } from "./engine/objects/wall";
import { World } from "./engine/world";

const canvas = document.getElementById("simulation") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;


function resizeCanvas(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

let paused = false;
window.addEventListener("keydown", (event) => {
    if(event.code === "Space") {
        paused = !paused;
    }
})

window.addEventListener("keydown", (event) => {
    if(event.code === "Enter") {
            
    for(let i = 0; i < 10; i++){
        const circle = new Rectangle(new PhysicsBody(new Vector2(200, 100), 20, 0), 45, 45, "#ff2222", 0.5);
        circle.setVel(new Vector2(Math.random() -0.5, Math.random()-0.5).normalize().mult(Math.random()*1000));
        // circle.getBody().setAcc(new  Vector2(0, 1000));
        world.add(circle);
    }
    }
})

const world = new World();
world.addWalls(createScreenBounds(canvas.width - 20, canvas.height - 20));

// for(let i = 0; i < 200; i++){
//     const circle = new Circle(new PhysicsBody(new Vector2(50, 100), 20, 0), 15, "#ff2222", 0.5);
//     circle.setVel(new Vector2(Math.random(), Math.random()).normalize().mult(Math.random()*100));
//     circle.getBody().setAcc(new  Vector2(0, 10000));
//     world.add(circle);
// }


// Game loop
let previousTime: number | null = null;

function gameLoop(currentTime: number): void {
    if(previousTime === null) previousTime = currentTime;
    const dt = (currentTime - previousTime) / 1000; //ms
    previousTime = currentTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);    

    if(!paused) 
        world.update(dt);
    world.render(ctx);

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);