export const DEFAULT_LAYER = 1;
export const ROPE_LAYER = 1 << 1;
export const ALL_LAYERS = 0xffffffff;

export interface Filterable {
    readonly category: number;
    readonly mask: number;
}

export function canCollide(a: Filterable, b: Filterable): boolean {
    return (a.category & b.mask) !== 0 && (b.category & a.mask) !== 0;
}