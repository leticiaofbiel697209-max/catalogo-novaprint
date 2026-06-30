@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* NovaPrint design system */
    --background: 210 20% 98%;
    --foreground: 220 25% 12%;

    --card: 0 0% 100%;
    --card-foreground: 220 25% 12%;

    --popover: 0 0% 100%;
    --popover-foreground: 220 25% 12%;

    /* Primary: deep corporate blue */
    --primary: 218 85% 32%;
    --primary-foreground: 0 0% 100%;
    --primary-hover: 218 85% 26%;

    /* Secondary: warm orange accent for CTAs */
    --accent-brand: 24 95% 53%;
    --accent-brand-foreground: 0 0% 100%;

    --secondary: 218 30% 95%;
    --secondary-foreground: 218 85% 22%;

    --muted: 218 20% 95%;
    --muted-foreground: 220 12% 45%;

    --accent: 218 30% 94%;
    --accent-foreground: 218 85% 28%;

    --success: 142 65% 38%;
    --success-foreground: 0 0% 100%;
    --warning: 38 92% 50%;
    --warning-foreground: 220 25% 12%;
    --destructive: 0 75% 50%;
    --destructive-foreground: 0 0% 100%;

    --border: 220 15% 88%;
    --input: 220 15% 88%;
    --ring: 218 85% 32%;

    --radius: 0.75rem;

    --shadow-sm: 0 1px 2px hsl(220 25% 12% / 0.04);
    --shadow-md: 0 4px 14px hsl(220 25% 12% / 0.08);
    --shadow-lg: 0 16px 40px hsl(218 85% 32% / 0.15);

    --gradient-hero: linear-gradient(135deg, hsl(218 85% 32%) 0%, hsl(218 85% 22%) 50%, hsl(218 90% 18%) 100%);
    --gradient-card: linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(218 30% 98%) 100%);

    --sidebar-background: 0 0% 100%;
    --sidebar-foreground: 220 25% 12%;
    --sidebar-primary: 218 85% 32%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 218 30% 95%;
    --sidebar-accent-foreground: 218 85% 22%;
    --sidebar-border: 220 15% 88%;
    --sidebar-ring: 218 85% 32%;
  }
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }

  h1, h2, h3, h4 {
    @apply font-semibold tracking-tight text-foreground;
  }
}

@layer components {
  .container-page {
    @apply mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8;
  }
}
