import type { CameraPose } from "./defaultCamera";

/**
 * Lets UI outside the 3D canvas (such as the keyframe panel) read the current
 * view and move the camera. The camera rig inside the canvas keeps `current`
 * up to date and applies requested poses.
 */
export interface CameraBridge {
    /** The pose drawn in the latest frame */
    current: CameraPose | null;
    /** Asks the rig to jump to `pose` on its next frame */
    request(pose: CameraPose): void;
    /** Takes the pending request, if any (used by the rig) */
    takeRequest(): CameraPose | null;
    /** Set by the rig so requests redraw the view */
    invalidate: () => void;
}

export function createCameraBridge(): CameraBridge {
    let pending: CameraPose | null = null;
    const bridge: CameraBridge = {
        current: null,
        request(pose) {
            pending = pose;
            bridge.invalidate();
        },
        takeRequest() {
            const pose = pending;
            pending = null;
            return pose;
        },
        invalidate: () => {},
    };
    return bridge;
}
