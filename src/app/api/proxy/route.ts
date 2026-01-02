import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing URL", { status: 400 });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Fetch failed");

    const headers = new Headers();
    const contentType = response.headers.get("Content-Type");
    if (contentType) {
      headers.set("Content-Type", contentType);
    }

    return new NextResponse(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return new NextResponse("Error fetching video", { status: 500 });
  }
}
