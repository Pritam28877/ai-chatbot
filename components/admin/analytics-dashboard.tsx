"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type ModelStat = {
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  audioSeconds?: number;
  requestCount: number;
  cost: number;
  provider: string;
  usageType: string;
};

type DailyUsage = {
  date: string;
  totalTokens: number;
  audioSeconds: number;
  cost: number;
};

type AnalyticsData = {
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
  totals: {
    totalRequests: number;
    totalTokens: number;
    totalAudioSeconds: number;
    totalCost: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
  };
  modelStats: ModelStat[];
  dailyUsage: DailyUsage[];
};

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const fetchData = async (daysParam: number) => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/admin/analytics?days=${daysParam}`
      );

      if (!response.ok) {
        if (response.status === 403) {
          toast.error("Access denied. Admin access required (@fddigital.com email)");
          return;
        }
        throw new Error("Failed to fetch analytics");
      }

      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast.error("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(days);
  }, [days]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="size-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
          <p className="mt-2 text-sm text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Cost Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Token usage and cost monitoring for fddigital.com
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setDays(7)}
            variant={days === 7 ? "default" : "outline"}
            size="sm"
          >
            7 Days
          </Button>
          <Button
            onClick={() => setDays(30)}
            variant={days === 30 ? "default" : "outline"}
            size="sm"
          >
            30 Days
          </Button>
          <Button
            onClick={() => setDays(90)}
            variant={days === 90 ? "default" : "outline"}
            size="sm"
          >
            90 Days
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${data.totals.totalCost.toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground">
              Last {days} days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.totals.totalTokens.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.totals.totalPromptTokens.toLocaleString()} input + {data.totals.totalCompletionTokens.toLocaleString()} output
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transcriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(data.totals.totalAudioSeconds / 60)}m
            </div>
            <p className="text-xs text-muted-foreground">
              {data.totals.totalAudioSeconds.toFixed(0)}s of audio
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.totals.totalRequests.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              API calls
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Cost/Request</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(data.totals.totalCost / data.totals.totalRequests || 0).toFixed(5)}
            </div>
            <p className="text-xs text-muted-foreground">
              Per API call
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Model Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle>Usage by Model</CardTitle>
          <CardDescription>
            Token usage and costs broken down by AI model
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-2 font-medium">Model</th>
                  <th className="pb-2 font-medium text-right">Type</th>
                  <th className="pb-2 font-medium text-right">Requests</th>
                  <th className="pb-2 font-medium text-right">Input Tokens</th>
                  <th className="pb-2 font-medium text-right">Output Tokens</th>
                  <th className="pb-2 font-medium text-right">Audio (s)</th>
                  <th className="pb-2 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.modelStats
                  .sort((a, b) => b.cost - a.cost)
                  .map((model) => (
                    <tr key={model.modelId} className="border-b last:border-0">
                      <td className="py-3">
                        <div>
                          <div className="font-medium">{model.modelId}</div>
                          <div className="text-xs text-muted-foreground capitalize">
                            {model.provider}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <span className={`text-xs px-2 py-1 rounded ${
                          model.usageType === "transcription" 
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" 
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        }`}>
                          {model.usageType === "transcription" ? "Voice" : "Chat"}
                        </span>
                      </td>
                      <td className="py-3 text-right">{model.requestCount}</td>
                      <td className="py-3 text-right">
                        {model.usageType === "transcription" ? "—" : model.promptTokens.toLocaleString()}
                      </td>
                      <td className="py-3 text-right">
                        {model.usageType === "transcription" ? "—" : model.completionTokens.toLocaleString()}
                      </td>
                      <td className="py-3 text-right">
                        {model.usageType === "transcription" && model.audioSeconds 
                          ? `${model.audioSeconds.toFixed(1)}s` 
                          : "—"}
                      </td>
                      <td className="py-3 text-right font-medium">
                        ${model.cost.toFixed(4)}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot className="border-t font-bold">
                <tr>
                  <td className="pt-3">Total</td>
                  <td className="pt-3 text-right">—</td>
                  <td className="pt-3 text-right">{data.totals.totalRequests}</td>
                  <td className="pt-3 text-right">
                    {data.totals.totalPromptTokens.toLocaleString()}
                  </td>
                  <td className="pt-3 text-right">
                    {data.totals.totalCompletionTokens.toLocaleString()}
                  </td>
                  <td className="pt-3 text-right">
                    {data.totals.totalAudioSeconds.toFixed(1)}s
                  </td>
                  <td className="pt-3 text-right">
                    ${data.totals.totalCost.toFixed(4)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Daily Usage Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Usage Timeline</CardTitle>
          <CardDescription>
            Token usage and costs over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium text-right">Total Tokens</th>
                  <th className="pb-2 font-medium text-right">Audio (s)</th>
                  <th className="pb-2 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyUsage.map((day) => (
                  <tr key={day.date} className="border-b last:border-0">
                    <td className="py-3">{new Date(day.date).toLocaleDateString()}</td>
                    <td className="py-3 text-right">
                      {day.totalTokens.toLocaleString()}
                    </td>
                    <td className="py-3 text-right">
                      {day.audioSeconds > 0 ? `${day.audioSeconds.toFixed(1)}s` : "—"}
                    </td>
                    <td className="py-3 text-right">${day.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

