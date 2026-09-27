import { describe, expect, it } from "vitest";
import type { ViewMode } from "@/stores/UiSettingsStore";
import { getEffectiveViewMode } from "../viewMode";

describe("getEffectiveViewMode", () => {
    it("shows 2D while the experimental 3D view is off", () => {
        expect(
            getEffectiveViewMode(
                { experimental3dView: false, viewMode: "3d" },
                false,
            ),
        ).toBe("2d");
    });

    it.each(["2d", "3d", "split"] as ViewMode[])(
        "uses the chosen %s mode when enabled",
        (viewMode) => {
            expect(
                getEffectiveViewMode(
                    { experimental3dView: true, viewMode },
                    false,
                ),
            ).toBe(viewMode);
        },
    );

    it("shows 2D in fullscreen", () => {
        expect(
            getEffectiveViewMode(
                { experimental3dView: true, viewMode: "split" },
                true,
            ),
        ).toBe("2d");
    });

    it("ignores an unknown stored mode", () => {
        expect(
            getEffectiveViewMode(
                {
                    experimental3dView: true,
                    viewMode: "vr" as unknown as ViewMode,
                },
                false,
            ),
        ).toBe("2d");
    });
});
