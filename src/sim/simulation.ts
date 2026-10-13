import type { Body } from "../engine/body";
import type { Joint } from "../engine/joints";
import type { Rope } from "../engine/rope";
import type { Vec2 } from "../engine/vec2";
import { World } from "../engine/world";
import type { Scene } from "../scenes/scene";
import { DEFAULT_CONNECT, type ConnectOptions } from "./connect";
import { DEFAULT_SPAWN, SPAWN_LABELS, spawnBody, type SpawnSettings } from "./spawn";
import { ViewSettings } from "./viewSettings";

// What the left mouse button / a finger does on the canvas.
//   none     nothing is pushed; selecting and panning still work
//   force    pull the body with a spring force
//   move     carry the body to the cursor (it keeps colliding and keeps its speed when released)
//   create   place a new object where you click
//   connect  pick two points to join with a rope, rod, spring or hinge
export type MouseMode = "none" | "force" | "move" | "create" | "connect";

// Owns the world and the run state (pause, time scale, timing statistics, selection, mouse mode).
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

    mode: MouseMode = "force";
    onModeChange: () => void = () => {};
    readonly spawn: SpawnSettings = { ...DEFAULT_SPAWN };
    readonly connectOptions: ConnectOptions = { ...DEFAULT_CONNECT };
    // first tapped point of a connection: the body and the point in that body's frame (world frame for empty space)
    connectFirst: { body: Body | null; local: Vec2 } | null = null;

    constructor(scenes: readonly Scene[]) {
        this.scenes = scenes;
        this.scene = scenes[0];
    }

    loadScene(scene: Scene): void {
        this.scene = scene;
        this.world = new World();
        scene.build(this.world);
        this.connectFirst = null;
        this.clearSelection();
        this.onLoad(scene);
        this.onModeChange();
    }

    setMode(mode: MouseMode): void {
        this.mode = mode;
        this.connectFirst = null;
        this.onModeChange();
    }

    // text shown on screen while a mode needs explaining
    modeHint(): string {
        if (this.mode === "create") return `Tap to place: ${SPAWN_LABELS[this.spawn.shape]}`;
        if (this.mode === "connect") {
            return this.connectFirst ? "Tap the second point (an object or empty space)" : "Tap the first point (an object or empty space)";
        }
        return "";
    }

    placeBody(point: Vec2): Body {
        return spawnBody(this.world, this.spawn, point);
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