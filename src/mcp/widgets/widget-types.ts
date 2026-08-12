export interface TextWidgetNode {
  readonly type: "Text";
  readonly value: string;
  readonly size?: "xs" | "sm" | "md" | "lg" | "xl";
  readonly weight?: "normal" | "medium" | "semibold" | "bold";
  readonly color?: string;
  readonly maxLines?: number;
}

export interface TitleWidgetNode {
  readonly type: "Title";
  readonly value: string;
  readonly size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";
  readonly weight?: "normal" | "medium" | "semibold" | "bold";
  readonly color?: string;
  readonly maxLines?: number;
}

export interface CaptionWidgetNode {
  readonly type: "Caption";
  readonly value: string;
  readonly size?: "sm" | "md" | "lg";
  readonly weight?: "normal" | "medium" | "semibold" | "bold";
  readonly color?: string;
  readonly maxLines?: number;
}

export interface DividerWidgetNode {
  readonly type: "Divider";
  readonly spacing?: number | string;
  readonly color?: string;
  readonly size?: number | string;
}

export interface BadgeWidgetNode {
  readonly type: "Badge";
  readonly label: string;
  readonly color?: "secondary" | "success" | "danger" | "warning" | "info" | "discovery";
  readonly variant?: "solid" | "soft" | "outline";
  readonly pill?: boolean;
  readonly size?: "sm" | "md" | "lg";
  readonly key?: string;
}

interface LayoutWidgetNode {
  readonly children: WidgetNode[];
  readonly gap?: number | string;
  readonly padding?: number | string;
  readonly align?: "start" | "center" | "end" | "baseline" | "stretch";
  readonly justify?: "start" | "center" | "end" | "stretch" | "between" | "around" | "evenly";
  readonly flex?: number | string;
  readonly width?: number | string;
  readonly background?: string;
  readonly radius?:
    | "2xs"
    | "xs"
    | "sm"
    | "md"
    | "lg"
    | "xl"
    | "2xl"
    | "3xl"
    | "4xl"
    | "full"
    | "100%"
    | "none";
}

export interface BoxWidgetNode extends LayoutWidgetNode {
  readonly type: "Box";
  readonly direction?: "row" | "col";
}

export interface RowWidgetNode extends LayoutWidgetNode {
  readonly type: "Row";
}

export interface ColWidgetNode extends LayoutWidgetNode {
  readonly type: "Col";
}

export type WidgetNode =
  | TextWidgetNode
  | TitleWidgetNode
  | CaptionWidgetNode
  | DividerWidgetNode
  | BadgeWidgetNode
  | BoxWidgetNode
  | RowWidgetNode
  | ColWidgetNode;

/**
 * Kakao가 출처 상태를 자동 표시하므로 status 필드는 의도적으로 제공하지 않는다.
 */
export interface CardWidgetRoot {
  readonly type: "Card";
  readonly children: WidgetNode[];
  readonly size?: "sm" | "md" | "lg" | "full";
  readonly padding?: number | string;
  readonly background?: string;
  readonly key?: string;
}

export type ChatKitWidgetRoot = CardWidgetRoot;

export interface KakaoWidgetEnvelope {
  readonly widget: ChatKitWidgetRoot;
  readonly copy_text: string;
}
