import { el } from "./dom";

export interface GraphPoint {
    x: number;
    y: number;
}

const HEIGHT = 120;
const MARGIN = { left: 46, right: 8, top: 8, bottom: 20 };

// "nice" tick values (1, 2, 5 x 10^n) covering [min, max]
function ticks(min: number, max: number, count: number): number[] {
    const span = max - min;
    if (!(span > 0)) return [min];
    const raw = span / count;
    const p = 10 ** Math.floor(Math.log10(raw));
    const step = ([1, 2, 5, 10].find((m) => m * p >= raw) ?? 10) * p;
    const out: number[] = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
    return out;
}

const format = (v: number): string => (v === 0 ? "0" : Math.abs(v) >= 1e4 || Math.abs(v) < 1e-2 ? v.toExponential(1) : String(Number(v.toPrecision(3))));

// A small line chart on a canvas: axes with ticks, auto-scaling, and a cursor that reads out the nearest point.
export class Graph {
    readonly element: HTMLElement;
    private readonly canvas = el("canvas", "graph-canvas");
    private readonly readout = el("div", "graph-readout", " ");
    private points: GraphPoint[] = [];
    private xName = "";
    private yName = "";
    private hover = -1;

    constructor() {
        this.element = el("div", "graph");
        this.canvas.style.height = `${HEIGHT}px`;
        this.element.append(this.canvas, this.readout);
        this.canvas.addEventListener("pointermove", (e) => this.onPointer(e));
        this.canvas.addEventListener("pointerleave", () => {
            this.hover = -1;
            this.paint();
        });
    }

    get visible(): boolean {
        return this.canvas.offsetParent !== null;
    }

    // xName / yName include the unit, e.g. "t, s"
    draw(points: GraphPoint[], xName: string, yName: string): void {
        this.points = points;
        this.xName = xName;
        this.yName = yName;
        this.paint();
    }

    private bounds(): { x0: number; x1: number; y0: number; y1: number } {
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const p of this.points) {
            if (p.x < x0) x0 = p.x;
            if (p.x > x1) x1 = p.x;
            if (p.y < y0) y0 = p.y;
            if (p.y > y1) y1 = p.y;
        }
        if (!Number.isFinite(x0)) return { x0: 0, x1: 1, y0: 0, y1: 1 };
        if (x1 - x0 < 1e-9) x1 = x0 + 1;
        if (y1 - y0 < 1e-9) {
            y0 -= 0.5;
            y1 += 0.5;
        }
        const pad = (y1 - y0) * 0.08;
        return { x0, x1, y0: y0 - pad, y1: y1 + pad };
    }

    private onPointer(e: PointerEvent): void {
        if (this.points.length === 0) return;
        const r = this.canvas.getBoundingClientRect();
        const b = this.bounds();
        const x = b.x0 + ((e.clientX - r.left - MARGIN.left) / (r.width - MARGIN.left - MARGIN.right)) * (b.x1 - b.x0);
        let best = 0;
        let bestD = Infinity;
        this.points.forEach((p, i) => {
            const d = Math.abs(p.x - x);
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        });
        this.hover = best;
        this.paint();
    }

    private paint(): void {
        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas.clientWidth;
        if (w === 0) return;
        if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(HEIGHT * dpr)) {
            this.canvas.width = Math.round(w * dpr);
            this.canvas.height = Math.round(HEIGHT * dpr);
        }
        const ctx = this.canvas.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, HEIGHT);

        const b = this.bounds();
        const pw = w - MARGIN.left - MARGIN.right;
        const ph = HEIGHT - MARGIN.top - MARGIN.bottom;
        const sx = (x: number): number => MARGIN.left + ((x - b.x0) / (b.x1 - b.x0)) * pw;
        const sy = (y: number): number => MARGIN.top + ph - ((y - b.y0) / (b.y1 - b.y0)) * ph;

        ctx.font = "10px system-ui, sans-serif";
        ctx.lineWidth = 1;
        ctx.fillStyle = "#8b91a0";
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        for (const v of ticks(b.y0, b.y1, 4)) {
            const y = Math.round(sy(v)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(MARGIN.left, y);
            ctx.lineTo(w - MARGIN.right, y);
            ctx.stroke();
            ctx.fillText(format(v), MARGIN.left - 4, y);
        }
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        for (const v of ticks(b.x0, b.x1, Math.max(2, Math.floor(pw / 60)))) {
            const x = Math.round(sx(v)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(x, MARGIN.top);
            ctx.lineTo(x, MARGIN.top + ph);
            ctx.stroke();
            ctx.fillText(format(v), x, MARGIN.top + ph + 4);
        }
        ctx.strokeStyle = "#2f333b";
        ctx.strokeRect(MARGIN.left + 0.5, MARGIN.top + 0.5, pw, ph);

        if (this.points.length > 1) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(MARGIN.left, MARGIN.top, pw, ph);
            ctx.clip();
            ctx.strokeStyle = "#4c8dff";
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            let pen = false;
            for (const p of this.points) {
                if (!Number.isFinite(p.y)) {
                    pen = false; // a gap (for example, no ruler yet)
                    continue;
                }
                if (pen) ctx.lineTo(sx(p.x), sy(p.y));
                else ctx.moveTo(sx(p.x), sy(p.y));
                pen = true;
            }
            ctx.stroke();
            ctx.restore();
        }

        const h = this.points[this.hover];
        if (h && Number.isFinite(h.y)) {
            ctx.strokeStyle = "rgba(255,213,74,0.8)";
            ctx.beginPath();
            ctx.moveTo(sx(h.x), MARGIN.top);
            ctx.lineTo(sx(h.x), MARGIN.top + ph);
            ctx.stroke();
            ctx.fillStyle = "#ffd54a";
            ctx.beginPath();
            ctx.arc(sx(h.x), sy(h.y), 3, 0, Math.PI * 2);
            ctx.fill();
            this.readout.textContent = `${this.xName.split(",")[0]} = ${format(h.x)}   ${this.yName.split(",")[0]} = ${format(h.y)}`;
        } else {
            this.readout.textContent = this.points.length === 0 ? "No data: select a moving body" : `${this.yName}  vs  ${this.xName}`;
        }
    }
}
