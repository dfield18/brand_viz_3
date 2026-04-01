import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-gradient-to-b from-background to-muted/30">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm px-4">
        {/* Branding */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-[#111827] shadow-md">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 13l9 6 9-6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Visibility</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
              Monitor and improve how AI platforms represent your brand
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
