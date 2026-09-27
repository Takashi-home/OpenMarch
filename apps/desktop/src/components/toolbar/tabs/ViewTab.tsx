import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import {
    ColumnsIcon,
    CubeIcon,
    EyeIcon,
    EyeSlashIcon,
    SquareIcon,
} from "@phosphor-icons/react";
import { T, useTolgee } from "@tolgee/react";
import clsx from "clsx";
import type { ViewMode } from "@/stores/UiSettingsStore";

export default function ViewTab() {
    return (
        <div className="flex w-full flex-wrap gap-8">
            <ViewModeToolbar />
            <UiSettingsToolbar />
        </div>
    );
}

const viewModeOptions: {
    mode: ViewMode;
    keyName: string;
    Icon: typeof SquareIcon;
}[] = [
    { mode: "2d", keyName: "toolbar.view.viewMode.2d", Icon: SquareIcon },
    { mode: "3d", keyName: "toolbar.view.viewMode.3d", Icon: CubeIcon },
    {
        mode: "split",
        keyName: "toolbar.view.viewMode.split",
        Icon: ColumnsIcon,
    },
];

const view3dToggles: {
    setting: "showLabels" | "showStadium" | "shadows" | "showEquipment";
    keyName: string;
}[] = [
    { setting: "showLabels", keyName: "toolbar.view.view3d.labels" },
    { setting: "showStadium", keyName: "toolbar.view.view3d.stadium" },
    { setting: "shadows", keyName: "toolbar.view.view3d.shadows" },
    { setting: "showEquipment", keyName: "toolbar.view.view3d.equipment" },
];

/** 2D / 3D / split switch, shown once the experimental 3D view is enabled. */
function ViewModeToolbar() {
    const { t } = useTolgee();
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    if (!uiSettings.experimental3dView) return null;

    return (
        <ToolbarSection aria-label={t("toolbar.view.viewMode")}>
            {viewModeOptions.map(({ mode, keyName, Icon }) => {
                const active = uiSettings.viewMode === mode;
                return (
                    <button
                        key={mode}
                        aria-pressed={active}
                        onClick={() =>
                            setUiSettings({ ...uiSettings, viewMode: mode })
                        }
                        className={clsx(
                            "hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50",
                            { "text-accent": active },
                        )}
                    >
                        <Icon size={24} weight={active ? "fill" : "regular"} />
                        <T keyName={keyName} />
                    </button>
                );
            })}
            {view3dToggles.map(({ setting, keyName }) => (
                <button
                    key={setting}
                    aria-pressed={uiSettings.view3d[setting]}
                    onClick={() =>
                        setUiSettings({
                            ...uiSettings,
                            view3d: {
                                ...uiSettings.view3d,
                                [setting]: !uiSettings.view3d[setting],
                            },
                        })
                    }
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <T keyName={keyName} />
                    {uiSettings.view3d[setting] ? (
                        <EyeIcon className="text-accent" size={24} />
                    ) : (
                        <EyeSlashIcon size={24} />
                    )}
                </button>
            ))}
        </ToolbarSection>
    );
}

function UiSettingsToolbar() {
    const { t } = useTolgee();
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    return (
        <>
            <ToolbarSection aria-label={t("toolbar.view.uiSettingsToolbar")}>
                <button
                    onClick={() => {
                        setUiSettings({
                            ...uiSettings,
                            previousPaths: !uiSettings.previousPaths,
                        });
                    }}
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <T keyName="toolbar.view.previousPaths" />
                    {uiSettings.previousPaths ? (
                        <EyeIcon className="text-accent" size={24} />
                    ) : (
                        <EyeSlashIcon size={24} />
                    )}
                </button>
                <button
                    onClick={() => {
                        setUiSettings({
                            ...uiSettings,
                            nextPaths: !uiSettings.nextPaths,
                        });
                    }}
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <T keyName="toolbar.view.nextPaths" />
                    {uiSettings.nextPaths ? (
                        <EyeIcon className="text-accent" size={24} />
                    ) : (
                        <EyeSlashIcon size={24} />
                    )}
                </button>
                <button
                    onClick={() => {
                        setUiSettings({
                            ...uiSettings,
                            stepSizeWarnings: !uiSettings.stepSizeWarnings,
                        });
                    }}
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <T keyName="toolbar.view.stepSizeWarnings" />
                    {uiSettings.stepSizeWarnings ? (
                        <EyeIcon className="text-accent" size={24} />
                    ) : (
                        <EyeSlashIcon size={24} />
                    )}
                </button>
            </ToolbarSection>
            <ToolbarSection>
                <button
                    onClick={() => {
                        setUiSettings({
                            ...uiSettings,
                            gridLines: !uiSettings.gridLines,
                        });
                    }}
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <T keyName="toolbar.view.gridLines" />
                    {uiSettings.gridLines ? (
                        <EyeIcon className="text-accent" size={24} />
                    ) : (
                        <EyeSlashIcon size={24} />
                    )}
                </button>
                <button
                    onClick={() => {
                        setUiSettings({
                            ...uiSettings,
                            halfLines: !uiSettings.halfLines,
                        });
                    }}
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <T keyName="toolbar.view.halfLines" />
                    {uiSettings.halfLines ? (
                        <EyeIcon className="text-accent" size={24} />
                    ) : (
                        <EyeSlashIcon size={24} />
                    )}
                </button>
            </ToolbarSection>
            {/* <ToolbarSection>
                <button
                    onClick={() => {
                        setUiSettings({
                            ...uiSettings,
                            showCollisions: !uiSettings.showCollisions,
                        });
                    }}
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <span>Collisions</span>
                    {uiSettings.showCollisions ? (
                        <ArrowsInSimpleIcon
                            className="text-accent"
                            size={24}
                            weight="fill"
                        />
                    ) : (
                        <ArrowsInSimpleIcon size={24} />
                    )}
                </button>
            </ToolbarSection> */}
        </>
    );
}
