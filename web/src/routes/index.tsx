import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { SectorTimeseries } from "#/components/SectorTimeseries";
import { SectorBreakdown } from "#/components/SectorBreakdown";
import { FacilityExplorer } from "#/components/FacilityExplorer";
import { TopOwners } from "#/components/TopOwners";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          Germany CO₂ Emissions
        </h1>
        <p className="text-muted-foreground">
          Climate TRACE v5.7.0 · sectors, facilities &amp; ownership · 2015–2026
        </p>
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="facilities">Facilities</TabsTrigger>
          <TabsTrigger value="owners">Owners</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <SectorTimeseries />
          <div className="grid gap-4 lg:grid-cols-2">
            <SectorBreakdown />
          </div>
        </TabsContent>

        <TabsContent value="facilities">
          <FacilityExplorer />
        </TabsContent>

        <TabsContent value="owners">
          <TopOwners />
        </TabsContent>
      </Tabs>
    </div>
  );
}
