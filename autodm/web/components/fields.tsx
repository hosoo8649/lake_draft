import type { ReactNode } from "react";
import { TextField, TextFieldInput, TextFieldTextarea } from "seed-design/ui/text-field";

interface BaseProps {
  label?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  placeholder?: string;
  description?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
  required?: boolean;
  suffix?: ReactNode;
  prefix?: ReactNode;
  type?: string;
  onEnter?: () => void;
  ariaLabel?: string;
  /** 오류 문구는 바깥에서 따로 보여 주고 칸만 빨갛게 */
  invalidOnly?: boolean;
}

export function TextInput(p: BaseProps) {
  return (
    <TextField
      label={p.label}
      value={p.value}
      maxGraphemeCount={p.max}
      onValueChange={({ value, slicedValue }) => p.onChange(p.max ? slicedValue : value)}
      description={p.description}
      invalid={!!p.error || p.invalidOnly}
      errorMessage={p.error}
      disabled={p.disabled}
      showRequiredIndicator={p.required}
      suffix={p.suffix}
      prefix={p.prefix}
    >
      <TextFieldInput
        placeholder={p.placeholder}
        autoFocus={p.autoFocus}
        type={p.type}
        aria-label={p.ariaLabel}
        onKeyDown={(e) => {
          if (e.key === "Enter" && p.onEnter && !e.nativeEvent.isComposing) {
            e.preventDefault();
            p.onEnter();
          }
        }}
      />
    </TextField>
  );
}

export function TextArea(p: BaseProps & { rows?: number }) {
  return (
    <TextField
      label={p.label}
      value={p.value}
      maxGraphemeCount={p.max}
      onValueChange={({ value, slicedValue }) => p.onChange(p.max ? slicedValue : value)}
      description={p.description}
      invalid={!!p.error}
      errorMessage={p.error}
      disabled={p.disabled}
      showRequiredIndicator={p.required}
    >
      <TextFieldTextarea
        placeholder={p.placeholder}
        autoFocus={p.autoFocus}
        aria-label={p.ariaLabel}
        style={p.rows ? { minHeight: `${p.rows * 1.5 + 1}em` } : undefined}
      />
    </TextField>
  );
}
