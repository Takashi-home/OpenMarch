import { useQuery } from "@tanstack/react-query";
import {
    selectShowKeyframes,
    useCameraKeyframesStore,
} from "@/stores/CameraKeyframesStore";
import type { CameraKeyframe } from "../camera/cameraKeyframes";

/** Used when the show's file path is unknown (e.g. outside Electron). */
export const FALLBACK_SHOW_KEY = "default";

/** Identifies the open show for per-show view data: its file path. */
export function useShowKey(): string | undefined {
    const { data } = useQuery({
        queryKey: ["field3d", "showKey"],
        queryFn: async () => {
            const path = await window.electron?.databaseGetPath?.();
            return typeof path === "string" && path.length > 0
                ? path
                : FALLBACK_SHOW_KEY;
        },
    });
    return data;
}

/** The open show's camera keyframes and a setter for them. */
export function useShowCameraKeyframes(): {
    showKey: string | undefined;
    keyframes: CameraKeyframe[];
    setKeyframes: (keyframes: CameraKeyframe[]) => void;
} {
    const showKey = useShowKey();
    const keyframes = useCameraKeyframesStore(selectShowKeyframes(showKey));
    const setForShow = useCameraKeyframesStore((state) => state.setKeyframes);
    return {
        showKey,
        keyframes,
        setKeyframes: (next) => {
            if (showKey) setForShow(showKey, next);
        },
    };
}
