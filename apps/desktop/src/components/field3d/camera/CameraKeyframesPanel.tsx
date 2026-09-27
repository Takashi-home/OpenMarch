import { Button, UnitInput } from "@openmarch/ui";
import {
    EyeIcon,
    PlusIcon,
    TrashIcon,
    VideoCameraIcon,
    XIcon,
} from "@phosphor-icons/react";
import { T, useTolgee } from "@tolgee/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import type { CameraBridge } from "./cameraBridge";
import {
    CameraKeyframe,
    newKeyframeId,
    sortKeyframes,
    upsertKeyframe,
} from "./cameraKeyframes";

const formatSeconds = (timeMs: number) => (timeMs / 1000).toFixed(1);

/**
 * Lists the show's camera keyframes over the 3D view. Keyframes are added from
 * the current view at the current show time; the "keyframes" camera preset
 * then flies through them during playback and in 3D video exports.
 */
export default function CameraKeyframesPanel({
    keyframes,
    onChange,
    bridge,
    showTimeMs,
}: {
    keyframes: readonly CameraKeyframe[];
    onChange: (keyframes: CameraKeyframe[]) => void;
    bridge: CameraBridge;
    showTimeMs: () => number;
}) {
    const { t } = useTolgee();
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const { view3d } = uiSettings;
    const setView3d = (changes: Partial<typeof view3d>) =>
        setUiSettings({ ...uiSettings, view3d: { ...view3d, ...changes } });

    if (!view3d.keyframePanelOpen)
        return (
            <Button
                className="absolute top-8 left-8 z-10"
                variant="secondary"
                size="compact"
                content="icon"
                tooltipText={t("field3d.keyframes.open")}
                aria-label={t("field3d.keyframes.open")}
                onClick={() => setView3d({ keyframePanelOpen: true })}
            >
                <VideoCameraIcon size={18} />
            </Button>
        );

    const addFromView = () => {
        const pose = bridge.current;
        if (!pose) return;
        onChange(
            upsertKeyframe(keyframes, {
                id: newKeyframeId(),
                timeMs: Math.round(showTimeMs()),
                pose,
            }),
        );
    };

    const setTime = (id: string, seconds: number) => {
        if (!Number.isFinite(seconds) || seconds < 0) return;
        const edited = keyframes.find((keyframe) => keyframe.id === id);
        if (!edited) return;
        onChange(
            upsertKeyframe(keyframes, {
                ...edited,
                timeMs: Math.round(seconds * 1000),
            }),
        );
    };

    const view = (keyframe: CameraKeyframe) => {
        // Leave "keyframes" mode so the chosen view is not overridden
        setView3d({ cameraPreset: "free" });
        bridge.request(keyframe.pose);
    };

    return (
        <div
            className="rounded-6 border-stroke bg-modal text-text absolute top-8 left-8 z-10 flex max-h-[calc(100%-1rem)] w-[18rem] flex-col gap-8 overflow-hidden border p-12 shadow-md"
            data-testid="cameraKeyframesPanel"
        >
            <div className="flex items-center justify-between gap-8">
                <h4 className="text-body font-medium">
                    <T keyName="field3d.keyframes.title" />
                </h4>
                <Button
                    variant="ghost"
                    size="compact"
                    content="icon"
                    aria-label={t("field3d.keyframes.close")}
                    onClick={() => setView3d({ keyframePanelOpen: false })}
                >
                    <XIcon size={16} />
                </Button>
            </div>
            <p className="text-sub text-text-subtitle">
                <T keyName="field3d.keyframes.hint" />
            </p>
            <div className="flex gap-8">
                <Button
                    size="compact"
                    className="flex-1"
                    onClick={addFromView}
                    data-testid="addCameraKeyframe"
                >
                    <PlusIcon size={16} />
                    <T keyName="field3d.keyframes.add" />
                </Button>
                <Button
                    size="compact"
                    variant="secondary"
                    disabled={keyframes.length === 0}
                    onClick={() => setView3d({ cameraPreset: "keyframes" })}
                >
                    <T keyName="field3d.keyframes.use" />
                </Button>
            </div>
            <ul className="flex flex-col gap-4 overflow-y-auto">
                {sortKeyframes(keyframes).map((keyframe) => (
                    <li
                        key={`${keyframe.id}-${keyframe.timeMs}`}
                        className="flex items-center gap-4"
                    >
                        <UnitInput
                            unit="s"
                            step={0.1}
                            min={0}
                            compact
                            containerClassName="flex-1"
                            defaultValue={formatSeconds(keyframe.timeMs)}
                            aria-label={t("field3d.keyframes.time")}
                            onBlur={(event) =>
                                setTime(keyframe.id, Number(event.target.value))
                            }
                            onKeyDown={(event) => {
                                if (event.key === "Enter")
                                    event.currentTarget.blur();
                            }}
                        />
                        <Button
                            variant="ghost"
                            size="compact"
                            content="icon"
                            tooltipText={t("field3d.keyframes.view")}
                            aria-label={t("field3d.keyframes.view")}
                            onClick={() => view(keyframe)}
                        >
                            <EyeIcon size={16} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="compact"
                            content="icon"
                            tooltipText={t("field3d.keyframes.delete")}
                            aria-label={t("field3d.keyframes.delete")}
                            onClick={() =>
                                onChange(
                                    keyframes.filter(
                                        (other) => other.id !== keyframe.id,
                                    ),
                                )
                            }
                        >
                            <TrashIcon size={16} />
                        </Button>
                    </li>
                ))}
            </ul>
            {keyframes.length === 0 && (
                <p className="text-sub text-text-subtitle">
                    <T keyName="field3d.keyframes.empty" />
                </p>
            )}
        </div>
    );
}
