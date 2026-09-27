import { SectionBody, sectionKey } from "./SectionBody";
import { getFooterContent, type FooterModalId } from "./footerData";

export function FooterContent({
  id,
  className,
}: {
  id: FooterModalId;
  className?: string;
}) {
  const content = getFooterContent(id);

  return (
    <div className={className}>
      {content.sections.map((section) => (
        <div key={sectionKey(section)}>
          {section.title ? (
            <h2 className="mb-1 font-semibold text-[color:var(--muted,#76716a)]">
              {section.title}
            </h2>
          ) : null}
          <p>
            <SectionBody section={section} />
          </p>
        </div>
      ))}
    </div>
  );
}
