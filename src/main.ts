import { Vec2 } from "./engine/vec2";
import { World } from "./engine/world";
import { Renderer } from "./render/renderer";
import { attachMouseDrag } from "./input/mouseDrag";
import { buildPulleyDemo } from "./scenes/pulleyDemo";
import { buildCarDemo } from "./scenes/carDemo";
import { buildDrStonePulleyDemo } from "./scenes/DoctorStoneThingy";

const canvas = document.getElementById("simulation") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const world = new World();
world.gravity = new Vec2(0, 500);

function resize(): void {
    renderer.resize();
    world.addBounds(renderer.width, renderer.height);
}
window.addEventListener("resize", resize);
resize();

buildDrStonePulleyDemo(world);
attachMouseDrag(canvas, world);

let paused = true;
window.addEventListener("keydown", (e) => {
    if (e.code === "Space") paused = !paused;
});

let previous: number | null = null;
function frame(time: number): void {
    const dt = previous === null ? 0 : (time - previous) / 1000;
    previous = time;

    if (!paused) world.step(dt);
    renderer.draw(world);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);