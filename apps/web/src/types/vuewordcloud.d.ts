/** vuewordcloud 类型声明（包未内置 TypeScript 类型）。 */
declare module "vuewordcloud" {
  import type { DefineComponent } from "vue";

  const VueWordCloud: DefineComponent<{
    words?: Array<[string, number] | { text: string; weight: number } | string>;
    color?: string | ((word: [string, number]) => string);
    fontFamily?: string | ((word: [string, number]) => string);
    fontSizeRatio?: number;
    fontStyle?: string | ((word: [string, number]) => string);
    fontVariant?: string | ((word: [string, number]) => string);
    fontWeight?: string | ((word: [string, number]) => string);
    spacing?: number;
    rotation?: number | ((word: [string, number]) => number);
    rotationUnit?: string | ((word: [string, number]) => string);
    animationDuration?: number;
    animationEasing?: string;
    animationOverlap?: number;
    enterAnimation?: Record<string, unknown> | string;
    leaveAnimation?: Record<string, unknown> | string;
  }>;

  export default VueWordCloud;
}
