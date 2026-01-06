/**
 * Terms & Privacy consent notice component
 * Used across signup and live meeting flows
 */
export function ConsentNotice() {
  return (
    <p className="text-[10px] md:text-xs text-center text-muted-foreground">
      By joining, you agree to our{" "}
      <a
        href="/terms-of-service"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground"
      >
        Terms
      </a>{" "}
      &{" "}
      <a
        href="/privacy-policy"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground"
      >
        Privacy
      </a>
      .
    </p>
  );
}
