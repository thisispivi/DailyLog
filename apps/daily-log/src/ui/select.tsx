"use client";

import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { usePortalContainer } from "@/ui/sheet";

import "./controls.css";

export type SelectOption<Value extends string> = Readonly<{
    icon?: ReactNode;
    label: string;
    value: Value;
}>;

/**
 * A styled dropdown on Radix Select. With `name` it also renders a hidden native
 * select, so it submits through FormData like a normal form field.
 */
export function Select<Value extends string>({
    defaultValue,
    disabled = false,
    id,
    name,
    onValueChange,
    options,
    value,
}: Readonly<{
    defaultValue?: Value;
    disabled?: boolean;
    id: string;
    name?: string;
    onValueChange?: (value: Value) => void;
    options: ReadonlyArray<SelectOption<Value>>;
    value?: Value;
}>) {
    const container = usePortalContainer();
    return (
        <RadixSelect.Root
            disabled={disabled}
            onValueChange={(next) => onValueChange?.(next as Value)}
            {...(defaultValue === undefined ? {} : { defaultValue })}
            {...(name === undefined ? {} : { name })}
            {...(value === undefined ? {} : { value })}
        >
            <RadixSelect.Trigger className="select-trigger" id={id}>
                <RadixSelect.Value />
                <RadixSelect.Icon className="select-chevron">
                    <ChevronDown aria-hidden="true" size={18} />
                </RadixSelect.Icon>
            </RadixSelect.Trigger>
            <RadixSelect.Portal container={container}>
                <RadixSelect.Content className="select-content" position="popper" sideOffset={6}>
                    <RadixSelect.Viewport className="select-viewport">
                        {options.map((option) => (
                            <RadixSelect.Item
                                className="select-item"
                                key={option.value}
                                value={option.value}
                            >
                                {option.icon}
                                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                                <RadixSelect.ItemIndicator className="select-check">
                                    <Check aria-hidden="true" size={16} />
                                </RadixSelect.ItemIndicator>
                            </RadixSelect.Item>
                        ))}
                    </RadixSelect.Viewport>
                </RadixSelect.Content>
            </RadixSelect.Portal>
        </RadixSelect.Root>
    );
}
