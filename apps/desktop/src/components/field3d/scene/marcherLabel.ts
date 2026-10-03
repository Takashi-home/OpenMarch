/** The text a marcher is labelled with in the 3D view: their name, or the drill number when unnamed. */
export function marcherLabelText(marcher: {
    name?: string | null;
    drill_number: string;
}): string {
    const name = marcher.name?.trim();
    return name ? name : marcher.drill_number;
}
