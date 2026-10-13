import { Vec2 } from "./engine/vec2";
import { Camera } from "./render/camera";
import { Renderer } from "./render/renderer";
import { ViewControls } from "./input/viewControls";
import { Simulation, type MouseMode } from "./sim/simulation";
import { scenes } from "./scenes";
import type { Scene } from "./scenes/scene";
import { createUI } from "./ui/ui";
import "./ui/ui.css";

const canvas = document.getElementById("simulation") as HTMLCanvasElement;
const camera = new Camera();
const renderer = new Renderer(canvas, camera);
const sim = new Simulation(scenes);
const controls = new ViewControls(canvas, sim, camera);
const ui = createUI(sim, controls, camera);

const MODE_KEYS: MouseMode[] = ["none", "force", "move", "create", "connect"];
const CURSORS: Record<MouseMode, string> = { none: "default", force: "grab", move: "move", create: "copy", connect: "crosshair" };

// zoom out far enough that the whole scene fits the screen
function fitZoom(scene: Scene): number {
    const { zoom, w, h } = scene.view;
    const small = window.innerWidth <= 900;
    return Math.min(zoom, (window.innerWidth * 0.9) / w, (window.innerHeight * (small ? 0.5 : 0.9)) / h);
}

const showMode = sim.onModeChange;
sim.onModeChange = () => {
    canvas.style.cursor = CURSORS[sim.mode];
    showMode();
};

sim.onLoad = (scene) => {
    camera.center = new Vec2(scene.view.x, scene.view.y);
    camera.zoom = fitZoom(scene);
    controls.release();
    ui.refresh();
};

window.addEventListener("resize", () => renderer.resize());
renderer.resize();

// pick the starting scene with ?scene=<index>
sim.loadScene(scenes[Number(new URLSearchParams(location.search).get("scene") ?? 0)] ?? scenes[0]);

window.addEventListener("keydown", (e) => {
    if (e.code === "Escape") {
        if (sim.mode === "create" || sim.mode === "connect") sim.setMode("none");
        sim.clearSelection();
        return;
    }
    const typing = e.target instanceof HTMLInputElement && e.target.type !== "checkbox" && e.target.type !== "range";
    const digit = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"].indexOf(e.code);
    if (digit !== -1 && !typing && !(e.target instanceof HTMLSelectElement)) {
        sim.setMode(MODE_KEYS[digit]);
        return;
    }
    if ((e.code === "Delete" || e.code === "Backspace") && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
        if (sim.selectedBody) sim.world.removeBody(sim.selectedBody);
        else if (sim.selectedRope) sim.selectedRope.removeFrom(sim.world);
        else return;
        e.preventDefault();
        sim.clearSelection();
        return;
    }
    if (e.code !== "Space") return;
    const t = e.target;
    if (t instanceof HTMLSelectElement) return;
    if (t instanceof HTMLInputElement && t.type === "number") return;
    e.preventDefault();
    sim.paused = !sim.paused;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
});

let previous: number | null = null;
function frame(time: number): void {
    const dt = previous === null ? 0 : (time - previous) / 1000;
    previous = time;

    sim.frame(dt);
    renderer.draw(sim);
    ui.update(time);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);