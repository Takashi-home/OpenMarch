import { useMemo, useState } from "react";
import { Button, Slider } from "@openmarch/ui";
import {
    EyeIcon,
    FlagIcon,
    PencilSimpleIcon,
    TrashIcon,
    XIcon,
} from "@phosphor-icons/react";
import { T, useTolgee } from "@tolgee/react";
import { OVERLAY_CONTROL_CLASS } from "../overlayStyle";
import type Marcher from "@/global/classes/Marcher";
import type Page from "@/global/classes/Page";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { EquipmentMove, sortEquipmentMoves } from "../scene/equipmentMoves";
import EquipmentMoveForm, { TargetOption } from "./EquipmentMoveForm";
import {
    draftFromMove,
    EquipmentMoveDraft,
    marcherChoice,
    movableMarchers,
    movesFromDraft,
    newDraft,
    sectionChoice,
    SELECTION_TARGET,
    withMoves,
} from "./equipmentMoveDraft";

/** A move being previewed while paused, and how far through it the view is. */
export interface EquipmentPreview {
    moveId: string;
    progress: number;
}

const PREVIEW_START = 0.5;

/**
 * Lists the show's flag and rifle moves over the 3D view and edits them. Moves
 * are saved with the show and drawn during playback and in 3D videos.
 */
// eslint-disable-next-line max-lines-per-function
export default function EquipmentMovesPanel({
    moves,
    onChange,
    marchers,
    pages,
    selectedPage,
    selectedMarcherIds,
    onSelectPage,
    preview,
    onPreviewChange,
}: {
    moves: readonly EquipmentMove[];
    onChange: (moves: EquipmentMove[]) => void;
    marchers: readonly Marcher[];
    pages: readonly Page[];
    selectedPage: Page | null;
    selectedMarcherIds: readonly number[];
    onSelectPage: (pageId: number) => void;
    preview: EquipmentPreview | null;
    onPreviewChange: (preview: EquipmentPreview | null) => void;
}) {
    const { t } = useTolgee();
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const { view3d } = uiSettings;
    const setOpen = (equipmentPanelOpen: boolean) =>
        setUiSettings({
            ...uiSettings,
            view3d: {
                ...view3d,
                equipmentPanelOpen,
                // Both panels sit in the same corner
                motionPanelOpen: equipmentPanelOpen
                    ? false
                    : view3d.motionPanelOpen,
            },
        });

    const movable = useMemo(() => movableMarchers(marchers), [marchers]);
    const movableIds = useMemo(
        () => new Set(movable.map((marcher) => marcher.id)),
        [movable],
    );
    const sections = useMemo(
        () => [...new Set(movable.map((marcher) => marcher.section))].sort(),
        [movable],
    );
    const selectedMovableIds = useMemo(
        () => selectedMarcherIds.filter((id) => movableIds.has(id)),
        [selectedMarcherIds, movableIds],
    );

    const [draft, setDraft] = useState<EquipmentMoveDraft | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const editing = moves.find((move) => move.id === editingId) ?? null;

    if (!view3d.equipmentPanelOpen)
        return (
            <Button
                className={`absolute top-[3.25rem] right-8 z-10 ${OVERLAY_CONTROL_CLASS}`}
                variant="secondary"
                size="compact"
                content="icon"
                tooltipText={t("field3d.equipment.open")}
                aria-label={t("field3d.equipment.open")}
                onClick={() => setOpen(true)}
                data-testid="openEquipmentMoves"
            >
                <FlagIcon size={18} />
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
        ...(selectedMovableIds.length > 0
            ? [
                  {
                      value: SELECTION_TARGET,
                      label: t("field3d.equipment.target.selection", {
                          count: selectedMovableIds.length,
                      }),
                  },
              ]
            : []),
        // Editing a move for one marcher keeps that marcher in the list
        ...(editing?.target.kind === "marcher"
            ? [
                  {
                      value: marcherChoice(editing.target.marcherId),
                      label: drillNumberOf(editing.target.marcherId),
                  },
              ]
            : []),
    ];
    const currentDraft = draft ?? newDraft(targetOptions[0]?.value ?? "");

    const pageId = editing?.pageId ?? selectedPage?.id;
    const pageCanHoldMoves =
        editing !== null || (selectedPage?.counts ?? 0) > 0;
    const made =
        pageId !== undefined
            ? movesFromDraft(currentDraft, {
                  pageId,
                  selectedMarcherIds: selectedMovableIds,
                  existingId: editing?.id,
              })
            : null;
    const canSubmit = made !== null && pageCanHoldMoves;

    const finishEditing = () => {
        setEditingId(null);
        setDraft(null);
    };
    const submit = () => {
        if (!made) return;
        onChange(withMoves(moves, made, editing?.id));
        finishEditing();
    };
    const startEditing = (move: EquipmentMove) => {
        setEditingId(move.id);
        setDraft(draftFromMove(move));
    };
    const remove = (move: EquipmentMove) => {
        onChange(moves.filter((other) => other.id !== move.id));
        if (editingId === move.id) finishEditing();
        if (preview?.moveId === move.id) onPreviewChange(null);
    };
    const togglePreview = (move: EquipmentMove) => {
        if (preview?.moveId === move.id) return onPreviewChange(null);
        // Show the formation the move happens in
        if (selectedPage?.id !== move.pageId) onSelectPage(move.pageId);
        onPreviewChange({ moveId: move.id, progress: PREVIEW_START });
    };

    const describe = (move: EquipmentMove) => {
        const page = pages.find((other) => other.id === move.pageId);
        const who =
            move.target.kind === "section"
                ? move.target.section
                : drillNumberOf(move.target.marcherId);
        const end = move.startCount + move.lengthCounts;
        return `${t("field3d.equipment.page", { page: page?.name ?? "?" })} · ${move.startCount}–${end} · ${who} · ${t(`field3d.equipment.kind.${move.move}`)} ×${move.turns}`;
    };

    return (
        <div
            className="rounded-6 border-stroke bg-modal text-text absolute top-[3.25rem] right-8 z-10 flex max-h-[calc(100%-4.5rem)] w-[20rem] flex-col gap-8 overflow-hidden border p-12 shadow-md"
            data-testid="equipmentMovesPanel"
        >
            <div className="flex items-center justify-between gap-8">
                <h4 className="text-body font-medium">
                    <T keyName="field3d.equipment.title" />
                </h4>
                <Button
                    variant="ghost"
                    size="compact"
                    content="icon"
                    aria-label={t("field3d.equipment.close")}
                    onClick={() => setOpen(false)}
                >
                    <XIcon size={16} />
                </Button>
            </div>
            <p className="text-sub text-text-subtitle">
                <T keyName="field3d.equipment.hint" />
            </p>

            {targetOptions.length === 0 ? (
                <p className="text-sub text-text-subtitle">
                    <T keyName="field3d.equipment.noTargets" />
                </p>
            ) : (
                <>
                    {!pageCanHoldMoves && (
                        <p className="text-sub text-text-subtitle">
                            <T keyName="field3d.equipment.noPage" />
                        </p>
                    )}
                    <EquipmentMoveForm
                        draft={currentDraft}
                        onDraftChange={setDraft}
                        targetOptions={targetOptions}
                        isEditing={editing !== null}
                        canSubmit={canSubmit}
                        onSubmit={submit}
                        onCancel={finishEditing}
                    />
                </>
            )}

            <ul className="flex flex-col gap-4 overflow-y-auto">
                {sortEquipmentMoves(moves, pages).map((move) => (
                    <li key={move.id} className="flex items-center gap-4">
                        <span className="text-sub flex-1 truncate">
                            {describe(move)}
                        </span>
                        <Button
                            variant={
                                preview?.moveId === move.id
                                    ? "secondary"
                                    : "ghost"
                            }
                            size="compact"
                            content="icon"
                            tooltipText={t(
                                preview?.moveId === move.id
                                    ? "field3d.equipment.previewClose"
                                    : "field3d.equipment.previewOpen",
                            )}
                            aria-label={t(
                                preview?.moveId === move.id
                                    ? "field3d.equipment.previewClose"
                                    : "field3d.equipment.previewOpen",
                            )}
                            onClick={() => togglePreview(move)}
                        >
                            <EyeIcon size={16} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="compact"
                            content="icon"
                            tooltipText={t("field3d.equipment.edit")}
                            aria-label={t("field3d.equipment.edit")}
                            onClick={() => startEditing(move)}
                        >
                            <PencilSimpleIcon size={16} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="compact"
                            content="icon"
                            tooltipText={t("field3d.equipment.delete")}
                            aria-label={t("field3d.equipment.delete")}
                            onClick={() => remove(move)}
                        >
                            <TrashIcon size={16} />
                        </Button>
                    </li>
                ))}
            </ul>
            {moves.length === 0 && (
                <p className="text-sub text-text-subtitle">
                    <T keyName="field3d.equipment.empty" />
                </p>
            )}

            {preview && (
                <div className="flex flex-col gap-4">
                    <span className="text-sub text-text-subtitle">
                        <T keyName="field3d.equipment.preview" />
                    </span>
                    <Slider
                        min={0}
                        max={1}
                        step={0.01}
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
