import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { MarcherPose } from "../playback/livePlayback";
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
}: {
    marchers: readonly AccessoryMarcher[];
    capacity: number;
    displayedPoses: ReadonlyMap<number, MarcherPose>;
    scale: number;
    legs: boolean;
    equipment: boolean;
    castShadow: boolean;
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

    useFrame((_, deltaSeconds) => {
        // Keep drawing while legs settle after marchers stop
        if (accessories.update(displayedPoses, deltaSeconds, scale))
            invalidate();
    });

    return <primitive object={accessories.object} />;
}
