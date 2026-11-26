import type { Body } from "../engine/body";
import type { World } from "../engine/world";

// Everything the Measure tab can plot or export, per sample. SI units.
export interface Sample {
    t: number; // time since recording started, s
    x: number; // position, m
    y: number;
    dist: number; // path length travelled, m
    disp: number; // distance from the starting point, m
    vx: number; // velocity, m/s
    vy: number;
    speed: number;
    ax: number; // acceleration, m/s^2
    ay: number;
    acc: number;
    fx: number; // force from joints and contacts (the dynamometer reading), N
    fy: number;
    force: number;
    ke: number; // kinetic energy, J
    pe: number; // potential energy m g h (h measured from y = 0), J
    e: number; // total mechanical energy, J
    omega: number; // angular velocity, rad/s
    ruler: number; // ruler length, m (NaN when there is none)
}

export type ChannelId = keyof Sample;

export interface Channel {
    id: ChannelId;
    label: string;
    unit: string;
}

export const CHANNELS: readonly Channel[] = [
    { id: "t", label: "Time", unit: "s" },
    { id: "x", label: "Position x", unit: "m" },
    { id: "y", label: "Position y", unit: "m" },
    { id: "dist", label: "Distance travelled", unit: "m" },
    { id: "disp", label: "Displacement from start", unit: "m" },
    { id: "vx", label: "Velocity x", unit: "m/s" },
    { id: "vy", label: "Velocity y", unit: "m/s" },
    { id: "speed", label: "Speed", unit: "m/s" },
    { id: "ax", label: "Acceleration x", unit: "m/s²" },
    { id: "ay", label: "Acceleration y", unit: "m/s²" },
    { id: "acc", label: "Acceleration", unit: "m/s²" },
    { id: "fx", label: "Force x", unit: "N" },
    { id: "fy", label: "Force y", unit: "N" },
    { id: "force", label: "Force (dynamometer)", unit: "N" },
    { id: "ke", label: "Kinetic energy", unit: "J" },
    { id: "pe", label: "Potential energy", unit: "J" },
    { id: "e", label: "Total energy", unit: "J" },
    { id: "omega", label: "Angular velocity", unit: "rad/s" },
    { id: "ruler", label: "Ruler length", unit: "m" },
];

export const channel = (id: ChannelId): Channel => CHANNELS.find((c) => c.id === id)!;

const SAMPLE_EVERY_STEPS = 2; // 60 samples per second at the default 120 Hz step
const MAX_SAMPLES = 7200; // two minutes

// Records the motion of one body (the selected one). Every value is averaged over the steps between two
// samples, so the force is the same impulse-per-step reading the vectors show, not a single noisy step.
export class Recorder {
    body: Body | null = null;
    recording = true;
    samples: Sample[] = [];

    private started = false;
    private t0 = 0;
    private x0 = 0;
    private y0 = 0;
    private path = 0;
    private lastX = 0;
    private lastY = 0;
    private steps = 0;
    private sumAx = 0;
    private sumAy = 0;
    private sumFx = 0;
    private sumFy = 0;

    // a new target starts a new recording
    setTarget(body: Body | null): void {
        if (body === this.body) return;
        this.body = body;
        this.clear();
    }

    clear(): void {
        this.samples = [];
        this.started = false;
        this.path = 0;
        this.resetWindow();
    }

    private resetWindow(): void {
        this.steps = 0;
        this.sumAx = this.sumAy = this.sumFx = this.sumFy = 0;
    }

    // call after every fixed physics step
    sample(world: World, rulerLength: number | null): void {
        const b = this.body;
        if (!b || !this.recording) return;
        if (!world.bodies.includes(b)) {
            this.setTarget(null);
            return;
        }
        const dt = world.fixedDt;
        if (!this.started) {
            this.started = true;
            this.t0 = world.time - dt;
            this.x0 = this.lastX = b.pos.x;
            this.y0 = this.lastY = b.pos.y;
        }
        this.path += Math.hypot(b.pos.x - this.lastX, b.pos.y - this.lastY);
        this.lastX = b.pos.x;
        this.lastY = b.pos.y;
        this.sumAx += b.accX;
        this.sumAy += b.accY;
        this.sumFx += b.constraintForceX;
        this.sumFy += b.constraintForceY;
        if (++this.steps < SAMPLE_EVERY_STEPS) return;

        const n = this.steps;
        const ax = this.sumAx / n;
        const ay = this.sumAy / n;
        const fx = this.sumFx / n;
        const fy = this.sumFy / n;
        this.resetWindow();

        const g = world.gravity;
        const ke = 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy) + 0.5 * b.inertia * b.angVel * b.angVel;
        const pe = -b.mass * (g.x * b.pos.x + g.y * b.pos.y);
        this.samples.push({
            t: world.time - this.t0,
            x: b.pos.x,
            y: b.pos.y,
            dist: this.path,
            disp: Math.hypot(b.pos.x - this.x0, b.pos.y - this.y0),
            vx: b.vx,
            vy: b.vy,
            speed: Math.hypot(b.vx, b.vy),
            ax,
            ay,
            acc: Math.hypot(ax, ay),
            fx,
            fy,
            force: Math.hypot(fx, fy),
            ke,
            pe,
            e: ke + pe,
            omega: b.angVel,
            ruler: rulerLength ?? NaN,
        });
        if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, MAX_SAMPLES / 10);
    }

    get last(): Sample | null {
        return this.samples.length > 0 ? this.samples[this.samples.length - 1] : null;
    }

    // comma-separated values with a header line "name [unit]"
    toCsv(): string {
        const header = CHANNELS.map((c) => `${c.id} [${c.unit}]`).join(",");
        const rows = this.samples.map((s) => CHANNELS.map((c) => (Number.isNaN(s[c.id]) ? "" : String(s[c.id]))).join(","));
        return [header, ...rows].join("\n") + "\n";
    }
}
