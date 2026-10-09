import type { Body } from "../engine/body";
import type { Joint } from "../engine/joints";
import type { Rope } from "../engine/rope";
import { World } from "../engine/world";
import type { Scene } from "../scenes/scene";
import { ViewSettings } from "./viewSettings.ts";
import type { ConnectOptions } from "./connect";
import type { Vec2 } from "../engine/vec2";

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
    selectedJoint: Joint | null = null;
    onSelect: () => void = () => {};

    readonly view = new ViewSettings();

    // "connect" tool: the next two taps pick the two ends of a new rope, rod, spring or hinge
    // `first` is the tapped body and the tapped point in that body's frame (world frame for empty space)
    tool: { options: ConnectOptions; first: { body: Body | null; local: Vec2 } | null } | null = null;
    onToolChange: () => void = () => {};

    constructor(scenes: readonly Scene[]) {
        this.scenes = scenes;
        this.scene = scenes[0];
    }

    loadScene(scene: Scene): void {
        this.scene = scene;
        this.world = new World();
        scene.build(this.world);
        this.cancelTool();
        this.clearSelection();
        this.onLoad(scene);
    }

    selectBody(body: Body | null): void {
        this.selectedBody = body;
        this.selectedRope = null;
        this.selectedJoint = null;
        this.onSelect();
    }

    selectRope(rope: Rope | null): void {
        this.selectedBody = null;
        this.selectedRope = rope;
        this.selectedJoint = null;
        this.onSelect();
    }

    selectJoint(joint: Joint | null): void {
        this.selectedBody = null;
        this.selectedRope = null;
        this.selectedJoint = joint;
        this.onSelect();
    }

    get hasSelection(): boolean {
        return this.selectedBody !== null || this.selectedRope !== null || this.selectedJoint !== null;
    }

    startConnect(options: ConnectOptions): void {
        this.tool = { options, first: null };
        this.onToolChange();
    }

    cancelTool(): void {
        if (!this.tool) return;
        this.tool = null;
        this.onToolChange();
    }

    toolHint(): string {
        if (!this.tool) return "";
        return this.tool.first ? "Tap the second point (an object or empty space)" : "Tap the first point (an object or empty space)";
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