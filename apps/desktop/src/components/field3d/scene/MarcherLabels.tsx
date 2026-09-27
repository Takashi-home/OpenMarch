import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import type { MarcherPose } from "../playback/livePlayback";
import {
    createLabelSprite,
    disposeLabelSprite,
    LABEL_GAP,
} from "./labelTexture";

/** Labels farther than this from the camera (meters) are hidden to reduce clutter. */
export const LABEL_MAX_DISTANCE = 60;
export interface MarcherLabel {
    marcherId: number;
    text: string;
}

/** Whether a label at `distance` meters from the camera should be drawn. */
export function isLabelVisibleAtDistance(distance: number): boolean {
    return distance <= LABEL_MAX_DISTANCE;
}

const scratchPosition = new Vector3();

/**
 * Drill number labels floating above marchers. Positions follow
 * `displayedPoses`, which the marcher meshes fill in every frame they move.
 */
export default function MarcherLabels({
    labels,
    displayedPoses,
    labelHeight,
    textColor,
}: {
    labels: readonly MarcherLabel[];
    displayedPoses: ReadonlyMap<number, MarcherPose>;
    /** Height of the label's center above the ground, in meters */
    labelHeight: number;
    textColor: string;
}) {
    const group = useMemo(() => new Group(), []);
    const sprites = useMemo(
        () =>
            labels.map((label) => {
                const sprite = createLabelSprite(label.text, textColor);
                sprite.visible = false;
                sprite.userData.marcherId = label.marcherId;
                return sprite;
            }),
        [labels, textColor],
    );

    useEffect(() => {
        group.add(...sprites);
        return () => {
            group.remove(...sprites);
            for (const sprite of sprites) disposeLabelSprite(sprite);
        };
    }, [group, sprites]);

    useFrame(({ camera }) => {
        for (const sprite of sprites) {
            const pose = displayedPoses.get(sprite.userData.marcherId);
            if (!pose) {
                sprite.visible = false;
                continue;
            }
            scratchPosition.set(pose.x, labelHeight + LABEL_GAP, pose.z);
            sprite.position.copy(scratchPosition);
            sprite.visible = isLabelVisibleAtDistance(
                camera.position.distanceTo(scratchPosition),
            );
        }
    });

    return <primitive object={group} />;
}
