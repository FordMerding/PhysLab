import { el } from "./dom";
import { tabs } from "./widgets";

export interface LayoutParts {
    objects: HTMLElement;
    world: HTMLElement;
    view: HTMLElement;
    sim: HTMLElement;
    inspector: HTMLElement;
    quickBar: HTMLElement;
    hint: HTMLElement;
}

const MOBILE_QUERY = "(max-width: 900px)";

// Wide screens: a dock on the left (Objects / World / View) and a column on the right
// (simulation window and inspector). Narrow screens: a quick run bar on top and a bottom
// navigation that opens one panel at a time as a sheet. The same elements move between both.
export function createLayout(root: HTMLElement, parts: LayoutParts, hasSelection: () => boolean) {
    const query = window.matchMedia(MOBILE_QUERY);
    let sheetTab: string | null = null;
    let sheetBody: HTMLElement | null = null;
    let sheet: HTMLElement | null = null;
    let navButtons: Array<{ name: string; button: HTMLButtonElement }> = [];

    const mobileTabs: Array<[string, HTMLElement]> = [
        ["Objects", parts.objects],
        ["World", parts.world],
        ["View", parts.view],
        ["Sim", parts.sim],
        ["Inspector", parts.inspector],
    ];

    const desktop = (): void => {
        const left = el("div", "panel left");
        left.append(
            tabs([
                { name: "Objects", content: parts.objects },
                { name: "World", content: parts.world },
                { name: "View", content: parts.view },
            ])
        );
        const right = el("div", "right");
        right.append(parts.sim, parts.inspector);
        root.replaceChildren(left, right, parts.hint);
    };

    const setSheet = (name: string | null): void => {
        sheetTab = name;
        const content = mobileTabs.find(([n]) => n === name)?.[1];
        sheet?.classList.toggle("open", content !== undefined);
        sheetBody?.replaceChildren(...(content ? [content] : []));
        for (const n of navButtons) {
            n.button.classList.toggle("active", n.name === name);
            if (n.name === "Inspector") n.button.classList.toggle("hidden", !hasSelection());
        }
    };

    const mobile = (): void => {
        sheet = el("div", "sheet");
        sheetBody = el("div", "sheet-body");
        sheet.append(sheetBody);
        const nav = el("div", "nav");
        navButtons = mobileTabs.map(([name]) => {
            const b = el("button", "", name);
            b.type = "button";
            b.addEventListener("click", () => setSheet(sheetTab === name ? null : name));
            nav.append(b);
            return { name, button: b };
        });
        root.replaceChildren(parts.quickBar, sheet, nav, parts.hint);
        setSheet(sheetTab === "Inspector" && !hasSelection() ? null : sheetTab);
    };

    const render = (): void => (query.matches ? mobile() : desktop());
    query.addEventListener("change", render);
    render();

    return {
        // the inspector pops up when something gets selected on a small screen
        selectionChanged(): void {
            if (!query.matches) return;
            if (hasSelection()) setSheet("Inspector");
            else setSheet(sheetTab === "Inspector" ? null : sheetTab);
        },
    };
}