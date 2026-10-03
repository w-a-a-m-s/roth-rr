import { DISCLAIMER_CLOSING, DISCLAIMER_SECTIONS } from "./disclaimer";
import { PRIVACY_EFFECTIVE_DATE, PRIVACY_SECTIONS } from "./privacy";
import { TERMS_EFFECTIVE_DATE, TERMS_SECTIONS } from "./terms";

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

function datedSections(
  effectiveDate: string,
  sections: readonly FooterSection[],
): FooterSection[] {
  return [
    {
      title: "Effective date",
      body: `Effective ${effectiveDate}.`,
    },
    ...sections,
  ];
}

export const FOOTER_MODALS: FooterModalContent[] = [
  {
    id: "terms",
    label: "Terms of use",
    title: "Terms of use",
    sections: datedSections(TERMS_EFFECTIVE_DATE, TERMS_SECTIONS),
  },
  {
    id: "privacy",
    label: "Privacy policy",
    title: "Privacy policy",
    sections: datedSections(PRIVACY_EFFECTIVE_DATE, PRIVACY_SECTIONS),
  },
  {
    id: "disclaimer",
    label: "Disclaimer",
    title: "Disclaimer",
    sections: [
      ...DISCLAIMER_SECTIONS,
      ...DISCLAIMER_CLOSING.map((body) => ({ body })),
    ],
  },
];

export function getFooterContent(id: FooterModalId): FooterModalContent {
  const content = FOOTER_MODALS.find((modal) => modal.id === id);
  if (!content) {
    throw new Error(`Unknown footer content id: ${id}`);
  }
  return content;
}
