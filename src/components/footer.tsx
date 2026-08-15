import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t mt-auto py-6">
      <div className="w-full max-w-3xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>
          © {new Date().getFullYear()} ScanA11y — WCAG 2.2 accessibility auditing
        </p>
        <nav className="flex items-center gap-5" aria-label="Legal">
          <Link href="/about" className="hover:text-foreground transition-colors">
            About
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
        </nav>
      </div>
    </footer>
  );
}
