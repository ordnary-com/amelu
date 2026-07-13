// Minimal JSX typings for the Material 3 web components registered in
// material.ts. Only the props/attributes this app actually uses are typed.
// React 19 exposes its JSX namespace as React.JSX, not the legacy global
// JSX namespace, so intrinsic elements are augmented via module
// augmentation of "react" rather than `declare global { namespace JSX }`.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

type MdElementProps<T> = DetailedHTMLProps<HTMLAttributes<T>, T>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "md-checkbox": MdElementProps<HTMLElement> & {
        checked?: boolean;
        disabled?: boolean;
        name?: string;
        value?: string;
      };
      "md-radio": MdElementProps<HTMLElement> & {
        checked?: boolean;
        disabled?: boolean;
        name?: string;
        value?: string;
      };
      "md-outlined-text-field": MdElementProps<HTMLElement> & {
        label?: string;
        value?: string;
        placeholder?: string;
        disabled?: boolean;
        required?: boolean;
        readOnly?: boolean;
        type?: string;
        autocomplete?: string;
        min?: string | number;
        max?: string | number;
        step?: string | number;
        minlength?: number;
        maxlength?: number;
        rows?: number;
        supportingText?: string;
        suffixText?: string;
        errorText?: string;
        error?: boolean;
      };
      "md-outlined-select": MdElementProps<HTMLElement> & {
        label?: string;
        value?: string;
        disabled?: boolean;
        required?: boolean;
      };
      "md-select-option": MdElementProps<HTMLElement> & {
        value?: string;
        selected?: boolean;
        disabled?: boolean;
      };
      "md-filled-button": MdElementProps<HTMLElement> & {
        disabled?: boolean;
        type?: "button" | "submit" | "reset";
        href?: string;
        target?: string;
      };
      "md-outlined-button": MdElementProps<HTMLElement> & {
        disabled?: boolean;
        type?: "button" | "submit" | "reset";
        href?: string;
        target?: string;
      };
      "md-text-button": MdElementProps<HTMLElement> & {
        disabled?: boolean;
        type?: "button" | "submit" | "reset";
        href?: string;
        target?: string;
      };
      "md-list": MdElementProps<HTMLElement>;
      "md-list-item": MdElementProps<HTMLElement> & {
        type?: "text" | "button" | "link";
        href?: string;
        target?: string;
        disabled?: boolean;
      };
      "md-dialog": MdElementProps<HTMLElement> & {
        open?: boolean;
        type?: "alert";
      };
    }
  }
}

export {};
