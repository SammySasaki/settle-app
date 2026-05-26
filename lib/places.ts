export interface PlaceDetails {
  name: string;
  address?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: string;
  website?: string;
  openNow?: boolean;
  todayHours?: string;
  editorialSummary?: string;
}

const PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

const FIELD_MASK = [
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.websiteUri",
  "places.currentOpeningHours",
  "places.editorialSummary",
].join(",");

export async function searchPlace(query: string): Promise<PlaceDetails | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });

    if (!res.ok) return null;
    const data = await res.json() as { places?: Record<string, unknown>[] };
    const place = data.places?.[0];
    if (!place) return null;

    // Parse today's hours from weekdayDescriptions
    // Places API: weekdayDescriptions[0] = Monday ... [6] = Sunday
    // JS Date.getDay(): 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    let todayHours: string | undefined;
    let openNow: boolean | undefined;
    const hours = place.currentOpeningHours as { openNow?: boolean; weekdayDescriptions?: string[] } | undefined;
    if (hours) {
      openNow = hours.openNow;
      const jsDay = new Date().getDay();
      const placesDayIndex = (jsDay + 6) % 7;
      const weekdayDesc = hours.weekdayDescriptions?.[placesDayIndex];
      if (weekdayDesc) {
        todayHours = weekdayDesc.replace(/^[^:]+:\s*/, ""); // strip "Monday: "
      }
    }

    const displayName = place.displayName as { text?: string } | undefined;
    const editorialSummary = place.editorialSummary as { text?: string } | undefined;

    return {
      name: displayName?.text ?? query,
      address: place.formattedAddress as string | undefined,
      rating: place.rating as number | undefined,
      ratingCount: place.userRatingCount as number | undefined,
      priceLevel: place.priceLevel ? PRICE_MAP[place.priceLevel as string] : undefined,
      website: place.websiteUri as string | undefined,
      openNow,
      todayHours,
      editorialSummary: editorialSummary?.text,
    };
  } catch {
    return null;
  }
}
