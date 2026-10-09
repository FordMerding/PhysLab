import { Vec2 } from "./vec2";
import { Body } from "./body";
import { circle } from "./shapes";
import { DistanceJoint, Joint, PinJoint } from "./joints";
import { ALL_LAYERS, ROPE_LAYER } from "./filter";
import type { World } from "./world";

export interface RopeOptions {
    name?: string;
    radius?: number; // m
    spacing?: number; // m, distance between nodes along the rope
    nodeMass?: number; // kg
    friction?: number;
    damping?: number; // 1/s, internal damping between neighbouring nodes (calms the rope without slowing its fall)
    color?: string;
}

// A chain of small circles joined by max-distance links: inextensible, free to go slack,
// and it collides with everything except other rope nodes (see ROPE_LAYER).
// To keep a body from fighting its own pin, give it mask: ALL_LAYERS & ~ROPE_LAYER.
// Damps the relative velocity of neighbouring nodes, so zig-zag motion dies out
// while the rope as a whole still swings and falls freely.
class NodeDamper extends Joint {
    private readonly nodes: readonly Body[];
    rate: number;

    constructor(nodes: readonly Body[], rate: number) {
        super(nodes[0], nodes[1]);
        this.nodes = nodes;
        this.rate = rate;
        this.visible = false;
    }

    prepare(dt: number): void {
        const k = 1 - Math.exp(-this.rate * dt);
        for (let i = 0; i < this.nodes.length - 1; i++) {
            const a = this.nodes[i];
            const b = this.nodes[i + 1];
            const w = a.invMass + b.invMass;
            if (w === 0) continue;
            const jx = ((b.vx - a.vx) * k) / w;
            const jy = ((b.vy - a.vy) * k) / w;
            a.vx += jx * a.invMass;
            a.vy += jy * a.invMass;
            b.vx -= jx * b.invMass;
            b.vy -= jy * b.invMass;
        }
    }

    warmStart(): void {}
    solve(): void {}
}

export class Rope {
    readonly nodes: Body[] = [];
    readonly joints: Joint[] = [];
    readonly restLength: number;
    readonly radius: number;
    name: string;
    private damper: NodeDamper | null = null;

    constructor(path: readonly Vec2[], o: RopeOptions = {}) {
        const radius = o.radius ?? 0.04;
        this.radius = radius;
        this.name = o.name ?? "Rope";
        const spacing = o.spacing ?? radius * 2;
        const color = o.color ?? "#c9a227";

        let total = 0;
        for (let i = 1; i < path.length; i++) total += path[i].dist(path[i - 1]);
        const segments = Math.max(1, Math.round(total / spacing));
        const segLen = total / segments;
        this.restLength = total;

        for (let i = 0; i <= segments; i++) {
            const p = pointAlong(path, i * segLen);
            this.nodes.push(
                new Body(circle(radius), {
                    x: p.x,
                    y: p.y,
                    mass: o.nodeMass ?? 0.05,
                    friction: o.friction ?? 0.02,
                    restitution: 0,
                    category: ROPE_LAYER,
                    mask: ALL_LAYERS & ~ROPE_LAYER,
                    color,
                    visible: false,
                })
            );
        }

        for (let i = 0; i < segments; i++) {
            const link = new DistanceJoint(this.nodes[i], this.nodes[i + 1], { length: segLen, mode: "max" });
            link.color = color;
            link.lineWidth = radius * 2;
            link.listed = false;
            this.joints.push(link);
        }
        if (this.nodes.length > 1) {
            this.damper = new NodeDamper(this.nodes, o.damping ?? 50);
            this.damper.listed = false;
            this.joints.push(this.damper);
        }
    }

    // `local` is the attachment point in the body's own frame; it should coincide with the rope end.
    pinStart(body: Body, local: Vec2 = Vec2.ZERO): void {
        this.pin(body, local, this.nodes[0]);
    }

    pinEnd(body: Body, local: Vec2 = Vec2.ZERO): void {
        this.pin(body, local, this.nodes[this.nodes.length - 1]);
    }

    addTo(world: World): void {
        world.ropes.push(this);
        for (const n of this.nodes) world.add(n);
        for (const j of this.joints) world.addJoint(j);
    }

    removeFrom(world: World): void {
        for (const n of this.nodes) world.remove(n);
        for (const j of this.joints) world.removeJoint(j);
        const i = world.ropes.indexOf(this);
        if (i !== -1) world.ropes.splice(i, 1);
    }

    get nodeMass(): number {
        return this.nodes[0].nominalMass;
    }

    setNodeMass(mass: number): void {
        for (const n of this.nodes) n.setMass(mass);
    }

    get friction(): number {
        return this.nodes[0].friction;
    }

    setFriction(friction: number): void {
        for (const n of this.nodes) n.friction = friction;
    }

    get damping(): number {
        return this.damper?.rate ?? 0;
    }

    setDamping(rate: number): void {
        if (this.damper) this.damper.rate = rate;
    }

    currentLength(): number {
        return this.restLength + this.stretch();
    }

    // how much longer the rope currently is than when it was built
    stretch(): number {
        let len = 0;
        for (let i = 1; i < this.nodes.length; i++) len += this.nodes[i].pos.dist(this.nodes[i - 1].pos);
        return len - this.restLength;
    }

    private pin(body: Body, local: Vec2, node: Body): void {
        const joint = new PinJoint(body, node, { localA: local });
        joint.visible = false;
        joint.listed = false;
        node.ignoreCollisionWith(body);
        this.joints.push(joint);
    }
}

function pointAlong(path: readonly Vec2[], distance: number): Vec2 {
    let remaining = distance;
    for (let i = 1; i < path.length; i++) {
        const seg = path[i].dist(path[i - 1]);
        if (remaining <= seg || i === path.length - 1) {
            return path[i - 1].add(path[i].sub(path[i - 1]).mul(seg > 0 ? Math.min(remaining / seg, 1) : 0));
        }
        remaining -= seg;
    }
    return path[0];
}

// A path from a to b that hangs under gravity so its length is `length` (straight if that is not longer than the chord).
export function sagPath(a: Vec2, b: Vec2, length: number, steps = 24): Vec2[] {
    const chord = a.dist(b);
    if (length <= chord * 1.001) return [a, b];
    const dir = b.sub(a).normalize();
    let side = dir.perp();
    if (side.y > 0 || (Math.abs(side.y) < 1e-9 && side.x < 0)) side = side.neg();
    const build = (sag: number): Vec2[] => {
        const pts: Vec2[] = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            pts.push(a.add(b.sub(a).mul(t)).add(side.mul(sag * 4 * t * (1 - t))));
        }
        return pts;
    };
    const lengthOf = (pts: Vec2[]): number => pts.slice(1).reduce((sum, p, i) => sum + p.dist(pts[i]), 0);
    let lo = 0;
    let hi = length;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (lengthOf(build(mid)) < length) lo = mid;
        else hi = mid;
    }
    return build((lo + hi) / 2);
}