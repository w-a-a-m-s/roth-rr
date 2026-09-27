export type FooterModalId = "terms" | "privacy" | "disclaimer";

export type FooterSection = {
  title?: string;
  body: string;
  link?: {
    href: string;
    label: string;
  };
};

export type FooterModalContent = {
  id: FooterModalId;
  label: string;
  title: string;
  sections: FooterSection[];
};

export const FOOTER_MODALS: FooterModalContent[] = [
  {
    id: "terms",
    label: "Terms of use",
    title: "Terms of use",
    sections: [],
  },
  {
    id: "privacy",
    label: "Privacy policy",
    title: "Privacy policy",
    sections: [],
  },
  {
    id: "disclaimer",
    label: "Disclaimer",
    title: "Disclaimer",
    sections: [],
  },
];

export function getFooterContent(id: FooterModalId): FooterModalContent {
  const content = FOOTER_MODALS.find((modal) => modal.id === id);
  if (!content) {
    throw new Error(`Unknown footer content id: ${id}`);
  }
  return content;
}
