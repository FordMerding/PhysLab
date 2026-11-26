import { Vec2 } from "../engine/vec2";
import type { Body } from "../engine/body";

// One end of the ruler: a free point in the world, or a point fixed to a body (it moves with the body).
export interface RulerPoint {
    body: Body | null;
    local: Vec2;
}

// Measures the distance between two points, live: when an end is attached to a body, the reading follows it.
export class Ruler {
    a: RulerPoint | null = null;
    b: RulerPoint | null = null;

    // first tap sets the start, second the end, a third tap starts a new measurement
    tap(point: RulerPoint): void {
        if (!this.a || this.b) {
            this.a = point;
            this.b = null;
        } else {
            this.b = point;
        }
    }

    clear(): void {
        this.a = null;
        this.b = null;
    }

    get complete(): boolean {
        return this.a !== null && this.b !== null;
    }

    static position(p: RulerPoint): Vec2 {
        return p.body ? p.body.toWorld(p.local) : p.local;
    }

    // vector from a to b, meters
    vector(): Vec2 | null {
        if (!this.a || !this.b) return null;
        return Ruler.position(this.b).sub(Ruler.position(this.a));
    }

    length(): number | null {
        return this.vector()?.len() ?? null;
    }

    // direction from a to b in degrees, counter-clockwise from the +X axis
    angleDeg(): number | null {
        const v = this.vector();
        return v ? (Math.atan2(v.y, v.x) * 180) / Math.PI : null;
    }
}
