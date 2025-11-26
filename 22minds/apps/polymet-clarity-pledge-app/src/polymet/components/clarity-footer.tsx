export function ClarityFooter() {
  return (
    <footer className="border-t border-border bg-muted/30 py-12 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* The Theory */}
          <div>
            <h3 className="text-lg font-bold mb-3">The Theory</h3>
            <a
              href="#"
              className="text-base text-muted-foreground hover:text-foreground transition-colors"
            >
              Read "The Clarity Tax" (v.3)
            </a>
          </div>

          {/* The Movement */}
          <div>
            <h3 className="text-lg font-bold mb-3">The Movement</h3>
            <a
              href="#"
              className="text-base text-muted-foreground hover:text-foreground transition-colors"
            >
              About 22Minds
            </a>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-lg font-bold mb-3">Contact</h3>
            <a
              href="#"
              className="text-base text-muted-foreground hover:text-foreground transition-colors"
            >
              Get in Touch
            </a>
          </div>
        </div>

        {/* Copyright */}
        <div className="text-center pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground">
            © 2025 The Clarity Project.
          </p>
        </div>
      </div>
    </footer>
  );
}
