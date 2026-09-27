import * as Form from "@radix-ui/react-form";
import {
    Checkbox,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import type Marcher from "@/global/classes/Marcher";
import type { CameraPresetId, View3DSettings } from "@/stores/UiSettingsStore";
import {
    FIXED_CAMERA_PRESETS,
    isFixedCameraPreset,
} from "../camera/cameraPresets";
import { cameraPresetKey } from "../camera/CameraPresetMenu";
import type { Video3DOptions } from "./Three3DFrameRenderer";

const FOLLOW = "follow";

/** Starting 3D video options, taken from the on-screen 3D view settings. */
export function defaultVideo3DOptions(view3d: View3DSettings): Video3DOptions {
    return {
        camera: {
            kind: "preset",
            preset: isFixedCameraPreset(view3d.cameraPreset)
                ? view3d.cameraPreset
                : "press-box",
        },
        showStadium: view3d.showStadium,
        shadows: view3d.shadows,
        showLabels: view3d.showLabels,
        marcherScale: view3d.marcherScale,
    };
}

/** Camera and scene options for exporting the show as a 3D video. */
export default function Video3DOptionsPanel({
    value,
    onChange,
    marchers,
}: {
    value: Video3DOptions;
    onChange: (value: Video3DOptions) => void;
    marchers: readonly Marcher[];
}) {
    const { t } = useTolgee();
    const cameraValue =
        value.camera.kind === "follow" ? FOLLOW : value.camera.preset;
    const followedId =
        value.camera.kind === "follow" ? value.camera.marcherId : undefined;
    const followed = marchers.find((marcher) => marcher.id === followedId);

    const chooseCamera = (choice: string) => {
        if (choice === FOLLOW) {
            const first = marchers[0];
            if (!first) return;
            onChange({
                ...value,
                camera: { kind: "follow", marcherId: followedId ?? first.id },
            });
        } else if (isFixedCameraPreset(choice)) {
            onChange({ ...value, camera: { kind: "preset", preset: choice } });
        }
    };

    const toggles = [
        { key: "showStadium", label: "exportCoordinates.video3d.stadium" },
        { key: "shadows", label: "exportCoordinates.video3d.shadows" },
        { key: "showLabels", label: "exportCoordinates.video3d.labels" },
    ] as const;

    return (
        <Form.Root className="grid grid-cols-2 gap-24">
            <Form.Field
                name="video3dCamera"
                className="flex w-full items-center justify-between gap-12"
            >
                <Form.Label className="text-body">
                    <T keyName="field3d.camera.label" />
                </Form.Label>
                <Select value={cameraValue} onValueChange={chooseCamera}>
                    <SelectTriggerButton
                        label={t(
                            cameraPresetKey(cameraValue as CameraPresetId),
                        )}
                        className="w-[12rem] whitespace-nowrap"
                    />
                    <SelectContent>
                        {[...FIXED_CAMERA_PRESETS, FOLLOW].map((preset) => (
                            <SelectItem
                                key={preset}
                                value={preset}
                                disabled={
                                    preset === FOLLOW && marchers.length === 0
                                }
                            >
                                {t(cameraPresetKey(preset as CameraPresetId))}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Form.Field>

            {value.camera.kind === "follow" && (
                <Form.Field
                    name="video3dFollow"
                    className="flex w-full items-center justify-between gap-12"
                >
                    <Form.Label className="text-body">
                        <T keyName="exportCoordinates.video3d.followMarcher" />
                    </Form.Label>
                    <Select
                        value={String(followedId)}
                        onValueChange={(id) =>
                            onChange({
                                ...value,
                                camera: {
                                    kind: "follow",
                                    marcherId: Number(id),
                                },
                            })
                        }
                    >
                        <SelectTriggerButton
                            label={followed?.drill_number ?? ""}
                            className="w-[10rem] whitespace-nowrap"
                        />
                        <SelectContent>
                            {marchers.map((marcher) => (
                                <SelectItem
                                    key={marcher.id}
                                    value={String(marcher.id)}
                                >
                                    {marcher.drill_number}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Form.Field>
            )}

            {toggles.map(({ key, label }) => (
                <Form.Field
                    key={key}
                    name={`video3d-${key}`}
                    className="flex w-full items-center gap-12"
                >
                    <Form.Control asChild>
                        <Checkbox
                            checked={value[key]}
                            onCheckedChange={(checked: boolean) =>
                                onChange({ ...value, [key]: checked })
                            }
                        />
                    </Form.Control>
                    <Form.Label className="text-body">
                        <T keyName={label} />
                    </Form.Label>
                </Form.Field>
            ))}
        </Form.Root>
    );
}
