import {
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
    UnitInput,
} from "@openmarch/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { T, useTolgee } from "@tolgee/react";
import {
    EQUIPMENT_MOVE_KINDS,
    EquipmentMoveKind,
    SpinDirection,
} from "../scene/equipmentMoves";
import type { EquipmentMoveDraft } from "./equipmentMoveDraft";

const DIRECTIONS: readonly SpinDirection[] = ["cw", "ccw"];

export interface TargetOption {
    value: string;
    label: string;
}

/** Fields for one flag or rifle move: who, what, when, and how much. */
export default function EquipmentMoveForm({
    draft,
    onDraftChange,
    targetOptions,
    isEditing,
    canSubmit,
    onSubmit,
    onCancel,
}: {
    draft: EquipmentMoveDraft;
    onDraftChange: (draft: EquipmentMoveDraft) => void;
    targetOptions: readonly TargetOption[];
    isEditing: boolean;
    canSubmit: boolean;
    onSubmit: () => void;
    onCancel: () => void;
}) {
    const { t } = useTolgee();
    const change = (changes: Partial<EquipmentMoveDraft>) =>
        onDraftChange({ ...draft, ...changes });
    const targetLabel =
        targetOptions.find((option) => option.value === draft.target)?.label ??
        "";
    const turnsKey =
        draft.move === "sweep"
            ? "field3d.equipment.turns.swings"
            : "field3d.equipment.turns.turns";

    const numberField = (
        labelKey: string,
        field: "startCount" | "lengthCounts" | "turns",
        unitKey: string | null,
        min: number,
    ) => (
        <label className="text-sub text-text-subtitle flex flex-col gap-4">
            <T keyName={labelKey} />
            <UnitInput
                unit={unitKey ? t(unitKey) : ""}
                step={1}
                min={min}
                compact
                value={draft[field]}
                onChange={(event) => change({ [field]: event.target.value })}
            />
        </label>
    );

    return (
        <form
            className="flex flex-col gap-8"
            data-testid="equipmentMoveForm"
            onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) onSubmit();
            }}
        >
            <label className="text-sub text-text-subtitle flex flex-col gap-4">
                <T keyName="field3d.equipment.target.label" />
                <Select
                    value={draft.target}
                    onValueChange={(target) => change({ target })}
                >
                    <SelectTriggerButton
                        label={targetLabel}
                        className="w-full whitespace-nowrap"
                    />
                    <SelectContent>
                        {targetOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </label>
            <div className="grid grid-cols-2 gap-8">
                <label className="text-sub text-text-subtitle flex flex-col gap-4">
                    <T keyName="field3d.equipment.kind.label" />
                    <Select
                        value={draft.move}
                        onValueChange={(move) =>
                            change({ move: move as EquipmentMoveKind })
                        }
                    >
                        <SelectTriggerButton
                            label={t(`field3d.equipment.kind.${draft.move}`)}
                            className="w-full whitespace-nowrap"
                        />
                        <SelectContent>
                            {EQUIPMENT_MOVE_KINDS.map((kind) => (
                                <SelectItem key={kind} value={kind}>
                                    {t(`field3d.equipment.kind.${kind}`)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
                <label className="text-sub text-text-subtitle flex flex-col gap-4">
                    <T keyName="field3d.equipment.direction.label" />
                    <Select
                        value={draft.direction}
                        onValueChange={(direction) =>
                            change({ direction: direction as SpinDirection })
                        }
                    >
                        <SelectTriggerButton
                            label={t(
                                `field3d.equipment.direction.${draft.direction}`,
                            )}
                            className="w-full whitespace-nowrap"
                        />
                        <SelectContent>
                            {DIRECTIONS.map((direction) => (
                                <SelectItem key={direction} value={direction}>
                                    {t(
                                        `field3d.equipment.direction.${direction}`,
                                    )}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
            </div>
            <div className="grid grid-cols-3 gap-8">
                {numberField("field3d.equipment.start", "startCount", null, 0)}
                {numberField(
                    "field3d.equipment.length",
                    "lengthCounts",
                    "field3d.equipment.count.unit",
                    1,
                )}
                {numberField(turnsKey, "turns", null, 1)}
            </div>
            <div className="flex gap-8">
                <Button
                    type="submit"
                    size="compact"
                    className="flex-1"
                    disabled={!canSubmit}
                    data-testid="addEquipmentMove"
                >
                    {!isEditing && <PlusIcon size={16} />}
                    <T
                        keyName={
                            isEditing
                                ? "field3d.equipment.update"
                                : "field3d.equipment.add"
                        }
                    />
                </Button>
                {isEditing && (
                    <Button
                        type="button"
                        size="compact"
                        variant="secondary"
                        onClick={onCancel}
                    >
                        <T keyName="field3d.equipment.cancel" />
                    </Button>
                )}
            </div>
        </form>
    );
}
