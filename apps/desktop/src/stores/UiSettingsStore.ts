import { create } from "zustand";

export type FocusableComponents = "canvas" | "timeline";
/** Which field views are shown in the workspace */
export type ViewMode = "2d" | "3d" | "split";
/**
 * Camera positions in the 3D view; "free" is wherever the user moved it and
 * "keyframes" follows the show's camera keyframes
 */
export type CameraPresetId =
    | "press-box"
    | "stands-low"
    | "end-zone"
    | "top-down"
    | "field-level"
    | "follow"
    | "keyframes"
    | "free";
/** How marchers are drawn in 3D: a simple solid, or a figure that walks */
export type MarcherModel3D = "simple" | "figure";

/** Options for the experimental 3D view */
export interface View3DSettings {
    cameraPreset: CameraPresetId;
    /** Drill number labels above marchers */
    showLabels: boolean;
    /** Simple stands on the audience side */
    showStadium: boolean;
    /** Sun shadows (costly on slower GPUs) */
    shadows: boolean;
    /** Marcher body size multiplier, 0.5–2 */
    marcherScale: number;
    /** Glide to new positions when the page changes while paused */
    smoothPageTransition: boolean;
    /** Marcher body style */
    marcherModel: MarcherModel3D;
    /** Flags, rifles, drums and keyboards by section */
    showEquipment: boolean;
    /** Whether the camera keyframe panel is open */
    keyframePanelOpen: boolean;
    /** Whether the flag and rifle moves panel is open */
    equipmentPanelOpen: boolean;
}

export const defaultView3DSettings: View3DSettings = {
    cameraPreset: "press-box",
    showLabels: false,
    showStadium: true,
    shadows: false,
    marcherScale: 1,
    smoothPageTransition: true,
    marcherModel: "figure",
    showEquipment: true,
    keyframePanelOpen: false,
    equipmentPanelOpen: false,
};
export interface UiSettings {
    lockX: boolean;
    lockY: boolean;
    isPlaying: boolean;
    /** Whether to show the full database path in the title bar */
    showFullDatabasePath: boolean;
    /** Boolean to view previous page's paths/dots */
    previousPaths: boolean;
    /** Boolean to view next page's paths/dots */
    nextPaths: boolean;
    /** Boolean to force-show over-threshold paths and apply step-size warning styling */
    stepSizeWarnings: boolean;
    /** Boolean to show collision markers on the canvas */
    showCollisions: boolean;
    /** Boolean to view lines for every step on the field */
    gridLines: boolean;
    /** Boolean to view lines for every four steps on the field */
    halfLines: boolean;
    /** The number of pixels per second in the timeline */
    timelinePixelsPerSecond: number;
    /** The current audio volume percentage for timeline playback */
    audioVolume: number;
    /** Whether all app audio is muted */
    audioMuted: boolean;
    /** The component that is currently focussed */
    focussedComponent: FocusableComponents;
    /** Mouse settings */
    mouseSettings: {
        /** Whether to enable trackpad mode (specific handling for macOS trackpads) */
        trackpadMode: boolean;
        /** Trackpad wheel pan sensitivity (0.1-3.0) */
        trackpadPanSensitivity: number;
        /** Zoom sensitivity multiplier. Default: 1.0 (100%). Range 0.5-4.0. */
        zoomSensitivity: number;
    };
    coordinateRounding?: {
        /** In steps, the closest step to round to on the X-axis, offset on the nearestXSteps */
        nearestXSteps?: number;
        /** In steps, the offset from the center-front point to round to on the X-axis */
        referencePointX?: number;
        /** In steps, the closest step to round to on the Y-axis, offset on the nearestYSteps */
        nearestYSteps?: number;
        /** In steps, the offset from the center-front point to round to on the Y-axis */
        referencePointY?: number;
    };
    /** Whether to enable Tolgee In-Context Translating */
    tolgeeDevTools?: boolean;
    /** Tolgee API Key for In-Context Translating */
    tolgeeApiKey?: string;
    /** Whether the experimental 3D view can be turned on */
    experimental3dView: boolean;
    /** Which field views are shown (only used when the 3D view is enabled) */
    viewMode: ViewMode;
    /** 3D view options */
    view3d: View3DSettings;
}

// Default settings that will be used if no localStorage data exists
export const defaultSettings: UiSettings = {
    isPlaying: false,
    lockX: false,
    lockY: false,
    showFullDatabasePath: false,
    previousPaths: false,
    nextPaths: false,
    stepSizeWarnings: false,
    showCollisions: false,
    gridLines: true,
    halfLines: true,
    timelinePixelsPerSecond: 40,
    audioVolume: 100,
    audioMuted: false,
    focussedComponent: "canvas",
    mouseSettings: {
        trackpadMode: true,
        trackpadPanSensitivity: 0.5,
        zoomSensitivity: 1.0,
    },
    coordinateRounding: {
        nearestXSteps: 0,
        referencePointX: undefined,
        nearestYSteps: 0,
        referencePointY: undefined,
    },
    tolgeeDevTools: false,
    experimental3dView: false,
    viewMode: "2d",
    view3d: defaultView3DSettings,
};

const STORAGE_KEY = "openmarch:uiSettings";

const clampZoomSensitivity = (value: number): number =>
    Math.min(4.0, Math.max(0.5, value));

// Helper function to load settings from localStorage
const loadSettings = (): UiSettings => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return defaultSettings;

        const parsed = JSON.parse(stored) as UiSettings;
        const mergedMouseSettings = {
            ...defaultSettings.mouseSettings,
            ...parsed.mouseSettings,
        };
        if (mergedMouseSettings.zoomSensitivity !== undefined) {
            mergedMouseSettings.zoomSensitivity = clampZoomSensitivity(
                mergedMouseSettings.zoomSensitivity,
            );
        }
        // Merge with default settings to ensure all properties exist
        // Deep merge nested objects to preserve new properties in defaults
        return {
            ...defaultSettings,
            ...parsed,
            mouseSettings: mergedMouseSettings,
            coordinateRounding: parsed.coordinateRounding
                ? {
                      ...defaultSettings.coordinateRounding,
                      ...parsed.coordinateRounding,
                  }
                : defaultSettings.coordinateRounding,
            view3d: { ...defaultView3DSettings, ...parsed.view3d },
        };
    } catch (error) {
        console.error("Failed to load UI settings from localStorage:", error);
        return defaultSettings;
    }
};

// Helper function to save settings to localStorage
const saveSettings = (settings: UiSettings): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error("Failed to save UI settings to localStorage:", error);
    }
};

interface UiSettingsStoreState {
    uiSettings: UiSettings;
}
interface UiSettingsStoreActions {
    fetchUiSettings: () => void;
    setUiSettings: (uiSettings: UiSettings, type?: keyof UiSettings) => void;
    setPixelsPerSecond: (pixelsPerSecond: number) => void;
    toggleAudioMute: () => void;
    setAudioVolume: (volume: number) => void;
}
interface UiSettingsStoreInterface
    extends UiSettingsStoreState, UiSettingsStoreActions {}

export const useUiSettingsStore = create<UiSettingsStoreInterface>(
    (set, get) => ({
        uiSettings: loadSettings(),

        fetchUiSettings: () => {
            const currentSettings = get().uiSettings;
            const newSettings = {
                ...currentSettings,
            };
            set({ uiSettings: newSettings });
            saveSettings(newSettings);
        },

        setUiSettings: (newUiSettings, type) => {
            const uiSettings = { ...newUiSettings };

            if (uiSettings.mouseSettings?.zoomSensitivity !== undefined) {
                uiSettings.mouseSettings.zoomSensitivity = clampZoomSensitivity(
                    uiSettings.mouseSettings.zoomSensitivity,
                );
            }

            if (uiSettings.lockX && type === "lockX") {
                uiSettings.lockY = false;
            }

            if (uiSettings.lockY && type === "lockY") {
                uiSettings.lockX = false;
            }

            // Disable collisions for now
            uiSettings.showCollisions = false;

            set({ uiSettings: uiSettings });
            saveSettings(uiSettings);
        },

        setPixelsPerSecond: (pixelsPerSecond: number) => {
            const newSettings = {
                ...get().uiSettings,
                timelinePixelsPerSecond: pixelsPerSecond,
            };
            set({ uiSettings: newSettings });
            saveSettings(newSettings);
        },
        toggleAudioMute: () => {
            const current = get().uiSettings;
            const newSettings = {
                ...current,
                audioMuted: !current.audioMuted,
            };
            set({ uiSettings: newSettings });
            saveSettings(newSettings);
        },
        setAudioVolume: (volume: number) => {
            const clampedVolume = Math.min(100, Math.max(0, volume));
            const current = get().uiSettings;
            const newSettings = {
                ...current,
                audioVolume: clampedVolume,
                audioMuted: clampedVolume === 0 ? true : current.audioMuted,
            };
            if (clampedVolume > 0 && current.audioMuted) {
                newSettings.audioMuted = false;
            }
            set({ uiSettings: newSettings });
            saveSettings(newSettings);
        },
    }),
);
