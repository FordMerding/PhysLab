import type { Body } from "../engine/body";
import type { World } from "../engine/world";
import type { Camera } from "./camera";

const GRID_MIN_PIXELS = 60;

function niceStep(min: number): number {
    const p = 10 ** Math.floor(Math.log10(min));
    for (const m of [1, 2, 5, 10]) if (m * p >= min) return m * p;
    return 10 * p;
}

export class Renderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly camera: Camera;
    private dpr = 1;

    constructor(canvas: HTMLCanvasElement, camera: Camera) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.camera = camera;
    }

    resize(): void {
        this.dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.canvas.width = Math.round(w * this.dpr);
        this.canvas.height = Math.round(h * this.dpr);
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        this.camera.setViewport(w, h);
    }

    draw(world: World, selected: Body | null = null): void {
        const ctx = this.ctx;
        const { camera: cam, dpr } = this;
        const z = cam.zoom;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // world meters (Y up) -> device pixels
        ctx.setTransform(
            dpr * z,
            0,
            0,
            -dpr * z,
            dpr * (cam.width / 2 - z * cam.center.x),
            dpr * (cam.height / 2 + z * cam.center.y)
        );
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        this.drawGrid();
        for (const b of world.bodies) if (b.shape.type === "plane") this.drawPlane(b);
        this.drawJoints(world);

        const sorted = world.bodies.filter((b) => b.visible && b.shape.type !== "plane").sort((p, q) => p.z - q.z);
        for (const b of sorted) this.drawBody(b);
        if (selected) this.drawSelection(selected);
    }

    private get px(): number {
        return 1 / this.camera.zoom;
    }

    private drawGrid(): void {
        const ctx = this.ctx;
        const px = this.px;
        const step = niceStep(GRID_MIN_PIXELS / this.camera.zoom);
        const v = this.camera.visibleBounds();

        ctx.lineWidth = px;
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath();
        for (let x = Math.floor(v.left / step) * step; x <= v.right; x += step) {
            ctx.moveTo(x, v.bottom);
            ctx.lineTo(x, v.top);
        }
        for (let y = Math.floor(v.bottom / step) * step; y <= v.top; y += step) {
            ctx.moveTo(v.left, y);
            ctx.lineTo(v.right, y);
        }
        ctx.stroke();

        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.beginPath();
        ctx.moveTo(0, v.bottom);
        ctx.lineTo(0, v.top);
        ctx.moveTo(v.left, 0);
        ctx.lineTo(v.right, 0);
        ctx.stroke();
    }

    private drawJoints(world: World): void {
        const ctx = this.ctx;
        const px = this.px;
        for (const j of world.joints) {
            if (!j.visible) continue;
            const [p, q] = j.anchors();
            ctx.strokeStyle = j.color;
            ctx.lineWidth = j.lineWidth > 0 ? j.lineWidth : 2 * px;
            ctx.setLineDash(j.dashed ? [4 * px, 4 * px] : []);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    private drawPlane(b: Body): void {
        if (b.shape.type !== "plane") return;
        const { normal, offset } = b.shape;
        const origin = normal.mul(offset);
        const t = normal.perp().mul(1e5);
        const ctx = this.ctx;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 4 * this.px;
        ctx.beginPath();
        ctx.moveTo(origin.x + t.x, origin.y + t.y);
        ctx.lineTo(origin.x - t.x, origin.y - t.y);
        ctx.stroke();
    }

    private tracePath(b: Body): void {
        const ctx = this.ctx;
        ctx.beginPath();
        if (b.shape.type === "circle") {
            ctx.arc(b.pos.x, b.pos.y, b.shape.radius, 0, Math.PI * 2);
        } else {
            const v = b.worldVertices();
            ctx.moveTo(v[0].x, v[0].y);
            for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
            ctx.closePath();
        }
    }

    private drawBody(b: Body): void {
        const ctx = this.ctx;
        ctx.fillStyle = b.color;
        this.tracePath(b);
        ctx.fill();

        if (b.shape.type === "circle") {
            const r = b.shape.radius;
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.lineWidth = 2 * this.px;
            ctx.beginPath();
            ctx.moveTo(b.pos.x, b.pos.y);
            ctx.lineTo(b.pos.x + Math.cos(b.angle) * r, b.pos.y + Math.sin(b.angle) * r);
            ctx.stroke();
        }
    }

    private drawSelection(b: Body): void {
        if (b.shape.type === "plane") return;
        const ctx = this.ctx;
        ctx.strokeStyle = "#ffd54a";
        ctx.lineWidth = 2 * this.px;
        this.tracePath(b);
        ctx.stroke();
    }
}