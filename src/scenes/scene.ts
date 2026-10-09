import type { World } from "../engine/world";

export interface Scene {
    name: string;
    // initial camera: center in meters, pixels per meter, and the size of the scene in meters (to fit small screens)
    view: { x: number; y: number; zoom: number; w: number; h: number };
    build(world: World): void;
}