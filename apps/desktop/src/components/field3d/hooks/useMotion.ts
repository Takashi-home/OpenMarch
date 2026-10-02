import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    updateMotionMutationOptions,
    workspaceSettingsQueryOptions,
} from "@/hooks/queries/useWorkspaceSettings";
import type { MotionClip } from "../motion/motionClip";
import type { MotionCue } from "../motion/motionCues";

const NO_CLIPS: MotionClip[] = [];
const NO_CUES: MotionCue[] = [];

/**
 * The open show's performer motions (clips imported from motion capture
 * files, and the cues that play them), saved in the show file (workspace
 * settings), and a setter that saves both together.
 */
export function useMotion(): {
    clips: MotionClip[];
    cues: MotionCue[];
    setMotion: (motion: { clips: MotionClip[]; cues: MotionCue[] }) => void;
} {
    const queryClient = useQueryClient();
    const { data: settings } = useQuery(workspaceSettingsQueryOptions());
    const { mutate } = useMutation(updateMotionMutationOptions(queryClient));
    const setMotion = useCallback(
        (motion: { clips: MotionClip[]; cues: MotionCue[] }) => mutate(motion),
        [mutate],
    );
    return {
        clips: settings?.motionClips ?? NO_CLIPS,
        cues: settings?.motionCues ?? NO_CUES,
        setMotion,
    };
}
