import { World } from "./engine/world";
import { Camera } from "./render/camera";
import { Renderer } from "./render/renderer";
import { ViewControls } from "./input/viewcontrols.ts";
import { Vec2 } from "./engine/vec2";
import { scenes } from "./scenes";

const canvas = document.getElementById("simulation") as HTMLCanvasElement;
const camera = new Camera();
const renderer = new Renderer(canvas, camera);
const world = new World();

// pick a scene with ?scene=<index>
const scene = scenes[Number(new URLSearchParams(location.search).get("scene") ?? 0)] ?? scenes[0];
scene.build(world);
camera.center = new Vec2(scene.view.x, scene.view.y);
camera.zoom = scene.view.zoom;

const controls = new ViewControls(canvas, world, camera);

window.addEventListener("resize", () => renderer.resize());
renderer.resize();

let paused = false;
window.addEventListener("keydown", (e) => {
    if (e.code === "Space") paused = !paused;
});

let previous: number | null = null;
function frame(time: number): void {
    const dt = previous === null ? 0 : (time - previous) / 1000;
    previous = time;

    if (!paused) world.step(dt);
    renderer.draw(world, controls.selected);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);