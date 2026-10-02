import type { Body } from "../engine/body";
import type { World } from "../engine/world";

export class Renderer {
    width = 0;
    height = 0;

    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
    }

    resize(): void {
        const dpr = window.devicePixelRatio || 1;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    draw(world: World): void {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        for (const b of world.bodies) if (b.shape.type === "plane") this.drawPlane(b);

        ctx.lineCap = "round";
        for (const j of world.joints) {
            if (!j.visible) continue;
            const [p, q] = j.anchors();
            ctx.strokeStyle = j.color;
            ctx.lineWidth = j.lineWidth;
            ctx.setLineDash(j.dashed ? [4, 4] : []);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        const sorted = world.bodies.filter((b) => b.visible && b.shape.type !== "plane").sort((p, q) => p.z - q.z);
        for (const b of sorted) this.drawBody(b);
    }

    private drawPlane(b: Body): void {
        if (b.shape.type !== "plane") return;
        const { normal, offset } = b.shape;
        const origin = normal.mul(offset);
        const t = normal.perp().mul(4000);
        const ctx = this.ctx;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(origin.x + t.x, origin.y + t.y);
        ctx.lineTo(origin.x - t.x, origin.y - t.y);
        ctx.stroke();
    }

    private drawBody(b: Body): void {
        const ctx = this.ctx;
        ctx.fillStyle = b.color;
        ctx.beginPath();

        if (b.shape.type === "circle") {
            const r = b.shape.radius;
            ctx.arc(b.pos.x, b.pos.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(b.pos.x, b.pos.y);
            ctx.lineTo(b.pos.x + Math.cos(b.angle) * r, b.pos.y + Math.sin(b.angle) * r);
            ctx.stroke();
        } else {
            const v = b.worldVertices();
            ctx.moveTo(v[0].x, v[0].y);
            for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
            ctx.closePath();
            ctx.fill();
        }
    }
}