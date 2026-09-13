import { Vector2 } from "./engine/vector";
import { PhysicsBody } from "./engine/physicsBody";
import { Rectangle } from "./assets/objects/rect";

const canvas = document.getElementById("simulation") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

function resizeCanvas(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener("resize", resizeCanvas);

resizeCanvas();

const obj1_body = new PhysicsBody(new Vector2(100, 100), 100);
obj1_body.setAcc(new Vector2(0, 100));
obj1_body.setVel(new Vector2(100, 0));
const obj1 = new Rectangle(obj1_body, 100, 100, "#2222ff");

// Game loop

let previousTime = 0;

function gameLoop(currentTime: number): void {
    const dt = (currentTime - previousTime) / 1000;
    previousTime = currentTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    obj1.update(dt);
    obj1.render(ctx);

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);