import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    allMarchersQueryOptions,
    fieldPropertiesQueryOptions,
    marcherAppearancesQueryOptions,
    marcherPagesByPageQueryOptions,
} from "@/hooks/queries";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { playbackClock } from "@/utilities/playback/PlaybackClock";
import {
    getFieldWorldBounds,
    pressBoxCameraPose,
} from "./camera/defaultCamera";
import FieldMesh from "./scene/FieldMesh";
import Lighting from "./scene/Lighting";
import MarchersInstanced, {
    LiveMarcherPlayback,
} from "./scene/MarchersInstanced";
import {
    createHeadingTracker,
    createLivePositionStore,
} from "./playback/livePlayback";
import { buildMarcherInstances } from "./scene/marcherInstances";

const SKY_COLOR = "#a9c8e8";

/**
 * Read-only 3D view of the selected page. While playing, marchers follow the
 * same playback clock as the 2D canvas.
 *
 * Data is read here, outside the R3F <Canvas>, and passed down as props so the
 * scene does not depend on React contexts crossing into the R3F renderer.
 */
export default function Field3DView() {
    const queryClient = useQueryClient();
    const databaseReady = useDatabaseReady();
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;
    const { uiSettings } = useUiSettingsStore();

    const { data: fieldProperties } = useQuery(
        fieldPropertiesQueryOptions(databaseReady),
    );
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const { data: marcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.id),
    );
    const { data: marcherAppearances } = useQuery(
        marcherAppearancesQueryOptions(selectedPage?.id, queryClient),
    );

    const instancesByShape = useMemo(() => {
        if (!fieldProperties || !marchers || !marcherPages) return null;
        return buildMarcherInstances({
            marcherIds: marchers.map((marcher) => marcher.id),
            marcherPages,
            appearancesByMarcherId: marcherAppearances ?? {},
            fieldProperties,
        });
    }, [fieldProperties, marchers, marcherPages, marcherAppearances]);

    const livePositions = useMemo(() => createLivePositionStore(), []);
    const headings = useMemo(() => createHeadingTracker(), []);

    // Receive playback frames only while playing, starting fresh each time
    useEffect(() => {
        if (!isPlaying) return;
        livePositions.reset();
        headings.reset();
        const unregister = playbackClock.register(livePositions);
        return () => {
            unregister();
            livePositions.reset();
        };
    }, [isPlaying, livePositions, headings]);

    const live = useMemo<LiveMarcherPlayback | undefined>(
        () =>
            isPlaying && fieldProperties
                ? { store: livePositions, headings, fieldProperties }
                : undefined,
        [isPlaying, fieldProperties, livePositions, headings],
    );

    const camera = useMemo(
        () => (fieldProperties ? pressBoxCameraPose(fieldProperties) : null),
        [fieldProperties],
    );

    if (!fieldProperties || !camera) return null;
    const bounds = getFieldWorldBounds(fieldProperties);

    return (
        <Canvas
            data-testid="field3dCanvas"
            // Draw every frame while playing; otherwise only when something changes
            frameloop={isPlaying ? "always" : "demand"}
            dpr={[1, 2]}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            camera={{
                position: camera.position,
                fov: camera.fov,
                near: 0.1,
                far: 5000,
            }}
        >
            <color attach="background" args={[SKY_COLOR]} />
            <Lighting bounds={bounds} />
            <FieldMesh
                fieldProperties={fieldProperties}
                gridLines={uiSettings.gridLines}
                halfLines={uiSettings.halfLines}
            />
            {instancesByShape && (
                <MarchersInstanced
                    instancesByShape={instancesByShape}
                    capacity={marchers?.length ?? 0}
                    live={live}
                />
            )}
            <OrbitControls
                makeDefault
                target={camera.target}
                maxPolarAngle={Math.PI / 2 - 0.05}
                minDistance={2}
                maxDistance={Math.max(bounds.width, bounds.depth) * 3}
            />
        </Canvas>
    );
}
