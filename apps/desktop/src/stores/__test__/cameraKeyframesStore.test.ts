import { beforeEach, describe, expect, it, vi } from "vitest";

const pose = {
    position: [0, 10, 20] as [number, number, number],
    target: [0, 0, 0] as [number, number, number],
    fov: 50,
};

describe("CameraKeyframesStore", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });

    it("keeps keyframes per show and saves them to localStorage", async () => {
        const { useCameraKeyframesStore, selectShowKeyframes } =
            await import("../CameraKeyframesStore");
        const keyframe = { id: "a", timeMs: 1000, pose };
        useCameraKeyframesStore.getState().setKeyframes("show-a", [keyframe]);

        const state = useCameraKeyframesStore.getState();
        expect(selectShowKeyframes("show-a")(state)).toEqual([keyframe]);
        expect(selectShowKeyframes("show-b")(state)).toEqual([]);
        expect(
            JSON.parse(localStorage.getItem("openmarch:cameraKeyframes")!),
        ).toEqual({ "show-a": [keyframe] });
    });

    it("loads saved keyframes and drops broken ones", async () => {
        localStorage.setItem(
            "openmarch:cameraKeyframes",
            JSON.stringify({
                show: [
                    { id: "a", timeMs: 1000, pose },
                    { id: "b", timeMs: "later", pose },
                ],
            }),
        );
        const { useCameraKeyframesStore } =
            await import("../CameraKeyframesStore");
        expect(
            useCameraKeyframesStore.getState().byShow.show.map((k) => k.id),
        ).toEqual(["a"]);
    });

    it("forgets a show when its last keyframe is removed", async () => {
        const { useCameraKeyframesStore } =
            await import("../CameraKeyframesStore");
        const { setKeyframes } = useCameraKeyframesStore.getState();
        setKeyframes("show", [{ id: "a", timeMs: 0, pose }]);
        setKeyframes("show", []);
        expect(useCameraKeyframesStore.getState().byShow).toEqual({});
    });
});
