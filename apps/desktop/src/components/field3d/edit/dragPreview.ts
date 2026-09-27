/**
 * Where dragged marchers are drawn while a 3D drag is in progress (world
 * meters). The marcher meshes read it every frame, so dragging does not
 * re-render React; `version` tells readers when it changed.
 */
export interface DragPreviewStore {
    readonly version: number;
    get(marcherId: number): { x: number; z: number } | undefined;
    readonly size: number;
    set(positions: ReadonlyMap<number, { x: number; z: number }>): void;
    clear(): void;
}

export function createDragPreviewStore(): DragPreviewStore {
    let positions: ReadonlyMap<number, { x: number; z: number }> = new Map();
    let version = 0;
    return {
        get version() {
            return version;
        },
        get size() {
            return positions.size;
        },
        get(marcherId) {
            return positions.get(marcherId);
        },
        set(next) {
            positions = new Map(next);
            version++;
        },
        clear() {
            if (positions.size === 0) return;
            positions = new Map();
            version++;
        },
    };
}
