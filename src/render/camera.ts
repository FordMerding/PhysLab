import { Vec2 } from "../engine/vec2";

const MIN_ZOOM = 2;
const MAX_ZOOM = 2000;

// Maps world meters (Y up) to screen pixels (Y down). `zoom` is pixels per meter.
export class Camera {
    center: Vec2;
    zoom: number;
    width = 0;
    height = 0;

    constructor(center: Vec2 = Vec2.ZERO, zoom = 100) {
        this.center = center;
        this.zoom = zoom;
    }

    setViewport(width: number, height: number): void {
        this.width = width;
        this.height = height;
    }

    worldToScreen(p: Vec2): Vec2 {
        return new Vec2(
            (p.x - this.center.x) * this.zoom + this.width / 2,
            this.height / 2 - (p.y - this.center.y) * this.zoom
        );
    }

    screenToWorld(s: Vec2): Vec2 {
        return new Vec2(
            this.center.x + (s.x - this.width / 2) / this.zoom,
            this.center.y - (s.y - this.height / 2) / this.zoom
        );
    }

    // zooms while keeping the world point under `screen` fixed
    zoomAt(screen: Vec2, factor: number): void {
        const before = this.screenToWorld(screen);
        this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
        this.center = this.center.add(before.sub(this.screenToWorld(screen)));
    }

    panByScreen(dx: number, dy: number): void {
        this.center = this.center.add(new Vec2(-dx / this.zoom, dy / this.zoom));
    }

    visibleBounds(): { left: number; right: number; bottom: number; top: number } {
        const hw = this.width / 2 / this.zoom;
        const hh = this.height / 2 / this.zoom;
        return {
            left: this.center.x - hw,
            right: this.center.x + hw,
            bottom: this.center.y - hh,
            top: this.center.y + hh,
        };
    }
}