import { Vec2 } from "../engine/vec2";
import { FollowJoint, MouseJoint } from "../engine/joints";
import { anchorAt, connect } from "../sim/connect";
import type { Simulation } from "../sim/simulation";
import type { Camera } from "../render/camera";

const MIN_STIFFNESS = 10;
const MAX_STIFFNESS = 5000;
const PICK_MARGIN_PX = 8;

// Pointer input (mouse, touch, pen). What the primary button does depends on `sim.mode`:
//   none: select, pan   force: pull bodies   move: carry bodies   create: place objects   connect: join two points
// Always: right/middle button pans, wheel or two-finger pinch zooms, Shift + wheel changes the pull stiffness.
export class ViewControls {
    mouseStiffness = 400;

    private readonly canvas: HTMLCanvasElement;
    private readonly sim: Simulation;
    private readonly camera: Camera;
    private readonly pointers = new Map<number, Vec2>();
    private joint: MouseJoint | FollowJoint | null = null;
    private panning = false;
    private pinchDistance = 1;
    private pinchCenter: Vec2 = Vec2.ZERO;
    private screen: Vec2 = Vec2.ZERO;

    constructor(canvas: HTMLCanvasElement, sim: Simulation, camera: Camera) {
        this.canvas = canvas;
        this.sim = sim;
        this.camera = camera;

        canvas.style.touchAction = "none";
        canvas.addEventListener("pointerdown", (e) => this.onDown(e));
        canvas.addEventListener("pointermove", (e) => this.onMove(e));
        canvas.addEventListener("pointerup", (e) => this.onUp(e));
        canvas.addEventListener("pointercancel", (e) => this.onUp(e));
        canvas.addEventListener("contextmenu", (e) => e.preventDefault());
        canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    }

    pointerWorld(): Vec2 {
        return this.camera.screenToWorld(this.screen);
    }

    // forgets the grab; call when the world is replaced
    release(): void {
        this.joint = null;
        this.panning = false;
        this.pointers.clear();
    }

    private pointer(e: MouseEvent): Vec2 {
        const r = this.canvas.getBoundingClientRect();
        return new Vec2(e.clientX - r.left, e.clientY - r.top);
    }

    private drop(): void {
        if (this.joint instanceof FollowJoint) this.joint.release();
        if (this.joint) this.sim.world.removeJoint(this.joint);
        this.joint = null;
    }

    private onDown(e: PointerEvent): void {
        this.canvas.setPointerCapture(e.pointerId);
        const p = this.pointer(e);
        this.pointers.set(e.pointerId, p);
        this.screen = p;

        if (this.pointers.size === 2) return this.beginPinch();
        if (this.pointers.size > 2) return;
        if (e.button !== 0) {
            e.preventDefault();
            this.panning = true;
            return;
        }

        const point = this.camera.screenToWorld(p);
        const margin = PICK_MARGIN_PX / this.camera.zoom;
        const sim = this.sim;
        if (sim.mode === "create") {
            sim.placeBody(point);
            return;
        }
        if (sim.mode === "connect") return this.connectTap(point, margin);

        const world = sim.world;
        const body = world.pickAt(point, margin, true);
        if (!body) {
            sim.clearSelection();
            this.panning = true;
            return;
        }
        // rope nodes are invisible: tapping one selects its rope
        if (body.visible) sim.selectBody(body);
        else sim.selectRope(world.ropes.find((r) => r.nodes.includes(body)) ?? null);

        const grabbing = sim.mode === "force" || sim.mode === "move";
        if (!grabbing || body.isStatic) {
            this.panning = true;
        } else if (sim.mode === "force") {
            this.joint = world.addJoint(new MouseJoint(body, point, this.mouseStiffness, undefined, world.connectedMass(body)));
        } else {
            this.joint = world.addJoint(new FollowJoint(body, point));
        }
    }

    private connectTap(point: Vec2, margin: number): void {
        const sim = this.sim;
        const body = sim.world.pickAt(point, margin, true);
        const picked = body && body.visible ? body : null;
        const first = sim.connectFirst;

        if (!first) {
            sim.connectFirst = { body: picked, local: picked ? picked.toLocal(point) : point };
            sim.onModeChange();
            return;
        }
        if (picked && picked === first.body) return;

        const world = sim.world;
        const a = anchorAt(world, first.body ? first.body.toWorld(first.local) : first.local, first.body);
        const b = anchorAt(world, point, picked);
        const made = connect(world, a, b, sim.connectOptions);
        sim.setMode("none");
        if (made.rope) sim.selectRope(made.rope);
        else if (made.joint) sim.selectJoint(made.joint);
    }

    private beginPinch(): void {
        this.drop();
        this.panning = false;
        const [a, b] = [...this.pointers.values()];
        this.pinchDistance = Math.max(1, a.dist(b));
        this.pinchCenter = a.add(b).div(2);
    }

    private onMove(e: PointerEvent): void {
        const next = this.pointer(e);
        const previous = this.pointers.get(e.pointerId);
        this.screen = next;
        if (!previous) return;
        this.pointers.set(e.pointerId, next);

        if (this.pointers.size === 2) {
            const [a, b] = [...this.pointers.values()];
            const distance = Math.max(1, a.dist(b));
            const center = a.add(b).div(2);
            this.camera.zoomAt(center, distance / this.pinchDistance);
            this.camera.panByScreen(center.x - this.pinchCenter.x, center.y - this.pinchCenter.y);
            this.pinchDistance = distance;
            this.pinchCenter = center;
        } else if (this.panning) {
            this.camera.panByScreen(next.x - previous.x, next.y - previous.y);
        } else if (this.joint) {
            this.joint.setTarget(this.camera.screenToWorld(next));
        }
    }

    private onUp(e: PointerEvent): void {
        this.pointers.delete(e.pointerId);
        if (this.pointers.size === 0) {
            this.drop();
            this.panning = false;
        }
    }

    private onWheel(e: WheelEvent): void {
        e.preventDefault();
        if (e.shiftKey) {
            const factor = e.deltaY < 0 || e.deltaX < 0 ? 1.15 : 1 / 1.15;
            this.mouseStiffness = Math.min(MAX_STIFFNESS, Math.max(MIN_STIFFNESS, this.mouseStiffness * factor));
            if (this.joint instanceof MouseJoint) this.joint.setStiffness(this.mouseStiffness);
            return;
        }
        this.screen = this.pointer(e);
        this.camera.zoomAt(this.screen, Math.exp(-e.deltaY * 0.001));
        this.joint?.setTarget(this.camera.screenToWorld(this.screen));
    }
}