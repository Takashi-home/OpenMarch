import { useCallback, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { invalidate } from "@react-three/fiber";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    allMarchersQueryOptions,
    fieldPropertiesQueryOptions,
    marcherAppearancesQueryOptions,
    marcherPagesByPageQueryOptions,
    updateMarcherPagesMutationOptions,
} from "@/hooks/queries";
import type { ModifiedMarcherPageArgs } from "@/db-functions";
import { useTimingObjects } from "@/hooks";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { playbackClock } from "@/utilities/playback/PlaybackClock";
import {
    getFieldWorldBounds,
    pressBoxCameraPose,
} from "./camera/defaultCamera";
import { MAX_POLAR_ANGLE } from "./camera/cameraPresets";
import CameraRig from "./camera/CameraRig";
import CameraKeyframesPanel from "./camera/CameraKeyframesPanel";
import { createCameraBridge } from "./camera/cameraBridge";
import { useShowCameraKeyframes } from "./hooks/useShowKey";
import { createDragPreviewStore } from "./edit/dragPreview";
import MarcherEditController from "./edit/MarcherEditController";
import SelectionRings from "./edit/SelectionRings";
import MarcherAccessoriesLayer from "./scene/MarcherAccessoriesLayer";
import { accessoryMarchers } from "./scene/marcherAccessories";
import { createVrBridge, VrButton, VrSessionController } from "./xr/VrSession";
import FieldMesh from "./scene/FieldMesh";
import Lighting from "./scene/Lighting";
import MarchersInstanced, {
    LiveMarcherPlayback,
} from "./scene/MarchersInstanced";
import MarcherLabels, { MarcherLabel } from "./scene/MarcherLabels";
import PathwaysLayer from "./scene/PathwaysLayer";
import Stadium from "./scene/Stadium";
import { MARCHER_BODY } from "./scene/marcherGeometry";
import {
    buildMarcherInstances,
    MARCHER_SHAPES_3D,
} from "./scene/marcherInstances";
import { buildPathSegments } from "./scene/pathSegments";
import { SKY_COLOR } from "./scene/sceneStyle";
import {
    createHeadingTracker,
    createLivePositionStore,
    MarcherPose,
} from "./playback/livePlayback";

/**
 * 3D view of the selected page. While playing, marchers follow the same
 * playback clock as the 2D canvas. While paused, marchers can be selected and
 * dragged, sharing the selection and the database update with the 2D canvas.
 *
 * Data is read here, outside the R3F <Canvas>, and passed down as props so the
 * scene does not depend on React contexts crossing into the R3F renderer.
 */
// eslint-disable-next-line max-lines-per-function
export default function Field3DView() {
    const queryClient = useQueryClient();
    const databaseReady = useDatabaseReady();
    const { pages } = useTimingObjects()!;
    const { selectedPage } = useSelectedPage()!;
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
    const { isPlaying } = useIsPlaying()!;
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const { view3d } = uiSettings;

    const { data: fieldProperties } = useQuery(
        fieldPropertiesQueryOptions(databaseReady),
    );
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const { data: marcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.id),
    );
    const { data: previousMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(
            selectedPage?.previousPageId ?? undefined,
        ),
    );
    const { data: nextMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.nextPageId ?? undefined),
    );
    const { data: marcherAppearances } = useQuery(
        marcherAppearancesQueryOptions(selectedPage?.id, queryClient),
    );

    const { mutate: updateMarcherPages } = useMutation(
        updateMarcherPagesMutationOptions(queryClient),
    );
    const dragPreview = useMemo(() => createDragPreviewStore(), []);
    const cameraBridge = useMemo(() => createCameraBridge(), []);
    const vrBridge = useMemo(() => createVrBridge(), []);
    const { keyframes, setKeyframes } = useShowCameraKeyframes();

    // Saved (or refreshed) positions replace the drag preview
    useEffect(() => {
        dragPreview.clear();
        invalidate();
    }, [marcherPages, dragPreview]);

    const handleSelect = useCallback(
        (marcherIds: number[]) => {
            const byId = new Map(
                (marchers ?? []).map((marcher) => [marcher.id, marcher]),
            );
            setSelectedMarchers(marcherIds.flatMap((id) => byId.get(id) ?? []));
        },
        [marchers, setSelectedMarchers],
    );
    const handleMove = useCallback(
        (updates: ModifiedMarcherPageArgs[]) =>
            updateMarcherPages(updates, {
                onError: () => {
                    dragPreview.clear();
                    invalidate();
                },
            }),
        [updateMarcherPages, dragPreview],
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

    /** What each marcher's mesh currently shows, for labels and the follow camera */
    const displayedPoses = useMemo(() => new Map<number, MarcherPose>(), []);

    const accessories = useMemo(() => {
        if (!instancesByShape || !marchers) return [];
        return accessoryMarchers(
            instancesByShape,
            new Map(marchers.map((marcher) => [marcher.id, marcher.section])),
        );
    }, [instancesByShape, marchers]);

    const labels = useMemo<MarcherLabel[]>(() => {
        if (!view3d.showLabels || !instancesByShape || !marchers) return [];
        const drillNumbers = new Map(
            marchers.map((marcher) => [marcher.id, marcher.drill_number]),
        );
        return MARCHER_SHAPES_3D.flatMap((shape) => instancesByShape[shape])
            .filter((instance) => instance.labelVisible)
            .map((instance) => ({
                marcherId: instance.marcherId,
                text: drillNumbers.get(instance.marcherId) ?? "",
            }));
    }, [view3d.showLabels, instancesByShape, marchers]);

    const pathSegments = useMemo(() => {
        if (
            isPlaying ||
            !fieldProperties ||
            !marchers ||
            !marcherPages ||
            !selectedPage ||
            (!uiSettings.previousPaths && !uiSettings.nextPaths)
        )
            return null;
        const nextPage = pages.find((p) => p.id === selectedPage.nextPageId);
        return buildPathSegments({
            marcherIds: marchers.map((marcher) => marcher.id),
            current: marcherPages,
            previous: previousMarcherPages ?? {},
            next: nextMarcherPages ?? {},
            currentPageCounts: selectedPage.counts,
            nextPageCounts: nextPage?.counts,
            previousPathsEnabled: uiSettings.previousPaths,
            nextPathsEnabled: uiSettings.nextPaths,
            stepSizeWarningsEnabled: uiSettings.stepSizeWarnings,
            fieldProperties,
        });
    }, [
        isPlaying,
        fieldProperties,
        marchers,
        marcherPages,
        previousMarcherPages,
        nextMarcherPages,
        selectedPage,
        pages,
        uiSettings.previousPaths,
        uiSettings.nextPaths,
        uiSettings.stepSizeWarnings,
    ]);

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

    // Show time for camera keyframes: the playback clock, or the paused page's set
    const pageTimeMs = selectedPage
        ? (selectedPage.timestamp + selectedPage.duration) * 1000
        : 0;
    const showTimeMs = useCallback(
        () =>
            (isPlaying ? livePositions.latest()?.timeMilliseconds : null) ??
            pageTimeMs,
        [isPlaying, livePositions, pageTimeMs],
    );

    const live = useMemo<LiveMarcherPlayback | undefined>(
        () =>
            isPlaying && fieldProperties
                ? { store: livePositions, headings, fieldProperties }
                : undefined,
        [isPlaying, fieldProperties, livePositions, headings],
    );

    // Orbiting by hand switches the preset to "free" so it is not snapped back
    const handleUserCameraControl = useCallback(() => {
        const { uiSettings: latest } = useUiSettingsStore.getState();
        if (latest.view3d.cameraPreset === "free") return;
        setUiSettings({
            ...latest,
            view3d: { ...latest.view3d, cameraPreset: "free" },
        });
    }, [setUiSettings]);

    const initialCamera = useMemo(
        () => (fieldProperties ? pressBoxCameraPose(fieldProperties) : null),
        [fieldProperties],
    );
    const bounds = useMemo(
        () => (fieldProperties ? getFieldWorldBounds(fieldProperties) : null),
        [fieldProperties],
    );

    if (!fieldProperties || !initialCamera || !bounds) return null;
    const labelColor = fieldProperties.theme.defaultMarcher.label;
    const selectedIds = selectedMarchers.map((marcher) => marcher.id);

    return (
        <>
            <Canvas
                data-testid="field3dCanvas"
                // Draw every frame while playing; otherwise only when something changes
                frameloop={isPlaying ? "always" : "demand"}
                dpr={[1, 2]}
                shadows={view3d.shadows}
                gl={{ antialias: true, powerPreference: "high-performance" }}
                camera={{
                    position: initialCamera.position,
                    fov: initialCamera.fov,
                    near: 0.1,
                    far: 5000,
                }}
            >
                <color attach="background" args={[SKY_COLOR]} />
                <Lighting bounds={bounds} shadows={view3d.shadows} />
                <FieldMesh
                    fieldProperties={fieldProperties}
                    gridLines={uiSettings.gridLines}
                    halfLines={uiSettings.halfLines}
                />
                {view3d.showStadium && (
                    <Stadium bounds={bounds} shadows={view3d.shadows} />
                )}
                {pathSegments && (
                    <PathwaysLayer
                        segments={pathSegments}
                        previousColor={fieldProperties.theme.previousPath}
                        nextColor={fieldProperties.theme.nextPath}
                    />
                )}
                {instancesByShape && (
                    <MarchersInstanced
                        instancesByShape={instancesByShape}
                        capacity={marchers?.length ?? 0}
                        live={live}
                        smoothPageTransition={view3d.smoothPageTransition}
                        scale={view3d.marcherScale}
                        displayedPoses={displayedPoses}
                        dragPreview={dragPreview}
                        model={view3d.marcherModel}
                    />
                )}
                {(view3d.marcherModel === "figure" || view3d.showEquipment) && (
                    <MarcherAccessoriesLayer
                        marchers={accessories}
                        capacity={marchers?.length ?? 0}
                        displayedPoses={displayedPoses}
                        scale={view3d.marcherScale}
                        legs={view3d.marcherModel === "figure"}
                        equipment={view3d.showEquipment}
                        castShadow={view3d.shadows}
                    />
                )}
                <SelectionRings
                    marcherIds={selectedIds}
                    displayedPoses={displayedPoses}
                    scale={view3d.marcherScale}
                />
                {labels.length > 0 && (
                    <MarcherLabels
                        labels={labels}
                        displayedPoses={displayedPoses}
                        labelHeight={MARCHER_BODY.height * view3d.marcherScale}
                        textColor={`rgb(${labelColor.r}, ${labelColor.g}, ${labelColor.b})`}
                    />
                )}
                <OrbitControls
                    makeDefault
                    target={initialCamera.target}
                    maxPolarAngle={MAX_POLAR_ANGLE}
                    minDistance={2}
                    maxDistance={Math.max(bounds.width, bounds.depth) * 3}
                />
                <CameraRig
                    preset={view3d.cameraPreset}
                    fieldProperties={fieldProperties}
                    followMarcherId={selectedMarchers[0]?.id ?? null}
                    displayedPoses={displayedPoses}
                    onUserControl={handleUserCameraControl}
                    keyframes={keyframes}
                    showTimeMs={showTimeMs}
                    bridge={cameraBridge}
                />
                <MarcherEditController
                    enabled={!isPlaying}
                    pageId={selectedPage?.id}
                    marcherPages={marcherPages ?? {}}
                    selectedIds={selectedIds}
                    fieldProperties={fieldProperties}
                    dragPreview={dragPreview}
                    onSelect={handleSelect}
                    onMove={handleMove}
                />
                <VrSessionController bridge={vrBridge} />
            </Canvas>
            <CameraKeyframesPanel
                keyframes={keyframes}
                onChange={setKeyframes}
                bridge={cameraBridge}
                showTimeMs={showTimeMs}
            />
            <VrButton vrBridge={vrBridge} cameraBridge={cameraBridge} />
        </>
    );
}
