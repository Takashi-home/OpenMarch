import type { RgbaColor } from "@openmarch/core";
import type { FieldWorldBounds } from "../camera/defaultCamera";

/**
 * Look of the 3D scene, shared by the on-screen view (R3F components) and the
 * video export (plain three.js) so both render the same picture.
 */

export const SKY_COLOR = "#a9c8e8";

export const HEMISPHERE_LIGHT = {
    skyColor: "#ffffff",
    groundColor: "#6b7b5a",
    intensity: 1.6,
} as const;

export const SUN_INTENSITY = 1.8;
export const SHADOW_MAP_SIZE = 2048;
export const SHADOW_BIAS = -0.0005;

/** How far the ground extends past the field on every side, in meters. */
export const SURROUNDING_GROUND_MARGIN = 400;

export const MARCHER_ROUGHNESS = 0.6;
export const STANDS_COLOR = "#9aa0a6";
export const STANDS_ROUGHNESS = 0.9;

export const rgbCss = ({ r, g, b }: Pick<RgbaColor, "r" | "g" | "b">) =>
    `rgb(${r}, ${g}, ${b})`;

/** Sun placement: behind the audience and to the left, high above the field. */
export function sunLayout(bounds: FieldWorldBounds) {
    const sunDistance = Math.max(bounds.width, bounds.depth);
    return {
        position: [
            bounds.centerX - sunDistance * 0.3,
            sunDistance * 0.8,
            bounds.maxZ + sunDistance * 0.5,
        ] as [number, number, number],
        // The shadow camera covers the field plus the stands in front of it
        shadowHalfSize: sunDistance * 0.75,
        shadowFar: sunDistance * 3,
    };
}
