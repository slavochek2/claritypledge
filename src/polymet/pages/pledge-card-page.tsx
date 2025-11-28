/**
 * @file pledge-card-page.tsx
 * @description This page is designed to display a single, shareable "pledge card".
 * The pledge card is a visual representation of a user's commitment to the Polymet Clarity Pledge,
 * suitable for sharing on social media or other platforms.
 * This page likely takes a user's ID or slug as a parameter to generate a personalized card.
 * It's a simple, focused page with the sole purpose of making the pledge easily shareable,
 * helping to spread the word and encourage others to participate.
 */
import { PledgeCard } from "@/polymet/components/pledge-card";

export function PledgeCardPage() {
  return (
    <div className="min-h-screen">
      <PledgeCard name="Vyacheslav Ladischenski" />
    </div>
  );
}
