import { Text as RNText, type TextProps } from 'react-native';

type Variant = 'title' | 'heading' | 'body' | 'label' | 'caption';

const VARIANTS: Record<Variant, { base: string; color: string }> = {
  title: { base: 'text-[28px] leading-[34px] font-bold', color: 'text-text' },
  heading: { base: 'text-[17px] leading-[22px] font-semibold', color: 'text-text' },
  body: { base: 'text-[16px] leading-[22px]', color: 'text-text' },
  label: {
    base: 'text-[13px] leading-[18px] font-semibold uppercase tracking-wide',
    color: 'text-muted',
  },
  caption: { base: 'text-[13px] leading-[18px]', color: 'text-muted' },
};

// A caller-supplied color class must win; two color utilities on one element resolve by
// stylesheet order, not class order, so the default is dropped instead.
const COLOR_CLASS =
  /(^|\s)text-(text|muted|faint|accent|accent-soft|on-accent|danger|success|warning|bg)(\s|$)/;

export interface AppTextProps extends TextProps {
  variant?: Variant;
  className?: string;
}

/** Text with the type scale. Dynamic type is on (RN default `allowFontScaling`). */
export function Text({ variant = 'body', className = '', ...props }: AppTextProps) {
  const v = VARIANTS[variant];
  const color = COLOR_CLASS.test(className) ? '' : v.color;
  return (
    <RNText maxFontSizeMultiplier={1.8} className={`${v.base} ${color} ${className}`} {...props} />
  );
}
