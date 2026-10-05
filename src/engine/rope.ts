import { Vec2 } from "./vec2";
import { Body } from "./body";
import { circle } from "./shapes";
import { DistanceJoint, Joint, PinJoint } from "./joints";
import { ALL_LAYERS, ROPE_LAYER } from "./filter";
import type { World } from "./world";

export interface RopeOptions {
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
    private readonly rate: number;

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
    private readonly restLength: number;

    constructor(path: readonly Vec2[], o: RopeOptions = {}) {
        const radius = o.radius ?? 0.04;
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
            this.joints.push(link);
        }
        if (this.nodes.length > 1) this.joints.push(new NodeDamper(this.nodes, o.damping ?? 50));
    }

    // `local` is the attachment point in the body's own frame; it should coincide with the rope end.
    pinStart(body: Body, local: Vec2 = Vec2.ZERO): void {
        this.pin(body, local, this.nodes[0]);
    }

    pinEnd(body: Body, local: Vec2 = Vec2.ZERO): void {
        this.pin(body, local, this.nodes[this.nodes.length - 1]);
    }

    addTo(world: World): void {
        for (const n of this.nodes) world.add(n);
        for (const j of this.joints) world.addJoint(j);
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