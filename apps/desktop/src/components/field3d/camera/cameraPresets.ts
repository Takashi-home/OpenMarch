import type { CameraPresetId } from "@/stores/UiSettingsStore";
import {
    CameraPose,
    getFieldWorldBounds,
    pressBoxCameraPose,
} from "./defaultCamera";

type FieldSize = Parameters<typeof getFieldWorldBounds>[0];

/** Presets with a fixed pose; "follow" and "free" depend on the scene. */
export type FixedCameraPresetId = Exclude<CameraPresetId, "follow" | "free">;

export const FIXED_CAMERA_PRESETS: readonly FixedCameraPresetId[] = [
    "press-box",
    "stands-low",
    "end-zone",
    "top-down",
    "field-level",
];

/** Lowest the orbit camera may go: just above the horizon. */
export const MAX_POLAR_ANGLE = Math.PI / 2 - 0.01;

const TOP_DOWN_FOV = 30;
/** Assumed width/height of the view when fitting the top-down preset */
const TOP_DOWN_ASPECT = 16 / 9;

/**
 * The camera pose for a preset. Every pose scales with the field size, so any
 * field template (football, grid, indoor) stays in view.
 */
export function getCameraPresetPose(
    preset: FixedCameraPresetId,
    field: FieldSize,
): CameraPose {
    const b = getFieldWorldBounds(field);
    switch (preset) {
        case "press-box":
            return pressBoxCameraPose(field);
        case "stands-low":
            // Front row of the stands, a little above the field
            return {
                position: [b.centerX, 4, b.maxZ + 8],
                target: [b.centerX, 1, b.centerZ],
                fov: 50,
            };
        case "end-zone":
            // Beyond the left end of the field, looking down its length
            return {
                position: [b.minX - b.width * 0.15, 12, b.centerZ],
                target: [b.centerX, 0, b.centerZ],
                fov: 50,
            };
        case "top-down": {
            // Straight down, high enough to fit the whole field
            const halfFov = (TOP_DOWN_FOV * Math.PI) / 360;
            const coverDepth = Math.max(b.depth, b.width / TOP_DOWN_ASPECT);
            const height = ((coverDepth / 2) * 1.1) / Math.tan(halfFov);
            return {
                // A tiny forward offset keeps "up" well defined for the orbit controls
                position: [b.centerX, height, b.centerZ + 0.01],
                target: [b.centerX, 0, b.centerZ],
                fov: TOP_DOWN_FOV,
            };
        }
        case "field-level":
            // Eye level at the front sideline, as a marcher would see the form
            return {
                position: [b.centerX, 1.6, b.maxZ + 2],
                target: [b.centerX, 1, b.centerZ],
                fov: 60,
            };
    }
}

/** Offset from a followed marcher: behind them toward the audience, and above. */
export const FOLLOW_CAMERA_OFFSET: readonly [number, number, number] = [
    0, 8, 14,
];
/** Height of the followed point above the ground (about chest height). */
export const FOLLOW_TARGET_HEIGHT = 1.2;

export function isFixedCameraPreset(
    preset: string,
): preset is FixedCameraPresetId {
    return (FIXED_CAMERA_PRESETS as readonly string[]).includes(preset);
}

/** How long switching presets takes. */
export const CAMERA_TRANSITION_SECONDS = 0.6;

const easeInOutCubic = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

const lerp3 = (
    a: readonly number[],
    b: readonly number[],
    t: number,
): [number, number, number] => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
];

/** Camera pose part way (0–1) between two poses, eased in and out. */
export function interpolateCameraPose(
    from: CameraPose,
    to: CameraPose,
    progress: number,
): CameraPose {
    const t = easeInOutCubic(Math.min(Math.max(progress, 0), 1));
    return {
        position: lerp3(from.position, to.position, t),
        target: lerp3(from.target, to.target, t),
        fov: from.fov + (to.fov - from.fov) * t,
    };
}

/** Where the camera should be to follow a marcher standing at (x, z). */
export function followCameraPose(
    marcher: { x: number; z: number },
    fov = 50,
): CameraPose {
    const target: [number, number, number] = [
        marcher.x,
        FOLLOW_TARGET_HEIGHT,
        marcher.z,
    ];
    return {
        position: [
            target[0] + FOLLOW_CAMERA_OFFSET[0],
            target[1] + FOLLOW_CAMERA_OFFSET[1],
            target[2] + FOLLOW_CAMERA_OFFSET[2],
        ],
        target,
        fov,
    };
}
