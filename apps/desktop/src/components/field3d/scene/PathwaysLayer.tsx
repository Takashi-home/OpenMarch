import { useEffect, useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { RgbaColor } from "@openmarch/core";
import { STEP_SIZE_WARNING_COLOR } from "@/global/classes/canvasObjects/stepSizeWarning";
import type { PathSegments } from "./pathSegments";

const rgbCss = ({ r, g, b }: Pick<RgbaColor, "r" | "g" | "b">) =>
    `rgb(${r}, ${g}, ${b})`;

function Segments({
    positions,
    color,
}: {
    positions: readonly number[];
    color: string;
}) {
    const geometry = useMemo(() => {
        const created = new BufferGeometry();
        created.setAttribute(
            "position",
            new Float32BufferAttribute(positions, 3),
        );
        return created;
    }, [positions]);
    useEffect(() => () => geometry.dispose(), [geometry]);

    if (positions.length === 0) return null;
    return (
        <lineSegments geometry={geometry}>
            <lineBasicMaterial color={color} />
        </lineSegments>
    );
}

/** Previous/next page paths on the ground, in the 2D theme colors. */
export default function PathwaysLayer({
    segments,
    previousColor,
    nextColor,
}: {
    segments: PathSegments;
    previousColor: RgbaColor;
    nextColor: RgbaColor;
}) {
    return (
        <group>
            <Segments
                positions={segments.previous}
                color={rgbCss(previousColor)}
            />
            <Segments positions={segments.next} color={rgbCss(nextColor)} />
            <Segments
                positions={segments.warning}
                color={rgbCss(STEP_SIZE_WARNING_COLOR)}
            />
        </group>
    );
}
