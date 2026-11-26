import { Vec2 } from "./vec2";
import type { Body } from "./body";
import { Joint } from "./joints";

// One stop of an ideal rope: an end tied to a point, a point the rope bends around, or a wheel it wraps.
export interface RouteElement {
    body: Body; // the body the point or wheel is fixed to (a static body for a hook or a fixed pulley)
    local: Vec2; // the point, or the centre of the wheel, in the body's frame
    radius: number; // 0 for an end or a point; the wheel radius otherwise
    wrap: number; // +1: the rope goes counter-clockwise around the wheel, -1: clockwise, 0: no wheel
}

// size of the smoothing of the straight pieces, m (see traceRoute)
const SMOOTH = 0.02;

const TAU = Math.PI * 2;
const mod = (x: number): number => ((x % TAU) + TAU) % TAU;

interface Trace {
    length: number;
    overlap: boolean; // two wheels overlap: no rope can run between them, the shape is meaningless
    deltas: number[]; // wrap angle on each wheel, rad
    points: Vec2[]; // the path of the rope (only when asked for)
}

// The path of a rope through the route: straight tangent lines between the wheels and arcs on them.
// With signed radii k = wrap * radius, the tangent between two circles has direction
//   theta = atan2(d) - asin((k2 - k1) / |d|)   and length   sqrt(|d|^2 - (k2 - k1)^2),
// which covers outer and inner tangents and points (k = 0) in one formula.
// `prev` is the wrap angle from the previous evaluation, so that the angle stays continuous.
export function traceRoute(route: readonly RouteElement[], prev: readonly number[] | null, withPoints = false): Trace {
    const n = route.length;
    const c = route.map((e) => e.body.toWorld(e.local));
    const k = route.map((e) => e.radius * e.wrap);
    const theta: number[] = [];
    const tangents: Array<[Vec2, Vec2]> = [];
    let length = 0;
    let overlap = false;
    for (let i = 0; i < n - 1; i++) {
        const dx = c[i + 1].x - c[i].x;
        const dy = c[i + 1].y - c[i].y;
        const dist = Math.hypot(dx, dy);
        const delta = k[i + 1] - k[i];
        // The exact tangent has length sqrt(d^2 - delta^2), whose slope is infinite when two wheels touch
        // (d = |delta|). A solver that follows an infinite slope injects energy, so the piece is smoothed:
        // sqrt(l^2 + e^2) - e is 0 for l = 0, has a slope below 1, and differs from l by less than e^2 / (2 l).
        const straight = Math.sqrt(Math.max(0, dist * dist - delta * delta));
        const smooth = Math.sqrt(straight * straight + SMOOTH * SMOOTH);
        const th = Math.atan2(dy, dx) - Math.atan2(delta, smooth);
        theta.push(th);
        length += smooth - SMOOTH;
        if (dist < Math.abs(delta) - 1e-9) overlap = true;
        if (withPoints) {
            const lx = -Math.sin(th);
            const ly = Math.cos(th);
            tangents.push([new Vec2(c[i].x - k[i] * lx, c[i].y - k[i] * ly), new Vec2(c[i + 1].x - k[i + 1] * lx, c[i + 1].y - k[i + 1] * ly)]);
        }
    }

    const deltas = new Array<number>(n).fill(0);
    for (let j = 1; j < n - 1; j++) {
        if (k[j] === 0) continue;
        let d = k[j] > 0 ? mod(theta[j] - theta[j - 1]) : mod(theta[j - 1] - theta[j]);
        const p = prev?.[j];
        if (p !== undefined) {
            while (d - p > Math.PI) d -= TAU;
            while (d - p < -Math.PI) d += TAU;
        }
        d = Math.max(0, d); // a rope that left the wheel does not wrap it
        deltas[j] = d;
        length += Math.abs(k[j]) * d;
    }

    const points: Vec2[] = [];
    if (withPoints) {
        points.push(tangents[0][0]);
        for (let j = 1; j < n; j++) {
            const arrive = tangents[j - 1][1];
            points.push(arrive);
            if (j < n - 1) {
                if (deltas[j] > 0) {
                    const a0 = Math.atan2(arrive.y - c[j].y, arrive.x - c[j].x);
                    const sweep = Math.sign(k[j]) * deltas[j];
                    const steps = Math.ceil(deltas[j] / 0.25);
                    for (let s = 1; s < steps; s++) {
                        const a = a0 + (sweep * s) / steps;
                        points.push(new Vec2(c[j].x + Math.abs(k[j]) * Math.cos(a), c[j].y + Math.abs(k[j]) * Math.sin(a)));
                    }
                }
                points.push(tangents[j][0]);
            }
        }
    }
    return { length, overlap, deltas, points };
}

// The wrap direction of every wheel from the shape of the route: the wheel lies on the inside of the bend.
export function wrapDirections(centers: readonly Vec2[]): number[] {
    return centers.map((p, i) => {
        if (i === 0 || i === centers.length - 1) return 0;
        const a = p.sub(centers[i - 1]);
        const b = centers[i + 1].sub(p);
        const cross = a.x * b.y - a.y * b.x;
        return Math.abs(cross) < 1e-9 * (a.len() * b.len() || 1) ? 0 : Math.sign(cross);
    });
}

const EPS = 1e-6;
const MAX_CORRECTION = 0.02; // m per position iteration
const MAX_JUMP = 0.25; // m: the rope cannot change its length by more than this in one substep

// An ideal rope over any number of fixed or movable pulleys: no mass, no stretch, no friction, the same
// tension everywhere. Its length is one constraint,
//     length = sum of the straight pieces + sum of the arcs on the wheels,
// and the force on every body is the derivative of that length with respect to the body's position and
// angle (found numerically). It reproduces the textbook results for any block and tackle.
export class PulleyRope extends Joint {
    readonly route: RouteElement[];
    length: number;
    private deltas: number[];
    private readonly bodies: Body[];
    private jac: Array<[number, number, number]> = [];
    private broken = false; // the shape was invalid: the rope is tied again at its new length once it is valid
    private inactive = false; // the rope does not act in this step
    private lastLength: number | null = null;
    private acc = 0; // accumulated rope impulse, >= 0
    private mass = 0;
    private slack = 0;
    private h = 0;

    constructor(route: RouteElement[], length?: number) {
        const first = route[0];
        const last = route[route.length - 1];
        super(first.body, last.body, first.local, last.local);
        this.route = route;
        this.bodies = [...new Set(route.map((e) => e.body))].filter((b) => b.invMass > 0 || b.invInertia > 0);
        this.deltas = traceRoute(route, null).deltas;
        this.length = length ?? traceRoute(route, this.deltas).length;
        this.color = "#c9a227";
    }

    override polyline(): Vec2[] {
        return traceRoute(this.route, this.deltas, true).points;
    }

    // rope length now; equal to `length` while the rope is taut
    ropeLength(): number {
        return traceRoute(this.route, this.deltas).length;
    }

    // rope tension, N
    tension(): number {
        return this.h > 0 ? this.acc / this.h : 0;
    }

    // Finds how the rope length changes with each body's x, y and angle. Returns the rope's excess length.
    private linearize(): { excess: number; k: number } {
        const base = traceRoute(this.route, this.deltas);
        if (base.overlap) {
            this.jac = this.bodies.map(() => [0, 0, 0]);
            return { excess: 0, k: 0 };
        }
        this.deltas = base.deltas;
        const len = (): number => traceRoute(this.route, this.deltas).length;
        this.jac = this.bodies.map((b) => {
            const p = b.pos;
            const angle = b.angle;
            const d: [number, number, number] = [0, 0, 0];
            b.pos = new Vec2(p.x + EPS, p.y);
            const xp = len();
            b.pos = new Vec2(p.x - EPS, p.y);
            d[0] = (xp - len()) / (2 * EPS);
            b.pos = new Vec2(p.x, p.y + EPS);
            const yp = len();
            b.pos = new Vec2(p.x, p.y - EPS);
            d[1] = (yp - len()) / (2 * EPS);
            b.pos = p;
            b.angle = angle + EPS;
            const ap = len();
            b.angle = angle - EPS;
            d[2] = (ap - len()) / (2 * EPS);
            b.angle = angle;
            return d;
        });
        let k = 0;
        this.bodies.forEach((b, i) => {
            const [jx, jy, jt] = this.jac[i];
            k += (jx * jx + jy * jy) * b.invMass + jt * jt * b.invInertia;
        });
        return { excess: base.length - this.length, k };
    }

    prepare(dt: number): void {
        this.h = dt;
        // Where the rope's shape stops making sense (wheels that overlap, or a mass that swung round a wheel
        // so that the rope would have to lie on the other side of it) the length jumps. Following such a jump
        // would throw bodies about and inject energy, so the rope lets go for that moment. It is tied again,
        // at its new length, when the shape is valid again.
        const base = traceRoute(this.route, this.deltas);
        const jump = this.lastLength !== null && Math.abs(base.length - this.lastLength) > MAX_JUMP;
        this.lastLength = base.length;
        if (base.overlap || jump) {
            this.broken = true;
            this.inactive = true;
            this.acc = 0;
            this.mass = 0;
            this.slack = 0;
            this.jac = this.bodies.map(() => [0, 0, 0]);
            if (!base.overlap) this.deltas = base.deltas;
            return;
        }
        if (this.broken) {
            this.broken = false;
            this.length = Math.max(this.length, base.length);
        }
        this.inactive = false;
        const { excess, k } = this.linearize();
        this.mass = k > 0 ? 1 / k : 0;
        this.slack = excess < 0 ? excess / dt : 0; // slack rope: let it become exactly taut
    }

    private apply(lambda: number): void {
        this.bodies.forEach((b, i) => {
            const [jx, jy, jt] = this.jac[i];
            b.applyImpulseXY(-lambda * jx, -lambda * jy, 0, 0);
            b.angVel += b.invInertia * -lambda * jt;
        });
    }

    warmStart(): void {
        this.apply(this.acc);
    }

    solve(): void {
        let cdot = 0;
        this.bodies.forEach((b, i) => {
            const [jx, jy, jt] = this.jac[i];
            cdot += jx * b.vx + jy * b.vy + jt * b.angVel;
        });
        const next = Math.max(0, this.acc + this.mass * (cdot + this.slack));
        const d = next - this.acc;
        this.acc = next;
        this.apply(d);
    }

    override correctPosition(): void {
        if (this.inactive) return;
        const { excess, k } = this.linearize();
        if (excess <= 0 || k === 0) return;
        // a small step: pulling bodies uphill by position correction adds energy, so it must stay tiny
        const lambda = Math.min(excess, MAX_CORRECTION) / k;
        this.bodies.forEach((b, i) => {
            const [jx, jy, jt] = this.jac[i];
            b.applyPositionShiftXY(-lambda * jx, -lambda * jy, 0, 0);
            b.angle += b.invInertia * -lambda * jt;
        });
    }
}
