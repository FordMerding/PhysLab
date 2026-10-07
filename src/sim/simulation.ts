import type { Body } from "../engine/body";
import type { Rope } from "../engine/rope";
import { World } from "../engine/world";
import type { Scene } from "../scenes/scene";

// Owns the world and the run state (pause, time scale, timing statistics).
export class Simulation {
    world = new World();
    scene: Scene;
    readonly scenes: readonly Scene[];
    paused = false;
    timeScale = 1;
    fps = 0;
    stepMs = 0; // smoothed physics cost per frame
    onLoad: (scene: Scene) => void = () => {};

    selectedBody: Body | null = null;
    selectedRope: Rope | null = null;
    onSelect: () => void = () => {};

    constructor(scenes: readonly Scene[]) {
        this.scenes = scenes;
        this.scene = scenes[0];
    }

    loadScene(scene: Scene): void {
        this.scene = scene;
        this.world = new World();
        scene.build(this.world);
        this.clearSelection();
        this.onLoad(scene);
    }

    selectBody(body: Body | null): void {
        this.selectedBody = body;
        this.selectedRope = null;
        this.onSelect();
    }

    selectRope(rope: Rope | null): void {
        this.selectedRope = rope;
        this.selectedBody = null;
        this.onSelect();
    }

    clearSelection(): void {
        this.selectBody(null);
    }

    reset(): void {
        this.loadScene(this.scene);
    }

    // call once per rendered frame with the real elapsed time in seconds
    frame(dt: number): void {
        if (dt > 0) this.fps += (1 / dt - this.fps) * (this.fps === 0 ? 1 : 0.1);
        if (this.paused) return;
        this.measure(() => this.world.step(dt * this.timeScale));
    }

    stepOnce(): void {
        this.measure(() => this.world.stepOnce());
    }

    private measure(run: () => void): void {
        const t0 = performance.now();
        run();
        this.stepMs += (performance.now() - t0 - this.stepMs) * 0.1;
    }
}