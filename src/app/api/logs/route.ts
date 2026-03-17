import { NextResponse } from "next/server";

const AIRTABLE_BASE_ID = "app1m1cs8NyZ0aqRl";
const AIRTABLE_TABLE_ID = "tblu1ZuTowmxEIPA1";

export async function GET() {
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?maxRecords=50`,
      {
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Airtable fetch failed: ${error}`);
    }

    const data = await res.json();

    const records = data.records.map(
      (r: { id: string; fields: Record<string, unknown>; createdTime: string }) => ({
        id: r.id,
        name: r.fields["Name (EN)"] || r.fields["Name (JP)"] || "—",
        rent: r.fields["Rent"] ?? null,
        layout: r.fields["Layout"] || "—",
        size: r.fields["Size (m²)"] ?? null,
        address: r.fields["Address (EN)"] || r.fields["Address (JP)"] || "—",
        status: (r.fields["Status"] as string) || null,
        hasAttachment: Array.isArray(r.fields["PDF"]) && r.fields["PDF"].length > 0,
        created: r.createdTime,
      })
    );

    return NextResponse.json({ records });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
