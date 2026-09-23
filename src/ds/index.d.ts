// Types for the Zelleo design system barrel (`index.js`).
//
// The prop lists mirror `_adherence.oxlintrc.json` exactly: a prop that is not
// declared here is a prop the design system does not accept.
import type { ReactElement, ReactNode } from "react";

export type IconName = string;

export function Icon(props: {
  name: IconName;
  size?: number;
}): ReactElement | null;

export function Button(props: {
  variant?:
    | "primary"
    | "primary-active"
    | "secondary"
    | "secondary-on-dark"
    | "ghost"
    | "legal"
    | "pill";
  size?: "md" | "sm";
  disabled?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit";
  "aria-label"?: string;
  style?: React.CSSProperties;
}): ReactElement;

export function IconButton(props: {
  icon?: ReactNode;
  size?: number;
  variant?: "circular" | "square";
  selected?: boolean;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit";
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  style?: React.CSSProperties;
}): ReactElement;

export function DemoGridCard(props: {
  title?: string;
  tint?: "canvas" | "sand" | "soft";
  height?: number;
  children?: ReactNode;
}): ReactElement;

export function FeatureCardTabbed(props: {
  tabs: string[];
  active?: number;
  onTabChange?: (index: number) => void;
  children?: ReactNode;
}): ReactElement;

export function SignatureCard(props: {
  surface?: "ember" | "charcoal" | "sand";
  eyebrow?: string;
  title?: string;
  body?: string;
  children?: ReactNode;
}): ReactElement;

export function CalloutCard(props: {
  title?: string;
  body?: string;
  children?: ReactNode;
}): ReactElement;

export function CtaBand(props: {
  title?: string;
  children?: ReactNode;
}): ReactElement;

export function BarChart(props: {
  data: Array<{ label: string; value: number }>;
  width?: number;
  height?: number;
}): ReactElement;

export function DonutChart(props: {
  data: Array<{ label: string; value: number; color?: string }>;
  size?: number;
  thickness?: number;
}): ReactElement;

export function Heatmap(props: {
  rows?: number;
  cols?: number;
  values: number[];
  colorScale?: string[];
}): ReactElement;

export function LineChart(props: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}): ReactElement;

export function LogConsole(props: {
  lines?: Array<{ time: string; text: string; level?: "info" | "warn" | "error" }>;
}): ReactElement;

export function MetricCard(props: {
  label: string;
  value: string | number;
  delta?: string;
  unit?: string;
}): ReactElement;

export function Tabs(props: {
  tabs: string[];
  active?: number;
  onChange?: (index: number) => void;
}): ReactElement;

export function Arrow(props: {
  direction?: "up" | "down" | "left" | "right";
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}): ReactElement;

export function FlowArrow(props: {
  direction?: "up" | "down" | "left" | "right";
  lineStyle?: "solid" | "dashed";
  color?: string;
  length?: number;
}): ReactElement;

export function Badge(props: {
  children?: ReactNode;
  tone?: "neutral" | "primary" | "success" | "danger";
  bold?: boolean;
}): ReactElement;

export function StatusBadge(props: {
  status?: "running" | "paused" | "error" | "scaling";
}): ReactElement;

export function Divider(props: {
  orientation?: "horizontal" | "vertical";
  tone?: "hairline" | "strong";
  style?: React.CSSProperties;
}): ReactElement;

export function IconBadge(props: {
  icon?: ReactNode;
  intent?: "neutral" | "primary" | "success" | "danger";
  size?: number;
}): ReactElement;

export function IconTile(props: {
  icon?: ReactNode;
  appearance?: "ember" | "charcoal" | "neutral";
  size?: number;
}): ReactElement;

export function NumberBadge(props: {
  count: number;
  tone?: "neutral" | "primary";
  max?: number;
}): ReactElement;

export function PublishStatus(props: {
  status?: "draft" | "review" | "published" | "deprecated";
}): ReactElement;

export function SectionMessage(props: {
  appearance?: "information" | "warning" | "danger" | "success" | "discovery";
  title?: string;
  children?: ReactNode;
  IconComponent?: typeof Icon;
}): ReactElement;

export function TextBadge(props: {
  children?: ReactNode;
  tone?: "neutral" | "primary";
}): ReactElement;

export function Tip(props: {
  children?: ReactNode;
  IconComponent?: typeof Icon;
}): ReactElement;

export function Shortcut(props: { keys?: string[] }): ReactElement;

export function Tooltip(props: {
  label: string;
  children?: ReactNode;
  position?: "top" | "bottom";
}): ReactElement;

export function Input(props: {
  label?: string;
  placeholder?: string;
  focused?: boolean;
  error?: boolean;
  icon?: ReactNode;
  type?: string;
  value?: string;
  disabled?: boolean;
  autoComplete?: string;
  spellCheck?: boolean;
  inputMode?: "text" | "numeric" | "email" | "search";
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}): ReactElement;

export function Switch(props: {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}): ReactElement;

export function Checkbox(props: {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}): ReactElement;

export function NavigationButton(props: {
  icon?: ReactNode;
  label?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}): ReactElement;

export function LinkItem(props: {
  label?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}): ReactElement;

export function Sidebar(props: {
  items: Array<{ label: string; icon?: ReactNode }>;
  active?: number;
  onSelect?: (index: number) => void;
  logo?: string;
}): ReactElement;

export function TopNav(props: {
  logo?: string;
  items?: string[];
  children?: ReactNode;
}): ReactElement;

export function Footer(props: {
  columns: Array<{ title: string; links: string[] }>;
}): ReactElement;
