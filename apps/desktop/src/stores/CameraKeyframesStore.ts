import { create } from "zustand";
import {
    CameraKeyframe,
    sanitizeKeyframes,
} from "@/components/field3d/camera/cameraKeyframes";

/**
 * 3D camera keyframes, kept per show file in localStorage.
 *
 * They are view settings, like the rest of the 3D view options, so they are
 * not written into the .dots file (that would change the file format). They
 * stay on this computer and do not travel with the show file.
 */
const STORAGE_KEY = "openmarch:cameraKeyframes";

type KeyframesByShow = Record<string, CameraKeyframe[]>;

const load = (): KeyframesByShow => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return {};
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        return Object.fromEntries(
            Object.entries(parsed).map(([show, keyframes]) => [
                show,
                sanitizeKeyframes(keyframes),
            ]),
        );
    } catch (error) {
        console.error("Failed to load camera keyframes:", error);
        return {};
    }
};

const save = (byShow: KeyframesByShow) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(byShow));
    } catch (error) {
        console.error("Failed to save camera keyframes:", error);
    }
};

interface CameraKeyframesStore {
    byShow: KeyframesByShow;
    setKeyframes: (showKey: string, keyframes: CameraKeyframe[]) => void;
}

export const useCameraKeyframesStore = create<CameraKeyframesStore>(
    (set, get) => ({
        byShow: load(),
        setKeyframes: (showKey, keyframes) => {
            const byShow = { ...get().byShow };
            if (keyframes.length > 0) byShow[showKey] = keyframes;
            else delete byShow[showKey];
            save(byShow);
            set({ byShow });
        },
    }),
);

const NO_KEYFRAMES: CameraKeyframe[] = [];

/** Keyframes of one show (empty when there are none). */
export const selectShowKeyframes =
    (showKey: string | undefined) => (state: CameraKeyframesStore) =>
        (showKey ? state.byShow[showKey] : undefined) ?? NO_KEYFRAMES;
