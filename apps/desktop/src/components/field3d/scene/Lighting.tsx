import type { FieldWorldBounds } from "../camera/defaultCamera";
import {
    HEMISPHERE_LIGHT,
    SHADOW_BIAS,
    SHADOW_MAP_SIZE,
    SUN_INTENSITY,
    sunLayout,
} from "./sceneStyle";

/** Soft sky light plus a sun from behind the audience, optionally casting shadows. */
export default function Lighting({
    bounds,
    shadows = false,
}: {
    bounds: FieldWorldBounds;
    shadows?: boolean;
}) {
    const sun = sunLayout(bounds);
    return (
        <>
            <hemisphereLight
                args={[
                    HEMISPHERE_LIGHT.skyColor,
                    HEMISPHERE_LIGHT.groundColor,
                    HEMISPHERE_LIGHT.intensity,
                ]}
            />
            <directionalLight
                position={sun.position}
                intensity={SUN_INTENSITY}
                castShadow={shadows}
                shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
                shadow-bias={SHADOW_BIAS}
                shadow-camera-left={-sun.shadowHalfSize}
                shadow-camera-right={sun.shadowHalfSize}
                shadow-camera-top={sun.shadowHalfSize}
                shadow-camera-bottom={-sun.shadowHalfSize}
                shadow-camera-near={1}
                shadow-camera-far={sun.shadowFar}
            />
        </>
    );
}
