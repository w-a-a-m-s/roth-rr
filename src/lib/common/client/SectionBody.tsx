import type { FooterSection } from "./footerData";

export function SectionBody({
  section,
  linkClassName = "font-semibold text-[color:var(--accent,#2563eb)] underline-offset-2 hover:underline",
}: {
  section: FooterSection;
  linkClassName?: string;
}) {
  if (!section.link) return <>{section.body}</>;

  const { label, href } = section.link;
  const index = section.body.indexOf(label);
  if (index === -1) {
    return (
      <>
        {section.body}{" "}
        <a href={href} className={linkClassName}>
          {label}
        </a>
      </>
    );
  }

  const before = section.body.slice(0, index);
  const after = section.body.slice(index + label.length);
  return (
    <>
      {before}
      <a href={href} className={linkClassName}>
        {label}
      </a>
      {after}
    </>
  );
}

export function sectionKey(section: FooterSection): string {
  return section.title ?? section.body.slice(0, 48);
}
