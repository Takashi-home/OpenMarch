import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    updateCameraKeyframesMutationOptions,
    workspaceSettingsQueryOptions,
} from "@/hooks/queries/useWorkspaceSettings";
import type { CameraKeyframe } from "../camera/cameraKeyframes";
import {
    readLegacyKeyframes,
    removeLegacyKeyframes,
} from "../camera/legacyCameraKeyframes";

const NO_KEYFRAMES: CameraKeyframe[] = [];

/**
 * The open show's 3D camera keyframes, saved in the show file (workspace
 * settings), and a setter that saves changes.
 */
export function useCameraKeyframes(): {
    keyframes: CameraKeyframe[];
    setKeyframes: (keyframes: CameraKeyframe[]) => void;
} {
    const queryClient = useQueryClient();
    const { data: settings } = useQuery(workspaceSettingsQueryOptions());
    const { mutate } = useMutation(
        updateCameraKeyframesMutationOptions(queryClient),
    );
    const setKeyframes = useCallback(
        (keyframes: CameraKeyframe[]) => mutate(keyframes),
        [mutate],
    );
    return {
        keyframes: settings?.cameraKeyframes ?? NO_KEYFRAMES,
        setKeyframes,
    };
}

/**
 * Moves keyframes that an earlier version kept in localStorage (by file path)
 * into the show file, the first time the show is opened in 3D. If the file
 * already has keyframes, the file wins and the old copy is dropped.
 */
export function useMigrateLegacyCameraKeyframes(): void {
    const queryClient = useQueryClient();
    const { data: settings } = useQuery(workspaceSettingsQueryOptions());
    const { data: showPath } = useQuery({
        queryKey: ["field3d", "showPath"],
        queryFn: async () => {
            const path = await window.electron?.databaseGetPath?.();
            return typeof path === "string" ? path : "";
        },
    });
    const { mutate } = useMutation(
        updateCameraKeyframesMutationOptions(queryClient),
    );
    const doneFor = useRef<string | null>(null);

    useEffect(() => {
        if (!settings || !showPath || doneFor.current === showPath) return;
        doneFor.current = showPath;
        const legacy = readLegacyKeyframes(showPath);
        if (legacy.length === 0) return;
        if ((settings.cameraKeyframes ?? []).length > 0) {
            removeLegacyKeyframes(showPath);
            return;
        }
        mutate(legacy, { onSuccess: () => removeLegacyKeyframes(showPath) });
    }, [settings, showPath, mutate]);
}
