import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
    CanvasTexture,
    Group,
    SRGBColorSpace,
    Sprite,
    SpriteMaterial,
    Vector3,
} from "three";
import type { MarcherPose } from "../playback/livePlayback";

/** Labels farther than this from the camera (meters) are hidden to reduce clutter. */
export const LABEL_MAX_DISTANCE = 60;
/** Label height as a fraction of the view height (labels keep a constant on-screen size). */
export const LABEL_SCREEN_HEIGHT = 0.025;
/** Gap between the top of a marcher and its label, in meters. */
const LABEL_GAP = 0.35;

const TEXTURE_WIDTH = 256;
const TEXTURE_HEIGHT = 96;

export interface MarcherLabel {
    marcherId: number;
    text: string;
}

/** Whether a label at `distance` meters from the camera should be drawn. */
export function isLabelVisibleAtDistance(distance: number): boolean {
    return distance <= LABEL_MAX_DISTANCE;
}

/** Draws a drill number on a light pill so it reads on grass and sky alike. */
function createLabelTexture(text: string, textColor: string): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_WIDTH;
    canvas.height = TEXTURE_HEIGHT;
    const context = canvas.getContext("2d");
    if (context) {
        const radius = TEXTURE_HEIGHT / 2 - 4;
        context.fillStyle = "rgba(255, 255, 255, 0.85)";
        context.beginPath();
        context.roundRect(4, 4, TEXTURE_WIDTH - 8, TEXTURE_HEIGHT - 8, radius);
        context.fill();
        context.fillStyle = textColor;
        context.font = "bold 56px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(text, TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2 + 2);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
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
                const material = new SpriteMaterial({
                    map: createLabelTexture(label.text, textColor),
                    sizeAttenuation: false,
                    depthWrite: false,
                });
                const sprite = new Sprite(material);
                sprite.scale.set(
                    (LABEL_SCREEN_HEIGHT * TEXTURE_WIDTH) / TEXTURE_HEIGHT,
                    LABEL_SCREEN_HEIGHT,
                    1,
                );
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
            for (const sprite of sprites) {
                sprite.material.map?.dispose();
                sprite.material.dispose();
            }
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
