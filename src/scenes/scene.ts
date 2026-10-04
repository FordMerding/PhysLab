import type { World } from "../engine/world";

export interface Scene {
    name: string;
    view: { x: number; y: number; zoom: number }; // initial camera: center in meters, pixels per meter
    build(world: World): void;
}