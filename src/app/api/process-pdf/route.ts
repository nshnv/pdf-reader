import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AIRTABLE_BASE_ID = "app1m1cs8NyZ0aqRl";
const AIRTABLE_TABLE_ID = "tblu1ZuTowmxEIPA1";

async function updateAirtableRecord(
  recordId: string,
  fields: Record<string, unknown>
) {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Airtable update failed: ${error}`);
  }
  return res.json();
}

async function getAirtableRecord(recordId: string) {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      },
    }
  );
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Airtable fetch failed: ${error}`);
  }
  return res.json();
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const recordId = body.recordId;

    if (!recordId) {
      return NextResponse.json(
        { error: "recordId is required" },
        { status: 400 }
      );
    }

    // Fetch the record from Airtable
    const record = await getAirtableRecord(recordId);
    const roomNumber = record.fields?.["Room number"] || null;
    const attachments = record.fields?.PDF;

    if (!attachments || attachments.length === 0) {
      await updateAirtableRecord(recordId, { Status: "Error" });
      return NextResponse.json(
        { error: "No attachments found on record" },
        { status: 400 }
      );
    }

    const SUPPORTED_TYPES = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    // Find the first supported attachment
    const attachment = attachments.find((a: { type: string }) =>
      SUPPORTED_TYPES.includes(a.type)
    );
    if (!attachment) {
      await updateAirtableRecord(recordId, { Status: "Error" });
      return NextResponse.json(
        { error: "No supported attachment found (PDF or image required)" },
        { status: 400 }
      );
    }

    // Mark as processing
    await updateAirtableRecord(recordId, { Status: "Processing" });

    // Download the file
    const fileResponse = await fetch(attachment.url);
    const fileBuffer = await fileResponse.arrayBuffer();
    const fileBase64 = Buffer.from(fileBuffer).toString("base64");
    const isPdf = attachment.type === "application/pdf";

    // Send to Claude for extraction
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? {
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: fileBase64,
                  },
                }
              : {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: attachment.type as
                      | "image/jpeg"
                      | "image/png"
                      | "image/gif"
                      | "image/webp",
                    data: fileBase64,
                  },
                },
            {
              type: "text",
              text: `Please transcribe the contents of this PDF document into English and extract the following specific information.${roomNumber ? ` This PDF may contain multiple room listings — extract data ONLY for room number ${roomNumber}.` : ""} Return your response as a JSON object with exactly these keys:

{
  "property_name_jp": "Property name in Japanese",
  "property_name_en": "Property name in English",
  "rent": 150000,
  "room_number": "Room number if available",
  "layout": "e.g., 1LDK, 2LDK",
  "size": 45,
  "address_jp": "Full address in Japanese",
  "address_en": "Full address in English",
  "built_year": "Year built, e.g., 2015",
  "key_money": 1,
  "deposit": 1,
  "property_management_jp": "Property management company in Japanese",
  "property_management_en": "Property management company in English",
  "closest_station_jp": "ALL train/subway access routes in Japanese, each on a new line, e.g.:\nJR山手線 高田馬場駅 徒歩7分\n東京メトロ東西線 高田馬場駅 徒歩7分\n西武新宿線 高田馬場駅 徒歩9分",
  "closest_station_en": "ALL train/subway access routes in English, each on a new line, e.g.:\nJR Yamanote Line - Takadanobaba Station (7 min walk)\nTokyo Metro Tozai Line - Takadanobaba Station (7 min walk)\nSeibu Shinjuku Line - Takadanobaba Station (9 min walk)"
}

Notes:
- rent should be a number in JPY (monthly)
- size should be a number in square meters
- key_money and deposit should be numbers representing months (e.g., 1 = one month)
- For closest_station fields, include ALL access routes listed in the PDF, not just the closest one. Each route should be on its own line with line name, station name, and walk time.
- If a field is not found in the document, use null
- Return ONLY the JSON object, no other text`,
            },
          ],
        },
      ],
    });

    // Parse Claude's response
    const textBlock = message.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    if (!textBlock) {
      throw new Error("No text response from Claude");
    }

    // Extract JSON from the response (handle potential markdown wrapping)
    let jsonStr = textBlock.text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const extracted = JSON.parse(jsonStr);

    // Map extracted data to Airtable fields
    const airtableFields: Record<string, unknown> = {};
    if (extracted.property_name_jp)
      airtableFields["Name (JP)"] = extracted.property_name_jp;
    if (extracted.property_name_en)
      airtableFields["Name (EN)"] = extracted.property_name_en;
    if (extracted.rent != null) airtableFields["Rent"] = extracted.rent;
    if (extracted.room_number)
      airtableFields["Room number"] = extracted.room_number;
    if (extracted.layout) airtableFields["Layout"] = extracted.layout;
    if (extracted.size != null) airtableFields["Size (m²)"] = extracted.size;
    if (extracted.address_jp)
      airtableFields["Address (JP)"] = extracted.address_jp;
    if (extracted.address_en)
      airtableFields["Address (EN)"] = extracted.address_en;
    if (extracted.built_year)
      airtableFields["Built year"] = extracted.built_year;
    if (extracted.key_money != null)
      airtableFields["Key money"] = extracted.key_money;
    if (extracted.deposit != null)
      airtableFields["Deposit"] = extracted.deposit;
    if (extracted.property_management_jp)
      airtableFields["Property Management (JP)"] =
        extracted.property_management_jp;
    if (extracted.property_management_en)
      airtableFields["Property Management (EN)"] =
        extracted.property_management_en;
    if (extracted.closest_station_jp)
      airtableFields["Closest station (JP)"] = extracted.closest_station_jp;
    if (extracted.closest_station_en)
      airtableFields["Closest station (EN)"] = extracted.closest_station_en;

    // Update the Airtable record with extracted data + Done status
    airtableFields["Status"] = "Done";
    await updateAirtableRecord(recordId, airtableFields);

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      recordId,
      fieldsUpdated: Object.keys(airtableFields).length,
      duration,
      extracted,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error("PDF processing error:", error);

    return NextResponse.json(
      { error: errorMessage, duration },
      { status: 500 }
    );
  }
}
