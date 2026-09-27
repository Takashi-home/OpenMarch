import { FieldProperties } from "@openmarch/core";
import { fieldToWorld } from "../coords/fieldToWorld";

export interface FieldWorldBounds {
    minX: number;
    maxX: number;
    /** Back edge of the field (toward the back sideline) */
    minZ: number;
    /** Front edge of the field (toward the audience) */
    maxZ: number;
    width: number;
    depth: number;
    centerX: number;
    centerZ: number;
}

export interface CameraPose {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
}

type FieldSize = Pick<FieldProperties, "centerFrontPoint" | "width" | "height">;

/** The field image's extent in world meters. */
export function getFieldWorldBounds(field: FieldSize): FieldWorldBounds {
    const topLeft = fieldToWorld({ x: 0, y: 0 }, field);
    const bottomRight = fieldToWorld(
        { x: field.width, y: field.height },
        field,
    );
    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minZ = Math.min(topLeft.z, bottomRight.z);
    const maxZ = Math.max(topLeft.z, bottomRight.z);
    return {
        minX,
        maxX,
        minZ,
        maxZ,
        width: maxX - minX,
        depth: maxZ - minZ,
        centerX: (minX + maxX) / 2,
        centerZ: (minZ + maxZ) / 2,
    };
}

/**
 * The press box view: high in the stands, centered on the field and looking
 * at its middle. Scales with the field so any template fits in view.
 */
export function pressBoxCameraPose(field: FieldSize): CameraPose {
    const bounds = getFieldWorldBounds(field);
    return {
        position: [
            bounds.centerX,
            bounds.width * 0.35,
            bounds.maxZ + bounds.width * 0.45,
        ],
        target: [bounds.centerX, 0, bounds.centerZ],
        fov: 45,
    };
}
