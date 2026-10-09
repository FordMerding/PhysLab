import { Vec2 } from "../engine/vec2";
import { MouseJoint } from "../engine/joints";
import { anchorAt, connect } from "../sim/connect";
import type { Simulation } from "../sim/simulation";
import type { Camera } from "../render/camera";

const MIN_STIFFNESS = 10;
const MAX_STIFFNESS = 5000;
const PICK_MARGIN_PX = 8;

// Pointer input (mouse, touch, pen).
//   one pointer on a body: select and drag it;  on empty space: deselect and pan
//   right/middle button: pan;  wheel or two-finger pinch: zoom;  Shift + wheel: mouse pull stiffness
// While the connect tool is active, taps pick the two ends of the new connection instead.
export class ViewControls {
    mouseStiffness = 400;

    private readonly canvas: HTMLCanvasElement;
    private readonly sim: Simulation;
    private readonly camera: Camera;
    private readonly pointers = new Map<number, Vec2>();
    private joint: MouseJoint | null = null;
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
        if (this.sim.tool) return this.toolTap(point, margin);

        const world = this.sim.world;
        const body = world.pickAt(point, margin, true);
        if (!body) {
            this.sim.clearSelection();
            this.panning = true;
        } else if (!body.visible) {
            // rope nodes are invisible: tapping one selects its rope
            this.sim.selectRope(world.ropes.find((r) => r.nodes.includes(body)) ?? null);
            this.joint = world.addJoint(new MouseJoint(body, point, this.mouseStiffness, undefined, world.connectedMass(body)));
        } else {
            this.sim.selectBody(body);
            if (body.isStatic) this.panning = true;
            else this.joint = world.addJoint(new MouseJoint(body, point, this.mouseStiffness, undefined, world.connectedMass(body)));
        }
    }

    private toolTap(point: Vec2, margin: number): void {
        const tool = this.sim.tool;
        if (!tool) return;
        const body = this.sim.world.pickAt(point, margin, true);
        const picked = body && body.visible ? body : null;
        const here = { body: picked, local: picked ? picked.toLocal(point) : point };

        if (!tool.first) {
            tool.first = here;
            this.sim.onToolChange();
            return;
        }
        if (picked && picked === tool.first.body) return;

        const world = this.sim.world;
        const a = anchorAt(world, tool.first.body ? tool.first.body.toWorld(tool.first.local) : tool.first.local, tool.first.body);
        const b = anchorAt(world, point, picked);
        const made = connect(world, a, b, tool.options);
        this.sim.cancelTool();
        if (made.rope) this.sim.selectRope(made.rope);
        else if (made.joint) this.sim.selectJoint(made.joint);
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
            this.joint?.setStiffness(this.mouseStiffness);
            return;
        }
        this.screen = this.pointer(e);
        this.camera.zoomAt(this.screen, Math.exp(-e.deltaY * 0.001));
        this.joint?.setTarget(this.camera.screenToWorld(this.screen));
    }
}