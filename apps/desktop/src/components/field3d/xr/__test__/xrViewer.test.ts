import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import {
    isImmersiveVrSupported,
    VR_EYE_HEIGHT,
    vrViewerPlacement,
    yawQuaternion,
} from "../xrViewer";

const forwardFor = (yaw: number) => {
    const { x, y, z, w } = yawQuaternion(yaw);
    return new Vector3(0, 0, -1).applyQuaternion(new Quaternion(x, y, z, w));
};

describe("vrViewerPlacement", () => {
    it("stands the viewer under the camera, facing its target", () => {
        const placement = vrViewerPlacement({
            position: [0, 20, 60],
            target: [0, 0, 0],
            fov: 50,
        });
        expect(placement.position).toEqual({
            x: 0,
            y: 20 - VR_EYE_HEIGHT,
            z: 60,
        });
        // The camera looks toward -Z (back across the field)
        const forward = forwardFor(placement.yaw);
        expect(forward.x).toBeCloseTo(0);
        expect(forward.z).toBeCloseTo(-1);
    });

    it("faces sideways targets and keeps the floor on the ground", () => {
        const placement = vrViewerPlacement({
            position: [-50, 1, 0],
            target: [0, 0, 0],
            fov: 50,
        });
        expect(placement.position.y).toBe(0);
        const forward = forwardFor(placement.yaw);
        expect(forward.x).toBeCloseTo(1);
        expect(forward.z).toBeCloseTo(0);
    });

    it("picks a facing when looking straight down", () => {
        const placement = vrViewerPlacement({
            position: [0, 100, 0],
            target: [0, 0, 0],
            fov: 30,
        });
        expect(Number.isFinite(placement.yaw)).toBe(true);
    });
});

describe("isImmersiveVrSupported", () => {
    it("is false without WebXR", async () => {
        expect(await isImmersiveVrSupported()).toBe(false);
    });
});
