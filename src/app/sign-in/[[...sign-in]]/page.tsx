import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-gradient-to-b from-background to-muted/30">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm px-4">
        {/* Branding */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-[#111827] shadow-md">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="7" y1="11" x2="25" y2="11" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="7" y1="16" x2="21" y2="16" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
              <line x1="7" y1="21" x2="17" y2="21" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">aiSaysWhat</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
              Monitor how AI platforms describe your organization
            </p>
          </div>
        </div>

        {/* Clerk sign-in widget */}
        <SignIn />

        {/* Trust indicators */}
        <div className="flex items-center gap-6 text-[11px] text-muted-foreground/60">
          <span>ChatGPT</span>
          <span className="w-px h-3 bg-border" />
          <span>Gemini</span>
          <span className="w-px h-3 bg-border" />
          <span>Claude</span>
          <span className="w-px h-3 bg-border" />
          <span>Perplexity</span>
          <span className="w-px h-3 bg-border" />
          <span>Google AIO</span>
        </div>
      </div>
    </div>
  );
}
