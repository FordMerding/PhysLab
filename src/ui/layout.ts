import { el } from "./dom";
import { tabs } from "./widgets";

export interface LayoutParts {
    objects: HTMLElement;
    scene: HTMLElement;
    measure: HTMLElement;
    view: HTMLElement;
    inspector: HTMLElement;
    toolbar: HTMLElement;
    hint: HTMLElement;
}

const MOBILE_QUERY = "(max-width: 900px)";

// Wide screens: a dock on the left (Objects / Scene / Measure / View), the inspector on the right
// and the toolbar on top. Narrow screens: the toolbar on top and a bottom navigation that opens one
// panel at a time as a sheet. The same elements move between both.
export function createLayout(root: HTMLElement, parts: LayoutParts, hasSelection: () => boolean) {
    const query = window.matchMedia(MOBILE_QUERY);
    let sheetTab: string | null = null;
    let sheetBody: HTMLElement | null = null;
    let sheet: HTMLElement | null = null;
    let navButtons: Array<{ name: string; button: HTMLButtonElement }> = [];

    const mobileTabs: Array<[string, HTMLElement]> = [
        ["Objects", parts.objects],
        ["Scene", parts.scene],
        ["Measure", parts.measure],
        ["View", parts.view],
        ["Inspector", parts.inspector],
    ];

    const desktop = (): void => {
        const left = el("div", "panel left");
        left.append(
            tabs([
                { name: "Objects", content: parts.objects },
                { name: "Scene", content: parts.scene },
                { name: "Measure", content: parts.measure },
                { name: "View", content: parts.view },
            ])
        );
        const right = el("div", "right");
        right.append(parts.inspector);
        root.replaceChildren(parts.toolbar, left, right, parts.hint);
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
        root.replaceChildren(parts.toolbar, sheet, nav, parts.hint);
        setSheet(sheetTab === "Inspector" && !hasSelection() ? null : sheetTab);
    };

    const render = (): void => (query.matches ? mobile() : desktop());
    query.addEventListener("change", render);
    render();

    return {
        // On a small screen the Inspector button appears when something is selected; the sheet opens
        // by itself only if the user asked for that.
        selectionChanged(openByItself: boolean): void {
            if (!query.matches) return;
            if (hasSelection() && openByItself) setSheet("Inspector");
            else setSheet(!hasSelection() && sheetTab === "Inspector" ? null : sheetTab);
        },
        openInspector(): void {
            if (query.matches) setSheet("Inspector");
        },
        closeInspector(): void {
            if (query.matches && sheetTab === "Inspector") setSheet(null);
        },
    };
}