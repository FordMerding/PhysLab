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

// World Initialization
const world = new World();
world.addWalls(createScreenBounds(canvas.width - 20, canvas.height - 20));

const circle = new Circle(new PhysicsBody(new Vector2(200, 200), 50, 0), 50, "#ff2222");
circle.setVel(new Vector2(100, 200));
world.add(circle);

const square = new Rectangle(new PhysicsBody(new Vector2(400, 200), 100, 0), 80, 80, "#2222ff");
square.setVel(new Vector2(-120, 250));
world.add(square);

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