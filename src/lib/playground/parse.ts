/**
 * parse.ts — Apply an ExtensionJson's CSS selectors to live HTML using cheerio.
 *
 * This makes the playground REAL: it fetches the live site and parses it the
 * same way the original Aniyomi extension would (via JSoup-equivalent selectors).
 *
 * All parse errors are surfaced explicitly — never silently hidden.
 */
import * as cheerio from "cheerio";
import type {
  BrowseEndpoint,
  DetailsConfig,
  EpisodesConfig,
  EpisodesParse,
  ListParse,
  ExtensionJson,
} from "@/lib/converter/types";
import { fetchPage, resolveUrl, type FetchResult } from "./fetch";

export interface BrowseItem {
  title: string;
  url: string;
  thumbnail: string;
  extras: Record<string, string>;
}

export interface BrowseResult {
  items: BrowseItem[];
  page: number;
  hasNextPage: boolean;
  nextPageUrl?: string;
  fetch: FetchResult;
  warnings: string[];
}

export async function fetchAndParseBrowse(
  ext: ExtensionJson,
  endpoint: BrowseEndpoint | undefined,
  page: number,
  query?: string,
  filters?: Record<string, string>,
): Promise<BrowseResult> {
  if (!endpoint) {
    return fail("This browse endpoint is not configured in the extension JSON.");
  }
  if (!endpoint.url) {
    return fail("Browse endpoint has no URL template.");
  }

  const vars: Record<string, string | number> = { page };
  if (query !== undefined) vars.query = query;
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      vars[`filter:${k}`] = v;
    }
  }
  const url = resolveUrl(endpoint.url, ext.source.baseUrl, vars);

  const fetch = await fetchPage(url, ext.source, endpoint.headers);
  if (!fetch.ok || !fetch.html) {
    return { items: [], page, hasNextPage: false, fetch, warnings: [fetch.error ?? "Fetch failed"] };
  }

  const warnings: string[] = [];
  const $ = cheerio.load(fetch.html);
  const parse = endpoint.parse;

  if (!parse.itemSelector) {
    warnings.push("No itemSelector configured — cannot extract items.");
    return { items: [], page, hasNextPage: false, fetch, warnings };
  }

  const items: BrowseItem[] = [];
  $(parse.itemSelector).each((_, el) => {
    const $el = $(el);
    // Title = text content (no attr).
    const title = readField($, $el, parse.title, undefined);
    // URL = href attribute.
    const urlVal = readField($, $el, parse.url, parse.urlAttr ?? "href");
    // Thumbnail = src (or data-src) attribute.
    const thumb = readField($, $el, parse.thumbnail, parse.thumbnailAttr);
    items.push({
      title: title.trim(),
      url: resolveLink(urlVal, ext.source.baseUrl),
      thumbnail: resolveLink(thumb, ext.source.baseUrl),
      extras: {},
    });
  });

  // Next page detection via popularAnimeNextPageSelector (stored on endpoint.paginated + selector)
  let hasNextPage = false;
  let nextPageUrl: string | undefined;
  if (endpoint.paginated) {
    // Look for a[rel=next] or .next a as a common fallback
    const nextEl = $('a[rel="next"]').first();
    if (nextEl.length) {
      hasNextPage = true;
      nextPageUrl = resolveLink(nextEl.attr("href") ?? "", ext.source.baseUrl);
    }
  }

  if (items.length === 0) {
    warnings.push(
      `itemSelector "${parse.itemSelector}" matched 0 elements on the page. The site layout may have changed, or the selector needs adjustment.`,
    );
  }

  return { items, page, hasNextPage, nextPageUrl, fetch, warnings };
}

export interface DetailsResult {
  details: {
    title: string;
    description: string;
    thumbnail: string;
    author: string;
    artist: string;
    genre: string;
    status: string;
    extras: Record<string, string>;
  };
  fetch: FetchResult;
  warnings: string[];
}

export async function fetchAndParseDetails(
  ext: ExtensionJson,
  animeUrl: string,
): Promise<DetailsResult> {
  const cfg: DetailsConfig = ext.details;
  const fetch = await fetchPage(animeUrl, ext.source);
  if (!fetch.ok || !fetch.html) {
    return { details: emptyDetails(), fetch, warnings: [fetch.error ?? "Fetch failed"] };
  }
  const $ = cheerio.load(fetch.html);
  const warnings: string[] = [];

  const get = (sel: string, attr?: string) => {
    if (!sel) return "";
    const $el = $(sel).first();
    if (attr && attr !== "text") return $el.attr(attr)?.trim() ?? "";
    return $el.text().trim();
  };

  const details = {
    title: get(cfg.title),
    description: get(cfg.description),
    thumbnail: resolveLink(get(cfg.thumbnail, "src") || get(cfg.thumbnail), ext.source.baseUrl),
    author: get(cfg.author),
    artist: get(cfg.artist),
    genre: get(cfg.genre),
    status: mapStatus(get(cfg.status), cfg.statusMapping),
    extras: {} as Record<string, string>,
  };

  if (!details.title) {
    warnings.push("title selector matched nothing — details may be incomplete.");
  }

  return { details, fetch, warnings };
}

export interface EpisodeItem {
  number: number;
  name: string;
  url: string;
  scanlator: string;
  date: string;
}

export interface EpisodesResult {
  episodes: EpisodeItem[];
  fetch: FetchResult;
  warnings: string[];
}

export async function fetchAndParseEpisodes(
  ext: ExtensionJson,
  animeUrl: string,
): Promise<EpisodesResult> {
  const cfg: EpisodesConfig = ext.episodes;
  const url = resolveUrl(cfg.url || "{animeUrl}", ext.source.baseUrl, {
    animeUrl,
  });
  const finalUrl = cfg.url ? url : animeUrl;
  const fetch = await fetchPage(finalUrl, ext.source, cfg.headers);
  if (!fetch.ok || !fetch.html) {
    return { episodes: [], fetch, warnings: [fetch.error ?? "Fetch failed"] };
  }

  const $ = cheerio.load(fetch.html);
  const parse: EpisodesParse = cfg.parse;
  const warnings: string[] = [];
  const episodes: EpisodeItem[] = [];

  if (!parse.itemSelector) {
    warnings.push("No episode itemSelector configured.");
    return { episodes, fetch, warnings };
  }

  $(parse.itemSelector).each((i, el) => {
    const $el = $(el);
    const name = readField($, $el, parse.name, undefined);
    const urlVal = readField($, $el, parse.url, "href");
    const numText = readField($, $el, parse.number, undefined);
    const number = extractNumber(numText, name, i, parse);
    episodes.push({
      number,
      name: name.trim(),
      url: resolveLink(urlVal, ext.source.baseUrl),
      scanlator: readField($, $el, parse.scanlator, undefined).trim(),
      date: readField($, $el, parse.date, undefined).trim(),
    });
  });

  if (episodes.length === 0) {
    warnings.push(
      `episode itemSelector "${parse.itemSelector}" matched 0 elements.`,
    );
  }

  return { episodes, fetch, warnings };
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function readField(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<unknown>,
  selector: string,
  attr: string | undefined,
): string {
  if (!selector) return "";
  // selector may be a descendant of the item, or a tag name relative to item
  let $target = $el.find(selector).first();
  if (!$target.length) {
    // try the element itself if selector matches it
    if ($el.is(selector)) $target = $el;
  }
  if (!$target.length) return "";
  if (attr && attr !== "text") {
    return $target.attr(attr) ?? "";
  }
  // default: try "abs:href" semantics then text
  if (attr === "href" || selector === "a") {
    return $target.attr("href") ?? $target.text();
  }
  return $target.text();
}

function resolveLink(href: string, baseUrl: string): string {
  if (!href) return "";
  if (/^https?:\/\//.test(href)) return href;
  if (href.startsWith("//")) return "https:" + href;
  const base = baseUrl.replace(/\/$/, "");
  if (href.startsWith("/")) return base + href;
  return base + "/" + href;
}

function extractNumber(
  numText: string,
  name: string,
  index: number,
  parse: EpisodesParse,
): number {
  if (parse.numberExtraction === "index") return index + 1;
  const text = numText || name;
  if (parse.numberExtraction === "regex" && parse.numberRegex) {
    const m = new RegExp(parse.numberRegex).exec(text);
    if (m) return parseFloat(m[1]);
  }
  // fallback: first number in text
  const m = /(\d+(?:\.\d+)?)/.exec(text);
  return m ? parseFloat(m[1]) : index + 1;
}

function mapStatus(
  raw: string,
  mapping: DetailsConfig["statusMapping"],
): string {
  const lower = raw.toLowerCase();
  if (mapping.ongoing.some((s) => lower.includes(s.toLowerCase()))) return "ONGOING";
  if (mapping.completed.some((s) => lower.includes(s.toLowerCase()))) return "COMPLETED";
  if (mapping.canceled.some((s) => lower.includes(s.toLowerCase()))) return "CANCELED";
  if (mapping.onHiatus.some((s) => lower.includes(s.toLowerCase()))) return "ON_HIATUS";
  return raw || "UNKNOWN";
}

function emptyDetails() {
  return {
    title: "",
    description: "",
    thumbnail: "",
    author: "",
    artist: "",
    genre: "",
    status: "UNKNOWN",
    extras: {},
  };
}

function fail(msg: string): BrowseResult {
  return {
    items: [],
    page: 1,
    hasNextPage: false,
    fetch: { ok: false, status: 0, url: "", html: "", contentType: "", error: msg },
    warnings: [msg],
  };
}
