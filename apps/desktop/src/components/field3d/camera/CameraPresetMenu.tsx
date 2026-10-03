import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { useTolgee } from "@tolgee/react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { CameraPresetId, useUiSettingsStore } from "@/stores/UiSettingsStore";
import { FIXED_CAMERA_PRESETS } from "./cameraPresets";
import { useCameraKeyframes } from "../hooks/useCameraKeyframes";
import { OVERLAY_CONTROL_STYLE } from "../overlayStyle";

/** Presets offered in the menu, in order. "free" only appears as the current value. */
export const MENU_CAMERA_PRESETS: readonly CameraPresetId[] = [
    ...FIXED_CAMERA_PRESETS,
    "follow",
    "keyframes",
];

export const cameraPresetKey = (preset: CameraPresetId) =>
    `field3d.camera.${preset}`;

/** Camera preset picker shown over the 3D view. */
export default function CameraPresetMenu() {
    const { t } = useTolgee();
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const { selectedMarchers } = useSelectedMarchers()!;
    const { keyframes } = useCameraKeyframes();
    const current = uiSettings.view3d.cameraPreset;

    const choose = (preset: string) =>
        setUiSettings({
            ...uiSettings,
            view3d: {
                ...uiSettings.view3d,
                cameraPreset: preset as CameraPresetId,
            },
        });

    return (
        <div
            className="absolute top-8 right-8 z-10"
            style={OVERLAY_CONTROL_STYLE}
            title={t("field3d.camera.label")}
        >
            <Select value={current} onValueChange={choose}>
                <SelectTriggerButton
                    label={t(cameraPresetKey(current))}
                    className="min-w-[160px] shadow-md"
                />
                <SelectContent>
                    {MENU_CAMERA_PRESETS.map((preset) => (
                        <SelectItem
                            key={preset}
                            value={preset}
                            disabled={
                                (preset === "follow" &&
                                    selectedMarchers.length === 0) ||
                                (preset === "keyframes" &&
                                    keyframes.length === 0)
                            }
                        >
                            {t(cameraPresetKey(preset))}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
