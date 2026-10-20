import { QuickStats } from '@/app/dashboard/quick-stats';
import { QuickLinks, WelcomeCard } from '@/app/dashboard/welcome-card';

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <WelcomeCard />

      <section aria-labelledby="stats-heading" className="flex flex-col gap-3">
        <h2 id="stats-heading" className="font-heading paragraph-lg font-bold text-foreground">
          Overview
        </h2>
        <QuickStats />
      </section>

      <section aria-labelledby="quick-links-heading" className="flex flex-col gap-3">
        <h2
          id="quick-links-heading"
          className="font-heading paragraph-lg font-bold text-foreground"
        >
          Jump to
        </h2>
        <QuickLinks />
      </section>
    </div>
  );
}
