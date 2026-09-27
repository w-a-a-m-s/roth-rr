import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getSupportEmail } from '@/lib/common/email';

export const metadata: Metadata = {
	title: 'Sign-in issue',
	description: "We couldn't finish signing you in. Request a new link or try again."
};

type AuthErrorCode = 'Verification' | 'AccessDenied' | 'Configuration';

const COPY: Record<AuthErrorCode, { title: string; body: string; cta: string }> = {
	Verification: {
		title: 'That link expired',
		body: "Magic links only work once, and they time out after a bit. Request a new one and you'll be right in.",
		cta: 'Try signing in again'
	},
	AccessDenied: {
		title: "We couldn't let you in",
		body: "That sign-in request was blocked. If this looks like a mistake, email us and we'll sort it out.",
		cta: 'Back to home'
	},
	Configuration: {
		title: "Something's off on our side",
		body: "That's on us, not you. Try again in a minute, or email us if it keeps happening.",
		cta: 'Back to home'
	}
};

const FALLBACK = {
	title: "Couldn't sign you in",
	body: 'Something went sideways while signing you in. Try again, and if it keeps happening, email us.',
	cta: 'Try signing in again'
};

function errorCode(value: string | string[] | undefined): AuthErrorCode | null {
	const raw = Array.isArray(value) ? value[0] : value;
	if (raw === 'Verification' || raw === 'AccessDenied' || raw === 'Configuration') {
		return raw;
	}
	return null;
}

function ErrorMark({ code }: { code: AuthErrorCode | null }) {
	const icon =
		code === 'Verification' ? (
			<path d="M4 7.5h16v10.5H4zM4 7.5l8 6 8-6" />
		) : code === 'AccessDenied' ? (
			<path d="M8 11V8.5a4 4 0 0 1 8 0V11M7 11h10v8H7z" />
		) : (
			<path d="M12 8v5M12 16.5h.01M12 4.5l8 14H4z" />
		);

	return (
		<div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden>
			<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
				{icon}
			</svg>
		</div>
	);
}

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
	const params = await searchParams;
	const code = errorCode(params.error);
	const copy = code ? COPY[code] : FALLBACK;
	const support = getSupportEmail();
	const year = new Date().getFullYear();

	return (
		<div className="flex min-h-dvh flex-col bg-background text-foreground">
			<header className="border-b border-border bg-white">
				<div className="mx-auto flex h-[68px] max-w-[800px] items-center justify-between gap-4 px-5 sm:px-8">
					<Link href="/" className="shrink-0 text-inherit hover:text-inherit">
						<Image src="/logo.png" alt="Roth RR" width={184} height={32} priority className="h-[26px] w-auto" />
					</Link>
					<Link href="/" className="text-[13px] font-semibold text-muted transition-colors hover:text-accent">
						Back to home
					</Link>
				</div>
			</header>

			<main className="flex flex-1 items-center justify-center px-5 py-16 sm:px-8">
				<div className="w-full max-w-[420px] rounded-[20px] border border-border bg-white px-8 py-[38px] text-center shadow-[0_24px_56px_rgba(26,25,21,0.08)]">
					<ErrorMark code={code} />
					<h1 className="mb-2.5 font-serif text-[26px] font-medium tracking-[-0.02em] sm:text-[28px]">{copy.title}</h1>
					<p className="mb-7 text-[14.5px] leading-[1.6] text-muted-2">{copy.body}</p>
					<Link
						href="/"
						className="inline-flex h-12 items-center justify-center rounded-[10px] bg-accent px-[26px] text-[14.5px] font-bold text-white transition-colors hover:bg-accent-hover"
					>
						{copy.cta}
					</Link>
					<p className="mt-6 text-[13px] leading-[1.55] text-muted">
						Need a hand?{' '}
						<a href={`mailto:${support}`} className="font-semibold text-accent hover:text-accent-hover">
							{support}
						</a>
					</p>
				</div>
			</main>

			<footer className="border-t border-border px-5 py-[26px] text-center text-xs text-muted-3 sm:px-8">© {year} Roth RR</footer>
		</div>
	);
}
