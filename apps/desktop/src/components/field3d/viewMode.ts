import type { UiSettings, ViewMode } from "@/stores/UiSettingsStore";

export const VIEW_MODES: readonly ViewMode[] = ["2d", "3d", "split"];

/**
 * The view mode to show. Falls back to 2D while the 3D view is disabled, in
 * fullscreen (which has its own 2D perspective tilt), or when the stored value
 * is not a known mode.
 */
export function getEffectiveViewMode(
    uiSettings: Pick<UiSettings, "experimental3dView" | "viewMode">,
    isFullscreen: boolean,
): ViewMode {
    if (!uiSettings.experimental3dView || isFullscreen) return "2d";
    return VIEW_MODES.includes(uiSettings.viewMode)
        ? uiSettings.viewMode
        : "2d";
}
