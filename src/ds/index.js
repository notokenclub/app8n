"use client";

// The single entry point for the Zelleo design system.
//
// Everything in the app imports primitives from here — `@/ds` — and never from
// a component file directly (`_adherence.oxlintrc.json` → no-restricted-imports).
// The "use client" directive pulls the whole system into the client graph, so
// the components' event handlers and local state work wherever they are used.

export { Icon } from "./assets/icons/Icon.jsx";

export { Button } from "./components/buttons/Button.jsx";
export { IconButton } from "./components/buttons/IconButton.jsx";

export { DemoGridCard, FeatureCardTabbed } from "./components/cards/DemoGridCard.jsx";
export { SignatureCard, CalloutCard, CtaBand } from "./components/cards/SignatureCard.jsx";

export { BarChart } from "./components/data/BarChart.jsx";
export { DonutChart } from "./components/data/DonutChart.jsx";
export { Heatmap } from "./components/data/Heatmap.jsx";
export { LineChart } from "./components/data/LineChart.jsx";
export { LogConsole } from "./components/data/LogConsole.jsx";
export { MetricCard } from "./components/data/MetricCard.jsx";
export { Tabs } from "./components/data/Tabs.jsx";

export { Arrow, FlowArrow } from "./components/feedback/Arrow.jsx";
export { Badge, StatusBadge } from "./components/feedback/Badge.jsx";
export { Divider } from "./components/feedback/Divider.jsx";
export { IconBadge } from "./components/feedback/IconBadge.jsx";
export { IconTile } from "./components/feedback/IconTile.jsx";
export { NumberBadge } from "./components/feedback/NumberBadge.jsx";
export { PublishStatus } from "./components/feedback/PublishStatus.jsx";
export { SectionMessage } from "./components/feedback/SectionMessage.jsx";
export { TextBadge } from "./components/feedback/TextBadge.jsx";
export { Tip, Shortcut } from "./components/feedback/Tip.jsx";
export { Tooltip } from "./components/feedback/Tooltip.jsx";

export { Input } from "./components/forms/Input.jsx";
export { Switch, Checkbox } from "./components/forms/Switch.jsx";

export { NavigationButton, LinkItem } from "./components/navigation/NavigationButton.jsx";
export { Sidebar } from "./components/navigation/Sidebar.jsx";
export { TopNav, Footer } from "./components/navigation/TopNav.jsx";
