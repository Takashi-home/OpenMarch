import {
    Button,
    Checkbox,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
    UnitInput,
} from "@openmarch/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { T, useTolgee } from "@tolgee/react";
import type { TargetOption } from "../equipment/EquipmentMoveForm";
import type { MotionCueDraft } from "./motionCueDraft";
import { PROP_HANDS, PropHand } from "./motionCues";

/** Fields for one motion cue: which clip, who, when, and how it is held. */
export default function MotionCueForm({
    draft,
    onDraftChange,
    clipOptions,
    targetOptions,
    naturalLength,
    isEditing,
    canSubmit,
    onSubmit,
    onCancel,
}: {
    draft: MotionCueDraft;
    onDraftChange: (draft: MotionCueDraft) => void;
    clipOptions: readonly TargetOption[];
    targetOptions: readonly TargetOption[];
    /** Counts the chosen clip lasts at its natural speed on this page */
    naturalLength: number | null;
    isEditing: boolean;
    canSubmit: boolean;
    onSubmit: () => void;
    onCancel: () => void;
}) {
    const { t } = useTolgee();
    const change = (changes: Partial<MotionCueDraft>) =>
        onDraftChange({ ...draft, ...changes });

    const select = (
        labelKey: string,
        value: string,
        options: readonly TargetOption[],
        onChange: (value: string) => void,
    ) => (
        <label className="text-sub text-text-subtitle flex flex-col gap-4">
            <T keyName={labelKey} />
            <Select value={value} onValueChange={onChange}>
                <SelectTriggerButton
                    label={
                        options.find((option) => option.value === value)
                            ?.label ?? ""
                    }
                    className="w-full whitespace-nowrap"
                />
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </label>
    );

    const numberField = (
        labelKey: string,
        field: "startCount" | "lengthCounts",
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

    const handOptions = PROP_HANDS.map((hand) => ({
        value: hand,
        label: t(`field3d.motion.propHand.${hand}`),
    }));

    return (
        <form
            className="flex flex-col gap-8"
            data-testid="motionCueForm"
            onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) onSubmit();
            }}
        >
            {select(
                "field3d.motion.clip",
                draft.clipId,
                clipOptions,
                (clipId) => change({ clipId }),
            )}
            {select(
                "field3d.equipment.target.label",
                draft.target,
                targetOptions,
                (target) => change({ target }),
            )}
            <div className="grid grid-cols-2 gap-8">
                {numberField("field3d.equipment.start", "startCount", null, 0)}
                {numberField(
                    "field3d.equipment.length",
                    "lengthCounts",
                    "field3d.equipment.count.unit",
                    1,
                )}
            </div>
            {naturalLength !== null && (
                <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    className="self-start"
                    onClick={() =>
                        change({ lengthCounts: String(naturalLength) })
                    }
                >
                    <T
                        keyName="field3d.motion.naturalLength"
                        params={{ counts: naturalLength }}
                    />
                </Button>
            )}
            {select(
                "field3d.motion.propHand.label",
                draft.propHand,
                handOptions,
                (propHand) => change({ propHand: propHand as PropHand }),
            )}
            <label className="text-sub text-text flex items-center gap-8">
                <Checkbox
                    checked={draft.mirror}
                    onCheckedChange={(checked) =>
                        change({ mirror: checked === true })
                    }
                />
                <T keyName="field3d.motion.mirror" />
            </label>
            <div className="flex gap-8">
                <Button
                    type="submit"
                    size="compact"
                    className="flex-1"
                    disabled={!canSubmit}
                    data-testid="addMotionCue"
                >
                    {!isEditing && <PlusIcon size={16} />}
                    <T
                        keyName={
                            isEditing
                                ? "field3d.motion.update"
                                : "field3d.motion.add"
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
