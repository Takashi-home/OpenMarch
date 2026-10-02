import { ReactNode, useMemo, useRef, useState } from "react";
import {
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
    Slider,
} from "@openmarch/ui";
import {
    EyeIcon,
    PencilSimpleIcon,
    PersonSimpleRunIcon,
    TrashIcon,
    UploadSimpleIcon,
    XIcon,
} from "@phosphor-icons/react";
import { T, useTolgee } from "@tolgee/react";
import { toast } from "sonner";
import type Marcher from "@/global/classes/Marcher";
import type Page from "@/global/classes/Page";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { sortEquipmentMoves } from "../scene/equipmentMoves";
import type { TargetOption } from "../equipment/EquipmentMoveForm";
import {
    marcherChoice,
    SELECTION_TARGET,
    sectionChoice,
    withMoves,
} from "../equipment/equipmentMoveDraft";
import {
    importMotionFile,
    MOTION_FILE_EXTENSIONS,
    MotionImportError,
} from "./importMotion";
import { clipDurationSeconds, MAX_CLIPS, MotionClip } from "./motionClip";
import type { MotionCue } from "./motionCues";
import {
    cuesFromDraft,
    draftFromCue,
    MotionCueDraft,
    naturalLengthCounts,
    newCueDraft,
    withoutClip,
} from "./motionCueDraft";
import MotionCueForm from "./MotionCueForm";
import { SMOOTHING_LEVELS, MotionSmoothing } from "./normalizeMotion";

/** A cue being previewed while paused, and how far through it the view is. */
export interface MotionPreview {
    cueId: string;
    progress: number;
}

export interface Motion {
    clips: MotionClip[];
    cues: MotionCue[];
}

const PREVIEW_START = 0.5;

/**
 * Imports performer motions (BVH, glTF / GLB, FBX from motion capture or 3D
 * tools) and plays them on marchers at given counts. Saved with the show and
 * drawn during playback and in 3D videos.
 */
// eslint-disable-next-line max-lines-per-function
export default function MotionPanel({
    motion,
    onChange,
    marchers,
    pages,
    selectedPage,
    selectedMarcherIds,
    onSelectPage,
    preview,
    onPreviewChange,
}: {
    motion: Motion;
    onChange: (motion: Motion) => void;
    marchers: readonly Marcher[];
    pages: readonly Page[];
    selectedPage: Page | null;
    selectedMarcherIds: readonly number[];
    onSelectPage: (pageId: number) => void;
    preview: MotionPreview | null;
    onPreviewChange: (preview: MotionPreview | null) => void;
}) {
    const { t } = useTolgee();
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const { view3d } = uiSettings;
    const setOpen = (motionPanelOpen: boolean) =>
        setUiSettings({
            ...uiSettings,
            view3d: {
                ...view3d,
                motionPanelOpen,
                // Both panels sit in the same corner
                equipmentPanelOpen: motionPanelOpen
                    ? false
                    : view3d.equipmentPanelOpen,
            },
        });

    const { clips, cues } = motion;
    const fileInput = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const [smoothing, setSmoothing] = useState<MotionSmoothing>("medium");
    const [draft, setDraft] = useState<MotionCueDraft | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const editing = cues.find((cue) => cue.id === editingId) ?? null;

    const sections = useMemo(
        () => [...new Set(marchers.map((marcher) => marcher.section))].sort(),
        [marchers],
    );
    const clipIds = useMemo(
        () => new Set(clips.map((clip) => clip.id)),
        [clips],
    );

    if (!view3d.motionPanelOpen)
        return (
            <Button
                className="absolute top-[3.25rem] right-[4.5rem] z-10"
                variant="secondary"
                size="compact"
                content="icon"
                tooltipText={t("field3d.motion.open")}
                aria-label={t("field3d.motion.open")}
                onClick={() => setOpen(true)}
                data-testid="openMotionPanel"
            >
                <PersonSimpleRunIcon size={18} />
            </Button>
        );

    const drillNumberOf = (marcherId: number) =>
        marchers.find((marcher) => marcher.id === marcherId)?.drill_number ??
        String(marcherId);

    const targetOptions: TargetOption[] = [
        ...sections.map((section) => ({
            value: sectionChoice(section),
            label: section,
        })),
        ...(selectedMarcherIds.length > 0
            ? [
                  {
                      value: SELECTION_TARGET,
                      label: t("field3d.equipment.target.selection", {
                          count: selectedMarcherIds.length,
                      }),
                  },
              ]
            : []),
        // Editing a cue for one marcher keeps that marcher in the list
        ...(editing?.target.kind === "marcher"
            ? [
                  {
                      value: marcherChoice(editing.target.marcherId),
                      label: drillNumberOf(editing.target.marcherId),
                  },
              ]
            : []),
    ];
    const clipOptions = clips.map((clip) => ({
        value: clip.id,
        label: clip.name,
    }));
    const defaultTarget =
        selectedMarcherIds.length > 0
            ? SELECTION_TARGET
            : (targetOptions[0]?.value ?? "");
    const currentDraft =
        draft ?? newCueDraft(clips[clips.length - 1]?.id ?? "", defaultTarget);

    const page = editing
        ? pages.find((other) => other.id === editing.pageId)
        : selectedPage;
    const pageCanHoldCues = editing !== null || (selectedPage?.counts ?? 0) > 0;
    const made = page
        ? cuesFromDraft(currentDraft, {
              pageId: page.id,
              selectedMarcherIds,
              clipIds,
              existingId: editing?.id,
          })
        : null;
    const canSubmit = made !== null && pageCanHoldCues;
    const chosenClip = clips.find((clip) => clip.id === currentDraft.clipId);
    const naturalLength =
        chosenClip && page
            ? naturalLengthCounts(
                  chosenClip,
                  page,
                  Number(currentDraft.startCount) || 0,
              )
            : null;

    const finishEditing = () => {
        setEditingId(null);
        setDraft(null);
    };
    const submit = () => {
        if (!made) return;
        onChange({ clips, cues: withMoves(cues, made, editing?.id) });
        finishEditing();
    };

    const importFile = async (file: File) => {
        setImporting(true);
        try {
            const clip = await importMotionFile(
                file.name,
                await file.arrayBuffer(),
                smoothing,
            );
            onChange({ clips: [...clips, clip], cues });
            // Ready to place the new clip, at its natural length
            const length = selectedPage
                ? naturalLengthCounts(clip, selectedPage, 0)
                : Number(currentDraft.lengthCounts);
            setDraft({
                ...currentDraft,
                clipId: clip.id,
                lengthCounts: String(length),
            });
            toast.success(t("field3d.motion.imported", { name: clip.name }));
        } catch (error) {
            console.error("Could not import motion", error);
            toast.error(
                error instanceof MotionImportError
                    ? t(`field3d.motion.importError.${error.reason}`, {
                          ...error.details,
                      })
                    : t("field3d.motion.importError.unreadable"),
            );
        } finally {
            setImporting(false);
        }
    };

    const removeClip = (clip: MotionClip) => {
        const previewed = cues.find((cue) => cue.id === preview?.cueId);
        onChange(withoutClip(motion, clip.id));
        if (currentDraft.clipId === clip.id) finishEditing();
        if (previewed?.clipId === clip.id) onPreviewChange(null);
    };
    const removeCue = (cue: MotionCue) => {
        onChange({ clips, cues: cues.filter((other) => other.id !== cue.id) });
        if (editingId === cue.id) finishEditing();
        if (preview?.cueId === cue.id) onPreviewChange(null);
    };
    const togglePreview = (cue: MotionCue) => {
        if (preview?.cueId === cue.id) return onPreviewChange(null);
        // Show the formation the cue happens in
        if (selectedPage?.id !== cue.pageId) onSelectPage(cue.pageId);
        onPreviewChange({ cueId: cue.id, progress: PREVIEW_START });
    };

    const describe = (cue: MotionCue) => {
        const cuePage = pages.find((other) => other.id === cue.pageId);
        const clip = clips.find((other) => other.id === cue.clipId);
        const who =
            cue.target.kind === "section"
                ? cue.target.section
                : drillNumberOf(cue.target.marcherId);
        const end = cue.startCount + cue.lengthCounts;
        return `${t("field3d.equipment.page", { page: cuePage?.name ?? "?" })} · ${cue.startCount}–${end} · ${who} · ${clip?.name ?? "?"}`;
    };

    const iconButton = (
        labelKey: string,
        icon: ReactNode,
        onClick: () => void,
        active = false,
    ) => (
        <Button
            variant={active ? "secondary" : "ghost"}
            size="compact"
            content="icon"
            tooltipText={t(labelKey)}
            aria-label={t(labelKey)}
            onClick={onClick}
        >
            {icon}
        </Button>
    );

    return (
        <div
            className="rounded-6 border-stroke bg-modal text-text absolute top-[3.25rem] right-8 z-10 flex max-h-[calc(100%-4.5rem)] w-[21rem] flex-col gap-8 overflow-y-auto border p-12 shadow-md"
            data-testid="motionPanel"
        >
            <div className="flex items-center justify-between gap-8">
                <h4 className="text-body font-medium">
                    <T keyName="field3d.motion.title" />
                </h4>
                {iconButton("field3d.motion.close", <XIcon size={16} />, () =>
                    setOpen(false),
                )}
            </div>
            <p className="text-sub text-text-subtitle">
                <T keyName="field3d.motion.hint" />
            </p>

            <h5 className="text-sub font-medium">
                <T keyName="field3d.motion.clips" />
            </h5>
            <div className="flex items-end gap-8">
                <label className="text-sub text-text-subtitle flex flex-1 flex-col gap-4">
                    <T keyName="field3d.motion.smoothing.label" />
                    <Select
                        value={smoothing}
                        onValueChange={(value) =>
                            setSmoothing(value as MotionSmoothing)
                        }
                    >
                        <SelectTriggerButton
                            label={t(`field3d.motion.smoothing.${smoothing}`)}
                            className="w-full whitespace-nowrap"
                        />
                        <SelectContent>
                            {SMOOTHING_LEVELS.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {t(`field3d.motion.smoothing.${option}`)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
                <Button
                    size="compact"
                    disabled={importing || clips.length >= MAX_CLIPS}
                    onClick={() => fileInput.current?.click()}
                    data-testid="importMotion"
                >
                    <UploadSimpleIcon size={16} />
                    <T
                        keyName={
                            importing
                                ? "field3d.motion.importing"
                                : "field3d.motion.import"
                        }
                    />
                </Button>
                <input
                    ref={fileInput}
                    type="file"
                    accept={MOTION_FILE_EXTENSIONS.join(",")}
                    className="hidden"
                    data-testid="motionFileInput"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void importFile(file);
                    }}
                />
            </div>
            <ul className="flex flex-col gap-4">
                {clips.map((clip) => (
                    <li key={clip.id} className="flex items-center gap-4">
                        <span className="text-sub flex-1 truncate">
                            {clip.name}
                        </span>
                        <span className="text-sub text-text-subtitle">
                            {t("field3d.motion.seconds", {
                                seconds: clipDurationSeconds(clip).toFixed(1),
                            })}
                        </span>
                        {iconButton(
                            "field3d.motion.deleteClip",
                            <TrashIcon size={16} />,
                            () => removeClip(clip),
                        )}
                    </li>
                ))}
            </ul>
            {clips.length === 0 && (
                <p className="text-sub text-text-subtitle">
                    <T keyName="field3d.motion.noClips" />
                </p>
            )}

            {clips.length > 0 && (
                <>
                    <h5 className="text-sub font-medium">
                        <T keyName="field3d.motion.cues" />
                    </h5>
                    {!pageCanHoldCues && (
                        <p className="text-sub text-text-subtitle">
                            <T keyName="field3d.equipment.noPage" />
                        </p>
                    )}
                    <MotionCueForm
                        draft={currentDraft}
                        onDraftChange={setDraft}
                        clipOptions={clipOptions}
                        targetOptions={targetOptions}
                        naturalLength={naturalLength}
                        isEditing={editing !== null}
                        canSubmit={canSubmit}
                        onSubmit={submit}
                        onCancel={finishEditing}
                    />
                    <ul className="flex flex-col gap-4">
                        {sortEquipmentMoves(cues, pages).map((cue) => (
                            <li
                                key={cue.id}
                                className="flex items-center gap-4"
                            >
                                <span className="text-sub flex-1 truncate">
                                    {describe(cue)}
                                </span>
                                {iconButton(
                                    preview?.cueId === cue.id
                                        ? "field3d.equipment.previewClose"
                                        : "field3d.motion.previewOpen",
                                    <EyeIcon size={16} />,
                                    () => togglePreview(cue),
                                    preview?.cueId === cue.id,
                                )}
                                {iconButton(
                                    "field3d.motion.edit",
                                    <PencilSimpleIcon size={16} />,
                                    () => {
                                        setEditingId(cue.id);
                                        setDraft(draftFromCue(cue));
                                    },
                                )}
                                {iconButton(
                                    "field3d.motion.delete",
                                    <TrashIcon size={16} />,
                                    () => removeCue(cue),
                                )}
                            </li>
                        ))}
                    </ul>
                    {cues.length === 0 && (
                        <p className="text-sub text-text-subtitle">
                            <T keyName="field3d.motion.noCues" />
                        </p>
                    )}
                </>
            )}

            {preview && (
                <div className="flex flex-col gap-4">
                    <span className="text-sub text-text-subtitle">
                        <T keyName="field3d.equipment.preview" />
                    </span>
                    <Slider
                        min={0}
                        max={1}
                        step={0.005}
                        value={[preview.progress]}
                        aria-label={t("field3d.equipment.preview")}
                        onValueChange={([progress]) =>
                            onPreviewChange({ ...preview, progress })
                        }
                    />
                </div>
            )}
        </div>
    );
}
