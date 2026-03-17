"use client";

import { useEffect, useState, useCallback } from "react";

type PropertyRecord = {
  id: string;
  name: string;
  rent: number | null;
  layout: string;
  size: number | null;
  address: string;
  status: string | null;
  hasAttachment: boolean;
  created: string | null;
};

const statusColors: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-800",
  Processing: "bg-blue-100 text-blue-800",
  Done: "bg-green-100 text-green-800",
  Error: "bg-red-100 text-red-800",
};

export default function Dashboard() {
  const [records, setRecords] = useState<PropertyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch("/api/logs");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRecords(data.records);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch records");
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    fetchRecords();
    const interval = setInterval(fetchRecords, 30000);
    return () => clearInterval(interval);
  }, [fetchRecords]);

  const processRecord = async (recordId: string) => {
    setProcessing(recordId);
    try {
      const res = await fetch("/api/process-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchRecords();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to process record"
      );
    } finally {
      setProcessing(null);
    }
  };

  const stats = {
    total: records.length,
    done: records.filter((r) => r.status === "Done").length,
    pending: records.filter((r) => r.hasAttachment && r.status !== "Done").length,
    errors: records.filter((r) => r.status === "Error").length,
  };

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">PDF Reader Dashboard</h1>
        <p className="text-gray-500 text-sm">
          Last refreshed: {lastRefresh.toLocaleTimeString()} (auto-refreshes
          every 30s)
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-4 underline hover:no-underline"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-gray-500">Total Records</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-green-600">{stats.done}</div>
          <div className="text-sm text-gray-500">Processed</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-amber-600">
            {stats.pending}
          </div>
          <div className="text-sm text-gray-500">Pending</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-red-600">{stats.errors}</div>
          <div className="text-sm text-gray-500">Errors</div>
        </div>
      </div>

      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Records</h2>
          <button
            onClick={fetchRecords}
            className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No records found. Add records with PDF attachments in Airtable.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Rent</th>
                  <th className="text-left p-3 font-medium">Layout</th>
                  <th className="text-left p-3 font-medium">Size</th>
                  <th className="text-left p-3 font-medium">Address</th>
                  <th className="text-left p-3 font-medium">Created</th>
                  <th className="text-left p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">
                      {record.status ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColors[record.status] || "bg-gray-100 text-gray-800"}`}
                        >
                          {record.status}
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                          {record.hasAttachment ? "New" : "No PDF"}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-medium">{record.name}</td>
                    <td className="p-3">
                      {record.rent != null
                        ? `¥${record.rent.toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="p-3">{record.layout}</td>
                    <td className="p-3">
                      {record.size != null ? `${record.size}m²` : "—"}
                    </td>
                    <td className="p-3 max-w-xs truncate">{record.address}</td>
                    <td className="p-3 text-gray-500">
                      {record.created
                        ? new Date(record.created).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="p-3">
                      {record.hasAttachment && record.status !== "Done" && (
                        <button
                          onClick={() => processRecord(record.id)}
                          disabled={processing === record.id}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {processing === record.id
                            ? "Processing..."
                            : "Process"}
                        </button>
                      )}
                      {record.status === "Done" && (
                        <button
                          onClick={() => processRecord(record.id)}
                          disabled={processing === record.id}
                          className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 disabled:opacity-50 transition-colors"
                        >
                          {processing === record.id
                            ? "Processing..."
                            : "Re-process"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
