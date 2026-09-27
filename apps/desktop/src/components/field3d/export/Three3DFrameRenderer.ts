import {
    BoxGeometry,
    BufferGeometry,
    CanvasTexture,
    Color,
    DirectionalLight,
    HemisphereLight,
    InstancedMesh,
    Material,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    PCFSoftShadowMap,
    PerspectiveCamera,
    PlaneGeometry,
    Scene,
    Sprite,
    SRGBColorSpace,
    Vector3,
    WebGLRenderer,
} from "three";
import type { FieldProperties } from "@openmarch/core";
import type Marcher from "@/global/classes/Marcher";
import type Page from "@/global/classes/Page";
import type { MarcherTimeline } from "@/utilities/Keyframes";
import type { MarcherAppearancesByPageId } from "@/components/exporting/utils/exportAppearances";
import type {
    FrameRenderer,
    FrameRendererCommonArgs,
} from "@/components/exporting/video/frameRenderer";
import {
    drawBranding,
    drawOverlay,
} from "@/components/exporting/video/videoOverlay";
import { getFieldWorldBounds } from "../camera/defaultCamera";
import { renderFieldTextureCanvas } from "../scene/fieldTexture";
import { createMarcherGeometry, MARCHER_BODY } from "../scene/marcherGeometry";
import {
    MARCHER_SHAPES_3D,
    MarcherInstance,
    MarcherShape3D,
    writeMarcherPose,
} from "../scene/marcherInstances";
import {
    createLabelSprite,
    disposeLabelSprite,
    LABEL_GAP,
} from "../scene/labelTexture";
import { isLabelVisibleAtDistance } from "../scene/MarcherLabels";
import { standRowBoxes } from "../scene/Stadium";
import {
    HEMISPHERE_LIGHT,
    MARCHER_ROUGHNESS,
    rgbCss,
    SHADOW_BIAS,
    SHADOW_MAP_SIZE,
    SKY_COLOR,
    STANDS_COLOR,
    STANDS_ROUGHNESS,
    SUN_INTENSITY,
    sunLayout,
    SURROUNDING_GROUND_MARGIN,
} from "../scene/sceneStyle";
import {
    accessoryMarchers,
    createMarcherAccessories,
} from "../scene/marcherAccessories";
import type { MarcherInstancesByShape } from "../scene/marcherInstances";
import type { MarcherModel3D } from "@/stores/UiSettingsStore";
import { createExportAnimation, Export3DCamera } from "./exportAnimation";

/** Options for rendering the show in 3D. */
export interface Video3DOptions {
    camera: Export3DCamera;
    showStadium: boolean;
    shadows: boolean;
    showLabels: boolean;
    /** Marcher body size multiplier */
    marcherScale: number;
    /** Marcher body style */
    marcherModel: MarcherModel3D;
    /** Flags, rifles, drums and keyboards by section */
    showEquipment: boolean;
}

export interface Three3DFrameRendererArgs extends FrameRendererCommonArgs {
    fieldProperties: FieldProperties;
    sortedPages: Page[];
    marchers: Marcher[];
    marcherTimelines: Map<number, MarcherTimeline>;
    marcherAppearancesByPageId?: MarcherAppearancesByPageId;
    backgroundImage?: HTMLImageElement;
    gridLines: boolean;
    halfLines: boolean;
    options: Video3DOptions;
}

/**
 * Renders the show in 3D with a dedicated offscreen WebGL renderer, then
 * composites the 2D info overlay and branding on top. Uses the same scene
 * style, geometry and camera math as the on-screen 3D view.
 */
// eslint-disable-next-line max-lines-per-function
export async function createThree3DFrameRenderer(
    args: Three3DFrameRendererArgs,
): Promise<FrameRenderer> {
    const { width, height, fieldProperties, options } = args;
    const bounds = getFieldWorldBounds(fieldProperties);
    const disposables: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(item: T) => {
        disposables.push(item);
        return item;
    };

    const glCanvas = document.createElement("canvas");
    const renderer = new WebGLRenderer({
        canvas: glCanvas,
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: false,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = options.shadows;
    renderer.shadowMap.type = PCFSoftShadowMap;

    const scene = new Scene();
    scene.background = new Color(SKY_COLOR);

    // Lights
    scene.add(
        new HemisphereLight(
            HEMISPHERE_LIGHT.skyColor,
            HEMISPHERE_LIGHT.groundColor,
            HEMISPHERE_LIGHT.intensity,
        ),
    );
    const sun = sunLayout(bounds);
    const sunLight = new DirectionalLight("#ffffff", SUN_INTENSITY);
    sunLight.position.set(...sun.position);
    sunLight.castShadow = options.shadows;
    sunLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    sunLight.shadow.bias = SHADOW_BIAS;
    Object.assign(sunLight.shadow.camera, {
        left: -sun.shadowHalfSize,
        right: sun.shadowHalfSize,
        top: sun.shadowHalfSize,
        bottom: -sun.shadowHalfSize,
        near: 1,
        far: sun.shadowFar,
    });
    sunLight.shadow.camera.updateProjectionMatrix();
    scene.add(sunLight);

    // Ground and field (drawn by the same 2D renderer as the editor)
    const groundColor = rgbCss(fieldProperties.theme.background);
    const addPlane = (
        planeWidth: number,
        planeDepth: number,
        y: number,
        material: Material,
    ) => {
        const mesh = new Mesh(
            track(new PlaneGeometry(planeWidth, planeDepth)),
            track(material),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(bounds.centerX, y, bounds.centerZ);
        mesh.receiveShadow = true;
        scene.add(mesh);
    };
    addPlane(
        bounds.width + SURROUNDING_GROUND_MARGIN * 2,
        bounds.depth + SURROUNDING_GROUND_MARGIN * 2,
        -0.01,
        new MeshStandardMaterial({ color: groundColor, roughness: 1 }),
    );
    const fieldTexture = track(
        new CanvasTexture(
            await renderFieldTextureCanvas({
                fieldProperties,
                gridLines: args.gridLines,
                halfLines: args.halfLines,
                backgroundImage: args.backgroundImage ?? null,
            }),
        ),
    );
    fieldTexture.colorSpace = SRGBColorSpace;
    fieldTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    addPlane(
        bounds.width,
        bounds.depth,
        0,
        new MeshStandardMaterial({ map: fieldTexture, roughness: 1 }),
    );

    // Stands
    if (options.showStadium) {
        const rows = standRowBoxes(bounds);
        const stands = new InstancedMesh(
            track(new BoxGeometry(1, 1, 1)),
            track(
                new MeshStandardMaterial({
                    color: STANDS_COLOR,
                    roughness: STANDS_ROUGHNESS,
                }),
            ),
            rows.length,
        );
        const matrix = new Matrix4();
        rows.forEach(({ center, size }, index) => {
            matrix.makeScale(...size);
            matrix.setPosition(...center);
            stands.setMatrixAt(index, matrix);
        });
        stands.castShadow = options.shadows;
        stands.receiveShadow = options.shadows;
        scene.add(stands);
    }

    // Marchers: one instanced mesh per shape
    const capacity = Math.max(args.marchers.length, 1);
    const meshes = new Map<MarcherShape3D, InstancedMesh>();
    for (const shape of MARCHER_SHAPES_3D) {
        const geometry: BufferGeometry = track(
            createMarcherGeometry(shape, options.marcherModel),
        );
        const mesh = new InstancedMesh(
            geometry,
            track(new MeshStandardMaterial({ roughness: MARCHER_ROUGHNESS })),
            capacity,
        );
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        mesh.count = 0;
        scene.add(mesh);
        meshes.set(shape, mesh);
    }

    // Walking legs and section equipment
    const accessories =
        options.marcherModel === "figure" || options.showEquipment
            ? track(
                  createMarcherAccessories({
                      capacity,
                      legs: options.marcherModel === "figure",
                      equipment: options.showEquipment,
                      castShadow: options.shadows,
                  }),
              )
            : null;
    if (accessories) scene.add(accessories.object);
    const sectionByMarcherId = new Map(
        args.marchers.map((marcher) => [marcher.id, marcher.section]),
    );
    let accessoriesFor: MarcherInstancesByShape | null = null;

    // Labels
    const labelColor = rgbCss(fieldProperties.theme.defaultMarcher.label);
    const labels = new Map<number, Sprite>();
    if (options.showLabels) {
        for (const marcher of args.marchers) {
            const sprite = createLabelSprite(marcher.drill_number, labelColor);
            sprite.visible = false;
            labels.set(marcher.id, sprite);
            scene.add(sprite);
        }
    }
    const labelHeight = MARCHER_BODY.height * options.marcherScale + LABEL_GAP;

    const camera = new PerspectiveCamera(45, width / height, 0.1, 5000);
    const animation = createExportAnimation({
        fieldProperties,
        sortedPages: args.sortedPages,
        marcherIds: args.marchers.map((marcher) => marcher.id),
        marcherTimelines: args.marcherTimelines,
        marcherAppearancesByPageId: args.marcherAppearancesByPageId,
        camera: options.camera,
    });

    // Final frames: the 3D render with the 2D overlay and branding on top
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create export canvas");

    const scratchColor = new Color();
    const labelPosition = new Vector3();
    const frameSeconds = 1 / args.fps;

    /** Moves labels above their marchers; hides far and unlabeled ones. */
    const placeLabels = (frame: ReturnType<typeof animation.frameAt>) => {
        if (labels.size === 0) return;
        const labelled = new Set(
            MARCHER_SHAPES_3D.flatMap((shape) =>
                frame.instancesByShape[shape]
                    .filter((instance) => instance.labelVisible)
                    .map((instance) => instance.marcherId),
            ),
        );
        for (const [marcherId, sprite] of labels) {
            const pose = frame.poses.get(marcherId);
            if (!pose || !labelled.has(marcherId)) {
                sprite.visible = false;
                continue;
            }
            labelPosition.set(pose.x, labelHeight, pose.z);
            sprite.position.copy(labelPosition);
            sprite.visible = isLabelVisibleAtDistance(
                camera.position.distanceTo(labelPosition),
            );
        }
    };

    return {
        canvas,
        render(timeSeconds, overlayState) {
            const timeMs = Math.min(
                timeSeconds * 1000,
                args.durationSeconds * 1000 - 1,
            );
            const frame = animation.frameAt(timeMs, frameSeconds);

            for (const shape of MARCHER_SHAPES_3D) {
                const mesh = meshes.get(shape)!;
                let index = 0;
                const shown: MarcherInstance[] = frame.instancesByShape[shape];
                for (const instance of shown) {
                    const pose = frame.poses.get(instance.marcherId);
                    if (!pose) continue;
                    writeMarcherPose(
                        mesh,
                        index,
                        pose.x,
                        pose.z,
                        pose.yaw,
                        options.marcherScale,
                    );
                    // Colors change with the page's appearance, so write them each frame
                    const { r, g, b } = instance.color;
                    mesh.setColorAt(
                        index,
                        scratchColor.setRGB(r, g, b, SRGBColorSpace),
                    );
                    index++;
                }
                mesh.count = index;
                mesh.instanceMatrix.needsUpdate = true;
                if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            }

            if (accessories) {
                // The shown marchers and their colors change with the page
                if (accessoriesFor !== frame.instancesByShape) {
                    accessoriesFor = frame.instancesByShape;
                    accessories.setMarchers(
                        accessoryMarchers(
                            frame.instancesByShape,
                            sectionByMarcherId,
                        ),
                    );
                }
                accessories.update(
                    frame.poses,
                    frameSeconds,
                    options.marcherScale,
                );
            }

            const { position, target, fov } = frame.camera;
            camera.position.set(...position);
            camera.lookAt(...target);
            if (camera.fov !== fov) {
                camera.fov = fov;
                camera.updateProjectionMatrix();
            }

            placeLabels(frame);

            renderer.render(scene, camera);

            ctx.drawImage(glCanvas, 0, 0, width, height);
            if (overlayState && args.overlayOptions && args.overlayPlacement)
                drawOverlay(
                    ctx,
                    overlayState,
                    args.overlayOptions,
                    args.overlayPlacement,
                    width,
                    height,
                    args.videoTheme,
                );
            drawBranding(
                ctx,
                args.brandingLogo,
                width,
                height,
                args.videoTheme,
            );
        },
        dispose() {
            for (const sprite of labels.values()) disposeLabelSprite(sprite);
            for (const item of disposables) item.dispose();
            for (const mesh of meshes.values()) mesh.dispose();
            renderer.dispose();
            // Free the WebGL context now; browsers cap how many can exist
            renderer.forceContextLoss();
        },
    };
}
