import type { Body } from "../engine/body";
import type { Joint } from "../engine/joints";
import type { Rope } from "../engine/rope";
import type { Vec2 } from "../engine/vec2";
import { World } from "../engine/world";
import type { Scene } from "../scenes/scene";
import { buildChainRope, buildPulleyRope, CONNECT_STEPS, DEFAULT_CONNECT, isRouteKind, routeHint, type ConnectOptions } from "./connect";
import { DEFAULT_SPAWN, SPAWN_LABELS, spawnBody, type SpawnSettings } from "./spawn";
import { ViewSettings } from "./viewSettings";
import { Recorder } from "./recorder";
import { Ruler } from "./ruler";
import { Stopwatch } from "./stopwatch";

// What the left mouse button / a finger does on the canvas.
//   none     nothing is pushed; selecting and panning still work
//   force    pull the body with a spring force
//   move     carry the body to the cursor (it keeps colliding and keeps its speed when released)
//   create   place a new object where you click
//   connect  pick two points to join with a rope, rod, spring or hinge
//   measure  pick two points to measure the distance between them
export type MouseMode = "none" | "force" | "move" | "create" | "connect" | "measure";

// Owns the world and the run state (pause, time scale, timing statistics, selection, mouse mode).
export class Simulation {
    world = new World();
    scene: Scene;
    readonly scenes: Scene[];
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

    // measuring tools
    readonly stopwatch = new Stopwatch();
    readonly ruler = new Ruler();
    readonly recorder = new Recorder();
    rulerSnap = true; // ruler ends snap to the centre of the body they are placed on

    prevMode: MouseMode = "none";
    mode: MouseMode = "force";
    onModeChange: () => void = () => {};
    readonly spawn: SpawnSettings = { ...DEFAULT_SPAWN };
    readonly connectOptions: ConnectOptions = { ...DEFAULT_CONNECT };
    // the points tapped so far for a connection: the body and the point in that body's frame (world frame for empty space)
    connectTaps: Array<{ body: Body | null; local: Vec2 }> = [];
    routeMessage = ""; // why a pulley rope could not be made

    onScenesChange: () => void = () => {};

    constructor(scenes: readonly Scene[]) {
        this.scenes = [...scenes];
        this.scene = scenes[0];
    }

    loadScene(scene: Scene): void {
        this.scene = scene;
        this.world = new World();
        scene.build(this.world);
        this.world.stepListeners.push((w) => this.recorder.sample(w, this.ruler.length()));
        this.stopwatch.reset();
        this.ruler.clear();
        this.recorder.setTarget(null);
        this.recorder.clear();
        this.connectTaps = [];
        this.clearSelection();
        this.onLoad(scene);
        this.onModeChange();
    }

    // adds a scene to the list (and optionally opens it)
    addScene(scene: Scene, open = true): void {
        this.scenes.push(scene);
        this.onScenesChange();
        if (open) this.loadScene(scene);
    }

    // replaces a saved scene with a new version of it, keeping its place in the list
    replaceScene(old: Scene, next: Scene): void {
        const i = this.scenes.indexOf(old);
        if (i === -1) return this.addScene(next, false);
        this.scenes[i] = next;
        if (this.scene === old) this.scene = next;
        this.onScenesChange();
    }

    // only scenes saved by the user can be deleted
    removeScene(scene: Scene): void {
        if (!scene.data) return;
        const i = this.scenes.indexOf(scene);
        if (i === -1) return;
        this.scenes.splice(i, 1);
        this.onScenesChange();
        if (this.scene === scene) this.loadScene(this.scenes[Math.max(0, i - 1)]);
    }

    setMode(mode: MouseMode): void {
        this.prevMode = this.mode;
        this.mode = mode;
        this.connectTaps = [];
        this.onModeChange();
    }

    // text shown on screen while a mode needs explaining
    modeHint(): string {
        if (this.mode === "create") return `Tap to place: ${SPAWN_LABELS[this.spawn.shape]}`;
        if (this.mode === "connect") {
            const kind = this.connectOptions.kind;
            if (isRouteKind(kind)) return routeHint(kind, this.connectTaps.length, this.routeMessage);
            return CONNECT_STEPS[kind][this.connectTaps.length] ?? "";
        }
        if (this.mode === "measure") {
            if (this.ruler.a && !this.ruler.b) return "Tap the second point to read the distance";
            return this.ruler.complete ? "Tap to start a new measurement" : "Tap the first point of the measurement";
        }
        return "";
    }

    // a rope is being tapped point by point (Done and Cancel are offered)
    get routeActive(): boolean {
        return this.mode === "connect" && isRouteKind(this.connectOptions.kind) && this.connectTaps.length > 0;
    }

    // One more point of a rope route. Tapping the last point again finishes the rope.
    addRoutePoint(body: Body | null, local: Vec2): void {
        const here = body ? body.toWorld(local) : local;
        const prev = this.connectTaps[this.connectTaps.length - 1];
        if (prev) {
            const before = prev.body ? prev.body.toWorld(prev.local) : prev.local;
            if (prev.body === body && before.dist(here) < 0.02) {
                if (this.connectTaps.length >= 2) this.finishRoute(); // the same tap twice: that was the last point
                return;
            }
        }
        this.routeMessage = "";
        this.connectTaps.push({ body, local });
        this.onModeChange();
    }

    // makes the rope from the points tapped so far
    finishRoute(): void {
        if (!this.routeActive) return;
        const kind = this.connectOptions.kind;
        if (kind === "pulley") {
            const result = buildPulleyRope(this.world, this.connectTaps);
            if ("error" in result) return this.failRoute(result.error);
            this.setMode("none");
            this.selectJoint(result.joint);
        } else {
            const result = buildChainRope(this.world, this.connectTaps, this.connectOptions);
            if ("error" in result) return this.failRoute(result.error);
            this.setMode("none");
            this.selectRope(result.rope);
        }
    }

    private failRoute(message: string): void {
        this.routeMessage = message;
        this.onModeChange();
    }

    cancelRoute(): void {
        this.connectTaps = [];
        this.routeMessage = "";
        this.onModeChange();
    }

    placeBody(point: Vec2): Body {
        return spawnBody(this.world, this.spawn, point);
    }

    selectBody(body: Body | null): void {
        this.selectedBody = body;
        this.selectedRope = null;
        this.selectedJoint = null;
        if (body && !body.isStatic) this.recorder.setTarget(body);
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