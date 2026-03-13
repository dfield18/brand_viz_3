import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-gradient-to-b from-background to-muted/30">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm px-4">
        {/* Branding */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-blue-700 shadow-md">
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 2L3 5v6l5 3 5-3V5L8 2z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
              <circle cx="8" cy="8" r="2" fill="white" />
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
