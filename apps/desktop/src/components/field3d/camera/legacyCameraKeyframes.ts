import { CameraKeyframe, sanitizeKeyframes } from "./cameraKeyframes";

/**
 * Before camera keyframes were saved in the show file, they were kept in
 * localStorage, keyed by the show's file path. These helpers let the 3D view
 * move them into the file once.
 */
export const LEGACY_KEYFRAMES_STORAGE_KEY = "openmarch:cameraKeyframes";

function readAll(): Record<string, unknown> {
    try {
        const stored = localStorage.getItem(LEGACY_KEYFRAMES_STORAGE_KEY);
        const parsed: unknown = stored ? JSON.parse(stored) : {};
        return typeof parsed === "object" && parsed !== null
            ? (parsed as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
}

/** Keyframes kept in localStorage for the show at `showPath` (empty if none). */
export function readLegacyKeyframes(showPath: string): CameraKeyframe[] {
    return sanitizeKeyframes(readAll()[showPath]);
}

/** Forgets the localStorage keyframes of one show, once they are in its file. */
export function removeLegacyKeyframes(showPath: string): void {
    const all = readAll();
    if (!(showPath in all)) return;
    delete all[showPath];
    try {
        if (Object.keys(all).length === 0)
            localStorage.removeItem(LEGACY_KEYFRAMES_STORAGE_KEY);
        else
            localStorage.setItem(
                LEGACY_KEYFRAMES_STORAGE_KEY,
                JSON.stringify(all),
            );
    } catch (error) {
        console.error("Failed to clear old camera keyframes:", error);
    }
}
