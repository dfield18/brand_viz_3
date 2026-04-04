import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm px-4">
        <SignUp />
        <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed max-w-xs">
          By signing up, you agree to receive product updates, tips, and occasional emails from aiSaysWhat. You can unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}
