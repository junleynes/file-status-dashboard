
"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { readDb } from "@/lib/db";
import { generateStatisticsReport } from "@/lib/actions";
import type { FileStatus, ChartData } from "@/types";
import { format, parseISO, startOfWeek, startOfMonth } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function StatisticsPage() {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const fetchFiles = async () => {
      const db = await readDb();
      setFiles(db.fileStatuses);
    };
    fetchFiles();
  }, []);

  const processChartData = (period: "daily" | "weekly" | "monthly"): ChartData[] => {
    const publishedFiles = files.filter(file => file.status === 'published');
    const counts: { [key: string]: number } = {};

    publishedFiles.forEach(file => {
      const date = parseISO(file.lastUpdated);
      let key: string;

      if (period === "daily") {
        key = format(date, "yyyy-MM-dd");
      } else if (period === "weekly") {
        key = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
      } else { // monthly
        key = format(startOfMonth(date), "yyyy-MM");
      }

      if (!counts[key]) {
        counts[key] = 0;
      }
      counts[key]++;
    });

    const sortedKeys = Object.keys(counts).sort();

    return sortedKeys.map(key => {
        let label = key;
        if(period === 'daily') label = format(parseISO(key), 'MMM d');
        if(period === 'weekly') label = `Week of ${format(parseISO(key), 'MMM d')}`;
        if(period === 'monthly') label = format(parseISO(`${key}-01`), 'MMM yyyy');

        return {
            date: label,
            count: counts[key],
        }
    });
  };

  const dailyData = useMemo(() => processChartData("daily"), [files]);
  const weeklyData = useMemo(() => processChartData("weekly"), [files]);
  const monthlyData = useMemo(() => processChartData("monthly"), [files]);

  const chartConfig = {
    count: {
      label: "Published",
      color: "hsl(var(--chart-1))",
    },
  };
  
  const handleGenerateReport = async () => {
    toast({ title: "Generating Report...", description: "Please wait while your report is being prepared." });
    const { csv, error } = await generateStatisticsReport();
    if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
        return;
    }
    const blob = new Blob([csv!], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const date = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `statistics-report-${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Report Generated", description: "Your statistics report has been downloaded." });
  };


  return (
    <div className="space-y-6">
       <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Statistics</h2>
                <p className="text-muted-foreground">
                    View and export publishing trends.
                </p>
            </div>
            <Button onClick={handleGenerateReport}>
                <Download className="mr-2 h-4 w-4" />
                Generate Report
            </Button>
        </div>

      <Card>
        <CardHeader>
          <CardTitle>Published Files</CardTitle>
          <CardDescription>
            An overview of files published over time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="daily" className="w-full">
            <TabsList>
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
            <TabsContent value="daily">
              <ChartComponent data={dailyData} config={chartConfig} />
            </TabsContent>
            <TabsContent value="weekly">
                <ChartComponent data={weeklyData} config={chartConfig} />
            </TabsContent>
            <TabsContent value="monthly">
                <ChartComponent data={monthlyData} config={chartConfig} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function ChartComponent({ data, config }: { data: ChartData[], config: any }) {
    if (data.length === 0) {
        return <div className="flex h-[250px] w-full items-center justify-center text-muted-foreground">No data to display for this period.</div>
    }

    return (
        <div className="h-[250px] w-full">
            <ChartContainer config={config} className="h-full w-full">
              <ResponsiveContainer>
                <BarChart data={data} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                  />
                   <YAxis allowDecimals={false} />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                  />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
        </div>
    );
}

