import type { LovelaceCardConfig } from "custom-card-helpers";

export interface VoiceWeatherResult {
  kind: "weather";
  forecastType?: string;
  currentTemperature?: number | string;
  currentHumidity?: number | string;
  conditionIcon?: string;
  forecast: Array<Record<string, unknown>>;
}

export interface VoiceEntityCardResult {
  kind: "entity_card";
  card: LovelaceCardConfig;
  cardSize?: number;
}

export type VoiceRichResult = VoiceWeatherResult | VoiceEntityCardResult;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function scalar(value: unknown): number | string | undefined {
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}

/** Normalize supported LLM tool payloads into the JSON-safe UI contract. */
export function parseVoiceToolResult(toolName: string, value: unknown): VoiceRichResult | undefined {
  const result = asRecord(value);
  if (!result) return undefined;
  const name = toolName.toLowerCase();

  if (name.includes("weather")) {
    const forecast = Array.isArray(result.forecast)
      ? result.forecast.filter((item): item is Record<string, unknown> => !!asRecord(item))
      : [];
    if (!forecast.length && result.current_temperature === undefined && result.current_humidity === undefined) {
      return undefined;
    }
    return {
      kind: "weather",
      forecastType: typeof result.forecast_type === "string" ? result.forecast_type : undefined,
      currentTemperature: scalar(result.current_temperature),
      currentHumidity: scalar(result.current_humidity),
      conditionIcon: typeof result.condition_icon === "string" ? result.condition_icon : undefined,
      forecast,
    };
  }

  if (name.includes("entity_card")) {
    const card = asRecord(result.card);
    if (!card || typeof card.type !== "string") return undefined;
    return {
      kind: "entity_card",
      card: card as LovelaceCardConfig,
      cardSize: typeof result.card_size === "number" ? result.card_size : undefined,
    };
  }
  return undefined;
}