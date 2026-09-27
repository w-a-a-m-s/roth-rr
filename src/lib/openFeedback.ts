import { useUI } from "@/store/useUI";

/** Open the product feedback form (signed-in users). */
export function openFeedback() {
  useUI.getState().openFeedback();
}
