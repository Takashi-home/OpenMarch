import type { CameraPose } from "../camera/defaultCamera";

/** Typical standing eye height, used to put the VR floor under the viewpoint. */
export const VR_EYE_HEIGHT = 1.6;

/**
 * Where a VR viewer stands to see what `pose` shows: their floor is placed
 * under the camera (never below the field), and they face the camera's target.
 *
 * @returns The viewer's floor position in world meters, and their facing as a
 *   rotation about the vertical axis (0 looks toward -Z, three.js's forward)
 */
export function vrViewerPlacement(pose: CameraPose): {
    position: { x: number; y: number; z: number };
    yaw: number;
} {
    const [x, y, z] = pose.position;
    const dx = pose.target[0] - x;
    const dz = pose.target[2] - z;
    // Looking straight down has no horizontal direction; face the audience's view
    const yaw = Math.hypot(dx, dz) < 1e-6 ? Math.PI : Math.atan2(-dx, -dz);
    return {
        position: { x, y: Math.max(0, y - VR_EYE_HEIGHT), z },
        yaw,
    };
}

/** A quaternion for a rotation of `yaw` radians about the vertical axis. */
export function yawQuaternion(yaw: number): {
    x: number;
    y: number;
    z: number;
    w: number;
} {
    return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

/** Whether this computer can show an immersive VR session. */
export async function isImmersiveVrSupported(): Promise<boolean> {
    try {
        const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
        return xr ? await xr.isSessionSupported("immersive-vr") : false;
    } catch {
        return false;
    }
}
