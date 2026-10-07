import { el } from "./dom";

export interface Control<T> {
    readonly element: HTMLElement;
    set(value: T): void;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const decimalsFor = (step: number): number => Math.min(6, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));

export interface NumberOptions {
    label: string;
    value: number;
    step?: number;
    min?: number;
    max?: number;
    unit?: string;
    onChange(value: number): void;
}

// Number input; dragging the label sideways scrubs the value (hold Shift for fine steps).
export function numberField(o: NumberOptions): Control<number> {
    const step = o.step ?? 0.1;
    const min = o.min ?? -Infinity;
    const max = o.max ?? Infinity;
    const decimals = decimalsFor(step);

    const label = el("label", "drag", o.label);
    const input = el("input");
    input.type = "number";
    input.step = String(step);
    const row = el("div", "row");
    row.append(label, input);
    if (o.unit) row.append(el("span", "unit", o.unit));

    let value = o.value;
    const show = (v: number): void => {
        input.value = String(Number(v.toFixed(decimals)));
    };
    const commit = (v: number): void => {
        if (!Number.isFinite(v)) return show(value);
        value = clamp(step >= 1 ? Math.round(v) : v, min, max);
        show(value);
        o.onChange(value);
    };
    show(value);
    input.addEventListener("change", () => commit(input.valueAsNumber));

    label.addEventListener("pointerdown", (e) => {
        label.setPointerCapture(e.pointerId);
        let last = e.clientX;
        let carry = value;
        const move = (m: PointerEvent): void => {
            carry += (m.clientX - last) * step * (m.shiftKey ? 0.1 : 1);
            last = m.clientX;
            commit(carry);
        };
        const up = (): void => {
            label.removeEventListener("pointermove", move);
            label.removeEventListener("pointerup", up);
        };
        label.addEventListener("pointermove", move);
        label.addEventListener("pointerup", up);
    });

    return {
        element: row,
        set(v) {
            value = v;
            if (document.activeElement !== input) show(v);
        },
    };
}

export interface SliderOptions {
    label: string;
    value: number;
    min: number;
    max: number;
    log?: boolean;
    format?(value: number): string;
    onChange(value: number): void;
}

export function slider(o: SliderOptions): Control<number> {
    const toValue = (p: number): number =>
        o.log ? o.min * (o.max / o.min) ** (p / 1000) : o.min + ((o.max - o.min) * p) / 1000;
    const toPos = (v: number): number =>
        o.log ? (1000 * Math.log(v / o.min)) / Math.log(o.max / o.min) : (1000 * (v - o.min)) / (o.max - o.min);
    const format = o.format ?? ((v: number) => String(Number(v.toPrecision(3))));

    const input = el("input");
    input.type = "range";
    input.min = "0";
    input.max = "1000";
    const text = el("span", "unit");
    const row = el("div", "row");
    row.append(el("label", "", o.label), input, text);

    const show = (v: number): void => {
        input.value = String(toPos(clamp(v, o.min, o.max)));
        text.textContent = format(v);
    };
    show(o.value);
    input.addEventListener("input", () => {
        const v = toValue(Number(input.value));
        text.textContent = format(v);
        o.onChange(v);
    });
    return { element: row, set: show };
}

export function checkbox(label: string, value: boolean, onChange: (v: boolean) => void): Control<boolean> {
    const input = el("input");
    input.type = "checkbox";
    input.checked = value;
    input.addEventListener("change", () => onChange(input.checked));
    const row = el("div", "row");
    row.append(el("label", "", label), input);
    return {
        element: row,
        set(v) {
            input.checked = v;
        },
    };
}

export function select(label: string, options: readonly string[], index: number, onChange: (i: number) => void): Control<number> {
    const input = el("select");
    options.forEach((name, i) => input.add(new Option(name, String(i))));
    input.selectedIndex = index;
    input.addEventListener("change", () => {
        onChange(input.selectedIndex);
        input.blur();
    });
    const row = el("div", "row");
    row.append(el("label", "", label), input);
    return {
        element: row,
        set(i) {
            input.selectedIndex = i;
        },
    };
}

// A number that can be switched off, e.g. an optional world boundary.
export function optionalNumber(
    label: string,
    enabled: boolean,
    value: number,
    unit: string,
    onChange: (enabled: boolean, value: number) => void
): Control<{ enabled: boolean; value: number }> {
    const toggle = el("input");
    toggle.type = "checkbox";
    const input = el("input");
    input.type = "number";
    input.step = "0.5";
    const row = el("div", "row");
    row.append(el("label", "", label), toggle, input, el("span", "unit", unit));

    let current = value;
    const sync = (on: boolean, v: number): void => {
        toggle.checked = on;
        input.disabled = !on;
        input.value = String(Number(v.toFixed(2)));
        current = v;
    };
    sync(enabled, value);
    toggle.addEventListener("change", () => {
        sync(toggle.checked, current);
        onChange(toggle.checked, current);
    });
    input.addEventListener("change", () => {
        if (!Number.isFinite(input.valueAsNumber)) return sync(toggle.checked, current);
        sync(toggle.checked, input.valueAsNumber);
        onChange(toggle.checked, current);
    });
    return { element: row, set: (s) => sync(s.enabled, s.value) };
}

export function button(text: string, onClick: () => void, className = ""): HTMLButtonElement {
    const b = el("button", className, text);
    b.type = "button";
    b.addEventListener("click", () => {
        onClick();
        b.blur();
    });
    return b;
}

export interface Readout {
    readonly element: HTMLElement;
    set(text: string): void;
}

export function readout(label: string): Readout {
    const value = el("span", "v");
    const root = el("div", "readout");
    root.append(el("span", "k", label), value);
    let last = "";
    return {
        element: root,
        set(text) {
            if (text !== last) {
                last = text;
                value.textContent = text;
            }
        },
    };
}

export function section(title: string): { element: HTMLElement; body: HTMLElement } {
    const root = el("div", "section");
    const head = el("div", "section-title", title);
    const body = el("div", "section-body");
    head.addEventListener("click", () => root.classList.toggle("collapsed"));
    root.append(head, body);
    return { element: root, body };
}

export function tabs(items: ReadonlyArray<{ name: string; content: HTMLElement }>): HTMLElement {
    const root = el("div", "tabs-root");
    const bar = el("div", "tabs");
    const body = el("div", "tab-body");
    const buttons = items.map((item, i) => {
        const b = el("button", "tab", item.name);
        b.type = "button";
        b.addEventListener("click", () => show(i));
        bar.append(b);
        return b;
    });
    const show = (index: number): void => {
        buttons.forEach((b, i) => b.classList.toggle("active", i === index));
        body.replaceChildren(items[index].content);
    };
    root.append(bar, body);
    show(0);
    return root;
}

export function textField(label: string, value: string, onChange: (v: string) => void): Control<string> {
    const input = el("input");
    input.type = "text";
    input.value = value;
    input.addEventListener("change", () => onChange(input.value));
    input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") input.blur();
    });
    const row = el("div", "row");
    row.append(el("label", "", label), input);
    return {
        element: row,
        set(v) {
            if (document.activeElement !== input) input.value = v;
        },
    };
}

export function colorField(label: string, value: string, onChange: (v: string) => void): Control<string> {
    const input = el("input");
    input.type = "color";
    input.value = value;
    input.addEventListener("input", () => onChange(input.value));
    const row = el("div", "row");
    row.append(el("label", "", label), input);
    return {
        element: row,
        set(v) {
            input.value = v;
        },
    };
}

// A read-only "label ..... value" line.
export function info(label: string): Readout {
    const value = el("span", "v");
    const root = el("div", "row info");
    root.append(el("label", "", label), value);
    let last = "";
    return {
        element: root,
        set(text) {
            if (text !== last) {
                last = text;
                value.textContent = text;
            }
        },
    };
}