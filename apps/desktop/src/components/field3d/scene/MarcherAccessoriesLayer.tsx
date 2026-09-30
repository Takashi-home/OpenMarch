import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { MarcherPose } from "../playback/livePlayback";
import type { ResolvedEquipmentMove } from "./equipmentMoves";
import {
    AccessoryMarcher,
    createMarcherAccessories,
} from "./marcherAccessories";

/**
 * Walking legs and section equipment around the marcher bodies. Mount it
 * after the marcher meshes so `displayedPoses` is current when it updates.
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
    /** The show time to pose equipment at, or undefined to keep it in its hold */
    getShowTimeMs: () => number | undefined;
}) {
    const invalidate = useThree((state) => state.invalidate);
    const accessories = useMemo(
        () =>
            createMarcherAccessories({ capacity, legs, equipment, castShadow }),
        [capacity, legs, equipment, castShadow],
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
