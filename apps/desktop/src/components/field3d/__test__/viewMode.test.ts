import { describe, expect, it } from "vitest";
import type { ViewMode } from "@/stores/UiSettingsStore";
import { getEffectiveViewMode } from "../viewMode";

describe("getEffectiveViewMode", () => {
    it("shows 2D while the experimental 3D view is off", () => {
        expect(
            getEffectiveViewMode({ experimental3dView: false, viewMode: "3d" }),
        ).toBe("2d");
    });

    // Fullscreen does not change the mode, so 3D can fill the window too
    it.each(["2d", "3d", "split"] as ViewMode[])(
        "uses the chosen %s mode when enabled",
        (viewMode) => {
            expect(
                getEffectiveViewMode({ experimental3dView: true, viewMode }),
            ).toBe(viewMode);
        },
    );

    it("ignores an unknown stored mode", () => {
        expect(
            getEffectiveViewMode({
                experimental3dView: true,
                viewMode: "vr" as unknown as ViewMode,
            }),
        ).toBe("2d");
    });
});
