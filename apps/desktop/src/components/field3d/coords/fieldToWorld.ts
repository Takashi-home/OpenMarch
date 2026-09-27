import { FieldProperties } from "@openmarch/core";

export const METERS_PER_INCH = 0.0254;

/** A point in the 3D world, in meters. Y is up; +Z points toward the audience. */
export interface WorldPoint {
    x: number;
    y: number;
    z: number;
}

type FieldOrigin = Pick<FieldProperties, "centerFrontPoint">;

/** Number of meters that one field pixel represents. */
export const metersPerPixel = (): number =>
    METERS_PER_INCH / FieldProperties.PIXELS_PER_INCH;

/**
 * Converts field coordinates (pixels, as stored in marcher_pages) to world
 * coordinates (meters). The origin is the center-front point on the ground.
 *
 * Field X and world X both point to the audience's right. Field Y grows toward
 * the front sideline, which maps to +Z.
 */
export function fieldToWorld(
    point: { x: number; y: number },
    field: FieldOrigin,
): WorldPoint {
    const scale = metersPerPixel();
    return {
        x: (point.x - field.centerFrontPoint.xPixels) * scale,
        y: 0,
        z: (point.y - field.centerFrontPoint.yPixels) * scale,
    };
}

/** Inverse of {@link fieldToWorld}. The world height (Y) is ignored. */
export function worldToField(
    point: { x: number; z: number },
    field: FieldOrigin,
): { x: number; y: number } {
    const scale = metersPerPixel();
    return {
        x: point.x / scale + field.centerFrontPoint.xPixels,
        y: point.z / scale + field.centerFrontPoint.yPixels,
    };
}
