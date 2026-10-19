"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";

export const RETURNS_ARTICLE_TITLE = "Rate of returns for IRAs versus Roth IRAs";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="m-0 mb-2 text-[14px] font-bold text-foreground">{title}</h3>
      <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-muted-2">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Quote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="m-0 border-l-[3px] border-border-2 pl-3 italic text-muted-2">
      {children}
    </blockquote>
  );
}

function Source({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) return <p className="m-0 text-xs text-muted">{children}</p>;
  return (
    <p className="m-0 text-xs text-muted">
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
        {children}
      </a>
    </p>
  );
}

/**
 * The article: why an account that doesn't have to make withdrawals ends up
 * ahead of one that does at the same risk level, with references to the
 * research and a note on how that relates to the growth rates in this plan.
 */
function ReturnsArticleBody() {
  return (
    <div>
      <p className="m-0 mb-4 text-[13px] font-semibold leading-relaxed text-foreground">
        At the same risk tolerance, would an account that doesn&apos;t have to take withdrawals
        (say 5% a year) beat the performance of an account with that requirement? The account
        without the requirement doesn&apos;t have geometric losses and the sequence of returns
        working against it.
      </p>

      <Section title="Short answer">
        <p className="m-0">
          Yes. An account that doesn&apos;t have to make regular withdrawals (a 5% annual draw,
          for example) will generally end up ahead of one that does, even at the same risk
          tolerance, asset allocation and expected returns. The two main reasons are
          sequence-of-returns risk and the way volatility drag interacts with withdrawals.
        </p>
      </Section>

      <Section title="Sequence-of-returns risk">
        <Bullets
          items={[
            <>
              In pure accumulation (no withdrawals), the order of returns doesn&apos;t matter for
              the ending value. The ending wealth is simply the starting capital × (1 + r₁) × (1 +
              r₂) × … so the sequence is irrelevant.
            </>,
            <>
              Once you start withdrawing, order becomes critical. Poor returns early on shrink
              the portfolio while money is also coming out. You are forced to sell a larger
              share of a smaller base, which permanently reduces the capital available to
              recover. The same average returns delivered later produce a much better outcome.
            </>,
            <>This is why sequence-of-returns risk is almost entirely a withdrawal-phase problem.</>,
          ]}
        />
      </Section>

      <Section title="Geometric losses and volatility drag with withdrawals">
        <Bullets
          items={[
            <>
              Volatility creates a gap between arithmetic and geometric (compound) returns for any
              portfolio, roughly σ²/2. Recovering from a loss always takes a larger percentage gain
              than the loss itself: a 20% drop needs a 25% gain, and a 50% drop needs 100%.
            </>,
            <>
              With withdrawals on top, the effect is amplified: selling shares at depressed
              prices locks in part of the loss, and the remaining capital has to work harder to
              both recover and keep paying. Volatility drag plus forced sales does more damage
              than volatility drag alone.
            </>,
            <>
              A pure accumulation portfolio only has the normal volatility drag. It doesn&apos;t
              have capital removed during the worst periods.
            </>,
          ]}
        />
      </Section>

      <Section title="Practical implication">
        <p className="m-0">
          At the same risk level (same stock and bond mix, same volatility, same expected
          returns), the account without withdrawals compounds more of its gains and avoids the
          lopsided damage of early losses. Over several decades the difference in ending wealth
          is usually large.
        </p>
        <p className="m-0">
          This is also why safe withdrawal rate research (Bengen, the Trinity study and others)
          focuses so heavily on historical sequences, and why many people lower their stock
          exposure or use guardrails once withdrawals begin. The risk profile changes in a
          meaningful way, even if the risk tolerance label stays the same.
        </p>
      </Section>

      <Section title="What the research says">
        <p className="m-0 font-semibold text-foreground">
          The sequence only matters once money comes out
        </p>
        <p className="m-0">
          Michael Kitces, &ldquo;Understanding Sequence Of Return Risk: Safe Withdrawal Rates,
          Bear Market Crashes, And Bad Decades&rdquo; (October 1, 2014):
        </p>
        <Quote>
          &ldquo;the sequence of returns doesn&apos;t matter when there are no cash flows in and
          out of a portfolio&rdquo; … &ldquo;a $1,000,000 portfolio that experiences returns of
          -50% and +100% finishes with the same balance&rdquo; … &ldquo;the difference is often
          dubbed &lsquo;volatility drag&rsquo;&rdquo;
        </Quote>
        <p className="m-0">
          With a withdrawal in between, the bad order wipes the account out: &ldquo;the $500,000
          withdrawal completely depletes the portfolio down to $0.&rdquo; Kitces adds that what
          matters most is &ldquo;the returns that the retiree earns over the first decade&rdquo;:
          &ldquo;the real problem is not a bad year or two at the beginning of retirement, but a
          bad decade to start off retirement.&rdquo;
        </p>
        <Source href="https://www.kitces.com/blog/understanding-sequence-of-return-risk-safe-withdrawal-rates-bear-market-crashes-and-bad-decades/">
          Kitces.com: Understanding Sequence Of Return Risk (2014)
        </Source>

        <p className="m-0 mt-2 font-semibold text-foreground">Historical safe withdrawal research</p>
        <p className="m-0">
          William Bengen, &ldquo;Determining Withdrawal Rates Using Historical Data,&rdquo;
          Journal of Financial Planning (1994), was the first major study to show that the order
          of returns dominates outcomes once withdrawals start. Using U.S. history, a 4% first-year
          withdrawal, raised for inflation each year, from a balanced portfolio lasted at least
          about 30 years in every period studied, while higher rates failed in the worst
          sequences (retirements starting in the late 1960s and early 1970s).
        </p>
        <Source>Bengen, W. P. (1994). Journal of Financial Planning, 7(4).</Source>
        <p className="m-0">
          The Trinity study (Cooley, Hubbard and Walz, &ldquo;Retirement Savings: Choosing a
          Withdrawal Rate That Is Sustainable,&rdquo; AAII Journal, February 1998) tested rolling
          historical periods and found the same pattern: failures clustered in periods with poor
          returns early in retirement, and long-term averages mattered less than the sequence.
        </p>
        <Source href="https://www.aaii.com/journal/article/retirement-savings-choosing-a-withdrawal-rate-that-is-sustainable">
          AAII Journal: Retirement Savings: Choosing a Withdrawal Rate That Is Sustainable (1998)
        </Source>

        <p className="m-0 mt-2 font-semibold text-foreground">Rising equity glide paths</p>
        <p className="m-0">
          Wade Pfau and Michael Kitces, &ldquo;Reducing Retirement Risk with a Rising Equity Glide
          Path,&rdquo; Journal of Financial Planning (January 2014), found that a portfolio that
          starts conservative and becomes more aggressive through retirement can reduce both the
          probability and the size of failure. A portfolio that starts at 30% stocks and finishes
          at 60% did better than one held at 60% the whole time. The reason is the same: the
          early withdrawal years are when a portfolio is most exposed to bad sequences, so less
          volatility then helps the most.
        </p>
        <Source href="https://www.financialplanningassociation.org/article/journal/JAN14-reducing-retirement-risk-rising-equity-glide-path">
          Journal of Financial Planning: Reducing Retirement Risk with a Rising Equity Glide Path (2014)
        </Source>
      </Section>

      <Section title="Bottom line">
        <Bullets
          items={[
            <>
              Without withdrawals the order of returns doesn&apos;t change the ending value; only
              the compound return matters, and volatility pulls it below the simple average by
              about σ²/2.
            </>,
            <>
              Once regular withdrawals begin, the sequence becomes decisive, and the same
              volatility does more damage because losses are locked in by selling.
            </>,
            <>
              Historical studies (Bengen 1994, Trinity 1998, and later work by Pfau, Kitces and
              others) consistently find that the early-retirement sequence of returns matters more
              than long-term averages, and that lowering early volatility improves the odds of
              success at any withdrawal rate.
            </>,
          ]}
        />
      </Section>

      <div className="mt-5 rounded-lg border border-border bg-surface-muted px-3 py-2.5">
        <p className="m-0 mb-1 text-[12.5px] font-bold text-foreground">Keep in mind</p>
        <p className="m-0 text-[12.5px] leading-relaxed text-muted-2">
          Holding the same investments, both accounts earn the same rate of return; what differs
          is how much money stays invested, especially when withdrawals come out early in a
          downturn. An RMD you don&apos;t spend can be reinvested in a brokerage account, so it
          keeps working, less the tax. This plan already takes every RMD out of the IRA each year
          and uses a steady return, so a higher growth rate on the Roth would count the effect
          twice; showing the sequence effect itself takes market simulation (Monte Carlo).
        </p>
      </div>
    </div>
  );
}

/** "Rate of returns for IRAs versus Roth IRAs" link that opens the article. */
export function ReturnsArticleLink({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`self-start border-0 bg-transparent p-0 text-left text-[11.5px] font-semibold text-accent underline ${className}`}
      >
        {RETURNS_ARTICLE_TITLE}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={RETURNS_ARTICLE_TITLE} size="md">
        <ReturnsArticleBody />
      </Modal>
    </>
  );
}
