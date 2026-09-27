import type { FieldWorldBounds } from "../camera/defaultCamera";

/** Soft sky light plus a sun from behind the audience. */
export default function Lighting({ bounds }: { bounds: FieldWorldBounds }) {
    const sunDistance = Math.max(bounds.width, bounds.depth);
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
            />
        </>
    );
}
