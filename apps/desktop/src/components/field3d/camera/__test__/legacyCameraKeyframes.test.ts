import { beforeEach, describe, expect, it } from "vitest";
import {
    LEGACY_KEYFRAMES_STORAGE_KEY,
    readLegacyKeyframes,
    removeLegacyKeyframes,
} from "../legacyCameraKeyframes";

const keyframe = {
    id: "a",
    timeMs: 1000,
    pose: { position: [0, 10, 20], target: [0, 0, 0], fov: 50 },
};

describe("legacy camera keyframes", () => {
    beforeEach(() => localStorage.clear());

    it("reads the keyframes an earlier version kept for a show", () => {
        localStorage.setItem(
            LEGACY_KEYFRAMES_STORAGE_KEY,
            JSON.stringify({
                "/shows/a.dots": [keyframe, { id: "broken" }],
                "/shows/b.dots": [keyframe],
            }),
        );
        expect(readLegacyKeyframes("/shows/a.dots")).toEqual([keyframe]);
        expect(readLegacyKeyframes("/shows/c.dots")).toEqual([]);
    });

    it("removes one show and the whole entry once it is empty", () => {
        localStorage.setItem(
            LEGACY_KEYFRAMES_STORAGE_KEY,
            JSON.stringify({ a: [keyframe], b: [keyframe] }),
        );
        removeLegacyKeyframes("a");
        expect(
            JSON.parse(localStorage.getItem(LEGACY_KEYFRAMES_STORAGE_KEY)!),
        ).toEqual({ b: [keyframe] });
        removeLegacyKeyframes("b");
        expect(localStorage.getItem(LEGACY_KEYFRAMES_STORAGE_KEY)).toBeNull();
    });

    it("copes with unreadable storage", () => {
        localStorage.setItem(LEGACY_KEYFRAMES_STORAGE_KEY, "{not json");
        expect(readLegacyKeyframes("a")).toEqual([]);
    });
});
