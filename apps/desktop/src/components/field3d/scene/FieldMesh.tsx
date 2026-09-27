import { useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace } from "three";
import { FieldProperties } from "@openmarch/core";
import { getFieldWorldBounds } from "../camera/defaultCamera";
import { renderFieldTextureCanvas } from "./fieldTexture";
import { rgbCss, SURROUNDING_GROUND_MARGIN } from "./sceneStyle";

/** The field, textured with the same drawing as the 2D editor, on a wider ground plane. */
export default function FieldMesh({
    fieldProperties,
    gridLines,
    halfLines,
}: {
    fieldProperties: FieldProperties;
    gridLines: boolean;
    halfLines: boolean;
}) {
    const gl = useThree((state) => state.gl);
    const invalidate = useThree((state) => state.invalidate);
    const [texture, setTexture] = useState<CanvasTexture | null>(null);
    const bounds = useMemo(
        () => getFieldWorldBounds(fieldProperties),
        [fieldProperties],
    );

    useEffect(() => {
        let cancelled = false;
        let created: CanvasTexture | null = null;

        renderFieldTextureCanvas({ fieldProperties, gridLines, halfLines })
            .then((canvas) => {
                if (cancelled) return;
                created = new CanvasTexture(canvas);
                created.colorSpace = SRGBColorSpace;
                created.anisotropy = gl.capabilities.getMaxAnisotropy();
                setTexture(created);
                invalidate();
            })
            .catch((error) =>
                console.error("Failed to draw the 3D field texture", error),
            );

        return () => {
            cancelled = true;
            created?.dispose();
        };
    }, [fieldProperties, gridLines, halfLines, gl, invalidate]);

    return (
        <group>
            {/* Ground around the field so the view never shows a void */}
            <mesh
                receiveShadow
                rotation-x={-Math.PI / 2}
                position={[bounds.centerX, -0.01, bounds.centerZ]}
            >
                <planeGeometry
                    args={[
                        bounds.width + SURROUNDING_GROUND_MARGIN * 2,
                        bounds.depth + SURROUNDING_GROUND_MARGIN * 2,
                    ]}
                />
                <meshStandardMaterial
                    color={rgbCss(fieldProperties.theme.background)}
                    roughness={1}
                />
            </mesh>
            <mesh
                receiveShadow
                rotation-x={-Math.PI / 2}
                position={[bounds.centerX, 0, bounds.centerZ]}
            >
                <planeGeometry args={[bounds.width, bounds.depth]} />
                {/* A new material per texture, so the shader is rebuilt with the map */}
                <meshStandardMaterial
                    key={texture?.uuid ?? "no-texture"}
                    map={texture}
                    color={
                        texture
                            ? "#ffffff"
                            : rgbCss(fieldProperties.theme.background)
                    }
                    roughness={1}
                />
            </mesh>
        </group>
    );
}
