import { Vec2 } from "../engine/vec2";
import type { Body } from "../engine/body";
import type { Joint } from "../engine/joints";
import type { Rope } from "../engine/rope";
import type { Simulation } from "../sim/simulation";
import type { Camera } from "./camera";

const GRID_MIN_PIXELS = 60;
const VELOCITY_COLOR = "#66bb6a";
const WEIGHT_COLOR = "#ff7043";
const CONTACT_COLOR = "#4fc3f7";
const NET_COLOR = "#ffffff";
const AUTO_VELOCITY_PX = 70; // longest velocity arrow with auto-scale
const AUTO_FORCE_PX = 90; // longest force arrow with auto-scale

interface Label {
    text: string;
    at: Vec2;
    color: string;
}

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

    draw(sim: Simulation): void {
        const ctx = this.ctx;
        const { camera: cam, dpr } = this;
        const world = sim.world;
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

        if (sim.view.grid) this.drawGrid();
        for (const b of world.bodies) if (b.shape.type === "plane") this.drawPlane(b);
        if (sim.selectedRope) this.drawRopeHighlight(sim.selectedRope);
        this.drawJoints(sim);

        const sorted = world.bodies.filter((b) => b.visible && b.shape.type !== "plane").sort((p, q) => p.z - q.z);
        for (const b of sorted) this.drawBody(b);
        if (sim.selectedBody) this.drawSelection(sim.selectedBody);

        if (sim.mode === "connect" && sim.connectFirst) this.drawPendingAnchor(sim.connectFirst.body, sim.connectFirst.local);
        const labels = this.drawVectors(sim);
        this.drawLabels(labels);
    }

    private drawPendingAnchor(body: Body | null, local: Vec2): void {
        const p = body ? body.toWorld(local) : local;
        const ctx = this.ctx;
        ctx.strokeStyle = "#4c8dff";
        ctx.lineWidth = 2 * this.px;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7 * this.px, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Velocity and force arrows; returns their value labels (drawn later in screen space).
    private drawVectors(sim: Simulation): Label[] {
        const view = sim.view;
        if (!view.velocity && !view.forces && !view.netForce) return [];
        const g = sim.world.gravity;
        const shown: Body[] = view.selectedOnly
            ? sim.selectedBody && !sim.selectedBody.isStatic
                ? [sim.selectedBody]
                : []
            : sim.world.bodies.filter((b) => b.visible && !b.isStatic);

        const weight = (b: Body): Vec2 => g.mul(b.mass);
        const contact = (b: Body): Vec2 => new Vec2(b.smoothForceX, b.smoothForceY);

        let maxV = 0;
        let maxF = 0;
        for (const b of shown) {
            maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
            const w = weight(b);
            const c = contact(b);
            maxF = Math.max(maxF, w.len(), c.len(), w.add(c).len());
        }
        const vPx = view.autoScale ? (maxV > 1e-9 ? AUTO_VELOCITY_PX / maxV : 0) : view.velocityScale;
        const fPx = view.autoScale ? (maxF > 1e-9 ? AUTO_FORCE_PX / maxF : 0) : view.forceScale;

        const labels: Label[] = [];
        const arrow = (from: Vec2, v: Vec2, pxPerUnit: number, color: string, unit: string): void => {
            const length = v.len() * pxPerUnit;
            if (length < 2) return;
            const tip = from.add(v.mul(pxPerUnit * this.px));
            this.drawArrow(from, tip, color);
            if (view.labels) labels.push({ text: `${v.len().toPrecision(3)} ${unit}`, at: tip, color });
        };
        for (const b of shown) {
            if (view.velocity) arrow(b.pos, new Vec2(b.vx, b.vy), vPx, VELOCITY_COLOR, "m/s");
            if (view.forces) {
                arrow(b.pos, weight(b), fPx, WEIGHT_COLOR, "N");
                arrow(b.pos, contact(b), fPx, CONTACT_COLOR, "N");
            }
            if (view.netForce) arrow(b.pos, weight(b).add(contact(b)), fPx, NET_COLOR, "N");
        }
        return labels;
    }

    private drawArrow(from: Vec2, to: Vec2, color: string): void {
        const ctx = this.ctx;
        const px = this.px;
        const d = to.sub(from);
        const angle = Math.atan2(d.y, d.x);
        const head = Math.min(9 * px, d.len() * 0.6);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2 * px;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - Math.cos(angle - 0.45) * head, to.y - Math.sin(angle - 0.45) * head);
        ctx.lineTo(to.x - Math.cos(angle + 0.45) * head, to.y - Math.sin(angle + 0.45) * head);
        ctx.closePath();
        ctx.fill();
    }

    private drawLabels(labels: Label[]): void {
        if (labels.length === 0) return;
        const ctx = this.ctx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.font = "11px system-ui, sans-serif";
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        for (const l of labels) {
            const p = this.camera.worldToScreen(l.at);
            ctx.strokeStyle = "rgba(0,0,0,0.7)";
            ctx.strokeText(l.text, p.x + 6, p.y - 6);
            ctx.fillStyle = l.color;
            ctx.fillText(l.text, p.x + 6, p.y - 6);
        }
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

    private drawJoints(sim: Simulation): void {
        const ctx = this.ctx;
        const px = this.px;
        for (const j of sim.world.joints) {
            if (!j.visible) continue;
            const [p, q] = j.anchors();
            if (j === sim.selectedJoint) this.strokeJoint(j, p, q, "rgba(255, 213, 74, 0.55)", 8 * px);
            this.strokeJoint(j, p, q, j.color, j.lineWidth > 0 ? j.lineWidth : 2 * px);
        }
        ctx.setLineDash([]);
    }

    private strokeJoint(j: Joint, p: Vec2, q: Vec2, color: string, width: number): void {
        const ctx = this.ctx;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(j.dashed ? [4 * this.px, 4 * this.px] : []);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
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

    private drawRopeHighlight(rope: Rope): void {
        const ctx = this.ctx;
        ctx.strokeStyle = "rgba(255, 213, 74, 0.45)";
        ctx.lineWidth = rope.radius * 2 + 8 * this.px;
        ctx.beginPath();
        rope.nodes.forEach((n, i) => (i === 0 ? ctx.moveTo(n.pos.x, n.pos.y) : ctx.lineTo(n.pos.x, n.pos.y)));
        ctx.stroke();
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