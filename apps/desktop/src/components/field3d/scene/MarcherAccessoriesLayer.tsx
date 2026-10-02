import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { MarcherPose } from "../playback/livePlayback";
import type { DecodedMotionClip } from "../motion/motionClip";
import type { ResolvedMotionCue } from "../motion/motionCues";
import type { ResolvedEquipmentMove } from "./equipmentMoves";
import {
    AccessoryMarcher,
    createMarcherAccessories,
} from "./marcherAccessories";

/**
 * Walking legs, section equipment, and jointed figures for marchers playing a
 * motion clip. Mount it after the marcher meshes so `displayedPoses` is
 * current when it updates.
 */
export default function MarcherAccessoriesLayer({
    marchers,
    capacity,
    displayedPoses,
    scale,
    legs,
    equipment,
    castShadow,
    moves,
    cues,
    clips,
    getShowTimeMs,
}: {
    marchers: readonly AccessoryMarcher[];
    capacity: number;
    displayedPoses: ReadonlyMap<number, MarcherPose>;
    scale: number;
    legs: boolean;
    equipment: boolean;
    castShadow: boolean;
    /** Tosses, spins and sweeps the equipment performs */
    moves: readonly ResolvedEquipmentMove[];
    /** When marchers perform motion clips */
    cues: readonly ResolvedMotionCue[];
    /** The show's motion clips, by ID */
    clips: ReadonlyMap<string, DecodedMotionClip>;
    /**
     * The show time to pose equipment and performers at, or undefined to keep
     * everyone in their usual hold
     */
    getShowTimeMs: () => number | undefined;
}) {
    const invalidate = useThree((state) => state.invalidate);
    const performers = cues.length > 0;
    const accessories = useMemo(
        () =>
            createMarcherAccessories({
                capacity,
                legs,
                equipment,
                performers,
                castShadow,
            }),
        [capacity, legs, equipment, performers, castShadow],
    );
    useEffect(() => () => accessories.dispose(), [accessories]);

    useEffect(() => {
        accessories.setMarchers(marchers);
        invalidate();
    }, [accessories, marchers, invalidate]);

    useEffect(() => {
        accessories.setMoves(moves);
        invalidate();
    }, [accessories, moves, invalidate]);

    useEffect(() => {
        accessories.setMotion(cues, clips);
        invalidate();
    }, [accessories, cues, clips, invalidate]);

    // A new time source (e.g. moving the preview) needs a redraw while paused
    useEffect(() => {
        invalidate();
    }, [getShowTimeMs, invalidate]);

    useFrame((_, deltaSeconds) => {
        // Keep drawing while legs settle after marchers stop
        if (
            accessories.update(
                displayedPoses,
                deltaSeconds,
                scale,
                getShowTimeMs(),
            )
        )
            invalidate();
    });

    return <primitive object={accessories.object} />;
}
