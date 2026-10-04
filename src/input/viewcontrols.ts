import { Vec2 } from "../engine/vec2";
import { MouseJoint } from "../engine/joints";
import type { Body } from "../engine/body";
import type { World } from "../engine/world";
import type { Camera } from "../render/camera";

const MIN_STIFFNESS = 10;
const MAX_STIFFNESS = 5000;
const PICK_MARGIN_PX = 6;

// Left mouse: select and drag bodies. Right/middle mouse: pan. Wheel: zoom.
// Shift + wheel: mouse pull stiffness.
export class ViewControls {
    selected: Body | null = null;
    mouseStiffness = 400;
    onSelect: (body: Body | null) => void = () => {};

    private readonly canvas: HTMLCanvasElement;
    private readonly world: World;
    private readonly camera: Camera;
    private joint: MouseJoint | null = null;
    private panning = false;
    private screen: Vec2 = Vec2.ZERO;

    constructor(canvas: HTMLCanvasElement, world: World, camera: Camera) {
        this.canvas = canvas;
        this.world = world;
        this.camera = camera;

        canvas.addEventListener("mousedown", (e) => this.onDown(e));
        canvas.addEventListener("contextmenu", (e) => e.preventDefault());
        canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
        window.addEventListener("mousemove", (e) => this.onMove(e));
        window.addEventListener("mouseup", (e) => this.onUp(e));
    }

    select(body: Body | null): void {
        this.selected = body;
        this.onSelect(body);
    }

    private pointer(e: MouseEvent): Vec2 {
        const r = this.canvas.getBoundingClientRect();
        return new Vec2(e.clientX - r.left, e.clientY - r.top);
    }

    private onDown(e: MouseEvent): void {
        this.screen = this.pointer(e);
        if (e.button === 0) {
            const p = this.camera.screenToWorld(this.screen);
            const body = this.world.pickAt(p, PICK_MARGIN_PX / this.camera.zoom);
            this.select(body && body.visible ? body : null);
            if (body) {
                const pullMass = this.world.connectedMass(body);
                this.joint = this.world.addJoint(new MouseJoint(body, p, this.mouseStiffness, undefined, pullMass));
            }
        } else {
            e.preventDefault();
            this.panning = true;
        }
    }

    private onMove(e: MouseEvent): void {
        const next = this.pointer(e);
        if (this.panning) this.camera.panByScreen(next.x - this.screen.x, next.y - this.screen.y);
        this.screen = next;
        this.joint?.setTarget(this.camera.screenToWorld(next));
    }

    private onUp(e: MouseEvent): void {
        if (e.button === 0) {
            if (!this.joint) return;
            this.world.removeJoint(this.joint);
            this.joint = null;
        } else {
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