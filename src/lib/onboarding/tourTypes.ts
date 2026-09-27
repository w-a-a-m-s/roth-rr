export type TourPlacement =
  | "bottom-left"
  | "top-right"
  | "left-center"
  | "right-center";

export interface TourStepContent {
  id: string;
  title: string;
  body: string;
  placement: TourPlacement;
}
