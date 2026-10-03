import { schema } from "../database/db";
import { getSectionObjectByName } from "./Sections";

type Marcher = typeof schema.marchers.$inferSelect & {
    drill_number: string;
};
export default Marcher;

export const dbMarcherToMarcher = (
    dbMarcher: typeof schema.marchers.$inferSelect,
): Marcher => {
    return {
        ...dbMarcher,
        drill_number: `${dbMarcher.drill_prefix}${dbMarcher.drill_order}`,
    };
};

/** The text a marcher is labelled with on the field: their name, or the drill number when unnamed. */
export const marcherLabelText = (marcher: {
    name?: string | null;
    drill_number: string;
}): string => {
    const name = marcher.name?.trim();
    return name ? name : marcher.drill_number;
};

/**
 * Compares a marcher to another marcher based on their section and drill order.
 *
 * If the sections are different, the comparison is based on the section's compareTo method.
 * If the sections are the same, the comparison is based on the drill order.
 *
 * @param a - The first marcher to compare.
 * @param b - The second marcher to compare.
 * @returns The difference between the section and drill order of this marcher and the other marcher.
 */
export const compare = (a: Marcher, b: Marcher): number => {
    const aSectionObject = getSectionObjectByName(a.section);
    const bSectionObject = getSectionObjectByName(b.section);
    const sectionComparison = aSectionObject.compareTo(bSectionObject);
    if (sectionComparison !== 0)
        // If the sections are different, return the section comparison, ignoring the drill order
        return sectionComparison;
    // If the sections are the same, return the drill order comparison
    else return a.drill_order - b.drill_order;
};
