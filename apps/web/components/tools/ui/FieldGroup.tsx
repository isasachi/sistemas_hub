import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BaseFieldProps {
  label: string;
  required?: boolean;
  helper?: string;
  id: string;
}

interface InputFieldProps extends BaseFieldProps {
  type: "input";
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}

interface TextareaFieldProps extends BaseFieldProps {
  type: "textarea";
  placeholder?: string;
  rows?: number;
  value: string;
  onChange: (v: string) => void;
}

interface SelectFieldProps extends BaseFieldProps {
  type: "select";
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}

type FieldGroupProps = InputFieldProps | TextareaFieldProps | SelectFieldProps;

// `jr-field` es el campo canónico del sistema (color, borde y anillo de foco):
// así el foco se ve igual acá, en el brief de branding y en la calculadora.
const fieldClass = "jr-field rounded-lg";

export function FieldGroup(props: FieldGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={props.id}
        className="text-[13px] font-semibold text-[#ededed]"
      >
        {props.label}
        {props.required && (
          <span className="text-[#ff9b4a] ml-0.5" aria-hidden>
            *
          </span>
        )}
        {props.helper && (
          <span className="text-[#bebebe] font-normal ml-1.5">
            {props.helper}
          </span>
        )}
      </label>

      {props.type === "input" && (
        <Input
          id={props.id}
          placeholder={props.placeholder}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className={fieldClass}
        />
      )}

      {props.type === "textarea" && (
        <Textarea
          id={props.id}
          placeholder={props.placeholder}
          rows={props.rows ?? 3}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className={fieldClass}
        />
      )}

      {props.type === "select" && (
        <Select value={props.value} onValueChange={(v) => props.onChange(v ?? "")}>
          <SelectTrigger id={props.id} className={fieldClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#0c0c0d] border-white/[0.06] text-[#ededed]">
            {props.options.map((opt) => (
              <SelectItem
                key={opt.value}
                value={opt.value}
                className="focus:bg-white/[0.07] focus:text-[#ededed] cursor-pointer"
              >
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
