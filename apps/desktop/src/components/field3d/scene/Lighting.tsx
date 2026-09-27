import type { FieldWorldBounds } from "../camera/defaultCamera";

/** Soft sky light plus a sun from behind the audience, optionally casting shadows. */
export default function Lighting({
    bounds,
    shadows = false,
}: {
    bounds: FieldWorldBounds;
    shadows?: boolean;
}) {
    const sunDistance = Math.max(bounds.width, bounds.depth);
    // The shadow camera covers the field plus the stands in front of it
    const shadowHalfSize = sunDistance * 0.75;
    return (
        <>
            <hemisphereLight args={["#ffffff", "#6b7b5a", 1.6]} />
            <directionalLight
                position={[
                    bounds.centerX - sunDistance * 0.3,
                    sunDistance * 0.8,
                    bounds.maxZ + sunDistance * 0.5,
                ]}
                intensity={1.8}
                castShadow={shadows}
                shadow-mapSize={[2048, 2048]}
                shadow-bias={-0.0005}
                shadow-camera-left={-shadowHalfSize}
                shadow-camera-right={shadowHalfSize}
                shadow-camera-top={shadowHalfSize}
                shadow-camera-bottom={-shadowHalfSize}
                shadow-camera-near={1}
                shadow-camera-far={sunDistance * 3}
            />
        </>
    );
}
