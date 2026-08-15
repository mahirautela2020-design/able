import { NextRequest, NextResponse } from "next/server";
import { validateHostSync } from "@/lib/ssrf";
import { ABLE_INSPECT_BRIDGE_SCRIPT } from "@/lib/explore/bridge-script";

/**
 * Preview proxy — the "iframes can't load X-Frame-Options sites" hack.
 *
 * Instead of framing the target directly (browser enforces XFO/CSP and
 * refuses), we fetch the page SERVER-SIDE through our own origin. The
 * iframe sees OUR response — which carries no x-frame-options / CSP
 * frame-ancestors — so the browser renders it. This is how VS Code /
 * Claude / Codex-style previews work: the network layer is ours, not the
 * browser's.
 *
 * SSRF-guarded: validateHostSync blocks private IPs + dangerous hosts.
 * The response is same-origin proxied HTML with <base href> injected so
 * subresources (css/js/img) load from the real site.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url query param required" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return NextResponse.json({ error: "Only http(s) URLs supported" }, { status: 400 });
    }
    validateHostSync(target.hostname);
  } catch (e) {
    return NextResponse.json(
      { error: `URL rejected: ${(e as Error).message}` },
      { status: 400 }
    );
  }

  try {
    const browserUa =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

    const res = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": browserUa,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        // A same-origin-looking navigation reduces false-positive WAF/bot
        // rejections on sites that check these — this is still a bounded
        // fidelity improvement, not an attempt to defeat real bot
        // detection (Cloudflare/Akamai challenge pages etc. will still
        // never render through any server-side proxy, and that's fine).
        referer: `${target.origin}/`,
        "sec-fetch-mode": "navigate",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream ${res.status} ${res.statusText}` },
        { status: 502 }
      );
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json(
        { error: "Only HTML pages can be proxied for preview" },
        { status: 415 }
      );
    }

    let html = await res.text();

    // Guard against runaway pages — 5MB cap.
    if (html.length > 5_000_000) {
      return NextResponse.json({ error: "Page too large to preview" }, { status: 413 });
    }

    // Inject <base href> so relative/absolute subresources resolve against
    // the REAL site (we only proxy the document; assets load directly).
    // A site's own <base> tag is usually a relative or path-only href
    // (meant to be resolved against ITS OWN url, not ours) — leaving that
    // as-is under our proxy origin resolves every relative asset wrong.
    // Only keep an existing tag if it's already a valid absolute URL.
    const origin = target.origin;
    // Match any existing <base> tag (with or without href — e.g. a
    // target="_blank"-only base is valid HTML) so we replace it in place
    // rather than leaving it and inserting a second <base>.
    const baseMatch = html.match(/<base\b[^>]*>/i);
    const baseHrefMatch = baseMatch ? baseMatch[0].match(/href=["']([^"']*)["']/i) : null;
    // Protocol-relative hrefs ("//cdn.example.com/") are also valid
    // absolute-host URLs, not just http(s)://.
    const hasValidAbsoluteBase = !!baseHrefMatch && /^(https?:)?\/\//i.test(baseHrefMatch[1]);
    if (!hasValidAbsoluteBase) {
      const newBaseTag = `<base href="${origin}/">`;
      if (baseMatch) {
        html = html.replace(baseMatch[0], newBaseTag);
      } else if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, `<head$1>${newBaseTag}`);
      } else if (/<html[^>]*>/i.test(html)) {
        // Malformed page with no <head> at all — still inject one so
        // relative assets don't silently resolve against our own origin.
        html = html.replace(/<html([^>]*)>/i, `<html$1><head>${newBaseTag}</head>`);
      } else {
        html = `<head>${newBaseTag}</head>${html}`;
      }
    }

    // Make our response iframe-able: we simply don't set the blocking
    // headers. Also strip any CSP meta tags that would re-block framing.
    html = html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "");

    // Relay same-origin fetch/XHR calls through /api/preview-proxy-asset —
    // the page's own hydration JS still runs in-browser and calls back to
    // its own API with relative/absolute-same-origin URLs, which the
    // target's CORS policy rejects since the caller is now our origin, not
    // theirs. Rewriting those specific calls to our asset relay (same-origin
    // to the iframe, so no CORS involved) fixes client-rendered widgets that
    // otherwise render as empty placeholders. Must run before any other
    // script, so it's injected as the very first thing in <head>.
    // RELAY must be an absolute URL rooted at OUR origin. A relative path
    // like "/api/preview-proxy-asset" would resolve against the <base href>
    // we just injected (the TARGET's origin), sending the "relayed" request
    // straight back to the target itself — the exact CORS failure this
    // exists to avoid.
    const proxyOrigin = request.nextUrl.origin;
    const assetBridge = `<script>(function(){
      var TARGET_ORIGIN=${JSON.stringify(origin)};
      var RELAY=${JSON.stringify(`${proxyOrigin}/api/preview-proxy-asset`)};
      function sameOrigin(u){try{return new URL(u,TARGET_ORIGIN).origin===TARGET_ORIGIN;}catch(e){return false;}}
      function relayUrl(u){return RELAY+"?url="+encodeURIComponent(new URL(u,TARGET_ORIGIN).toString());}
      var origFetch=window.fetch;
      if(origFetch){
        window.fetch=function(input,init){
          var url=typeof input==="string"?input:(input&&input.url);
          if(url&&sameOrigin(url)&&url.indexOf(RELAY)!==0){
            return origFetch(relayUrl(url),init);
          }
          return origFetch(input,init);
        };
      }
      var OrigXHR=window.XMLHttpRequest;
      if(OrigXHR){
        var origOpen=OrigXHR.prototype.open;
        OrigXHR.prototype.open=function(method,url){
          var args=Array.prototype.slice.call(arguments);
          if(typeof url==="string"&&sameOrigin(url)&&url.indexOf(RELAY)!==0){
            args[1]=relayUrl(url);
          }
          return origOpen.apply(this,args);
        };
      }
      // Analytics/martech libs commonly inject <script>/<link> tags at
      // runtime (document.createElement + .src=, often with
      // crossOrigin="anonymous" for SRI) instead of shipping them in the
      // static HTML — those never pass through the server-side rewrite
      // above, so patch the src/href property setters directly.
      function patchUrlProp(proto, prop){
        var desc=Object.getOwnPropertyDescriptor(proto,prop);
        if(!desc||!desc.set||!desc.get) return;
        Object.defineProperty(proto,prop,{
          configurable:true,
          enumerable:desc.enumerable,
          get:desc.get,
          set:function(v){
            if(typeof v==="string"&&sameOrigin(v)&&v.indexOf(RELAY)!==0){
              v=relayUrl(v);
            }
            return desc.set.call(this,v);
          }
        });
      }
      if(window.HTMLScriptElement) patchUrlProp(window.HTMLScriptElement.prototype,"src");
      if(window.HTMLLinkElement) patchUrlProp(window.HTMLLinkElement.prototype,"href");
      var origSetAttribute=Element.prototype.setAttribute;
      Element.prototype.setAttribute=function(name,value){
        var tag=this.tagName;
        if((tag==="SCRIPT"&&name==="src")||(tag==="LINK"&&name==="href")){
          if(typeof value==="string"&&sameOrigin(value)&&value.indexOf(RELAY)!==0){
            value=relayUrl(value);
          }
        }
        return origSetAttribute.call(this,name,value);
      };
    })();</script>`;
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head([^>]*)>/i, `<head$1>${assetBridge}`);
    } else if (/<html[^>]*>/i.test(html)) {
      html = html.replace(/<html([^>]*)>/i, `<html$1><head>${assetBridge}</head>`);
    } else {
      html = `<head>${assetBridge}</head>${html}`;
    }

    // ES module scripts (<script type="module" src="...">) enforce CORS on
    // load, same as fetch/XHR — the in-page bridge above can't intercept the
    // browser's own <script> fetch, so rewrite these src attributes to the
    // asset relay server-side. Classic (non-module) scripts are exempt from
    // CORS and load fine directly, so they're left alone.
    html = html.replace(
      /<script\b([^>]*\btype=["']module["'][^>]*)>/gi,
      (fullTag, attrs: string) => {
        const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
        if (!srcMatch) return fullTag;
        try {
          const abs = new URL(srcMatch[1], origin).toString();
          const relayed = `${proxyOrigin}/api/preview-proxy-asset?url=${encodeURIComponent(abs)}`;
          return `<script${attrs.replace(srcMatch[0], `src="${relayed}"`)}>`;
        } catch {
          return fullTag;
        }
      }
    );

    // <link rel="preload"/"modulepreload"> are pure performance hints, but
    // the browser's own preloader fetches them immediately and directly —
    // it never goes through fetch/XHR or the script/link element property
    // setters, so nothing above can intercept or relay it. A cross-origin
    // preload (especially with crossorigin set, which most modulepreload/
    // font preloads carry) just CORS-fails outright. Drop the hint entirely
    // instead: the real resource still loads normally via the actual
    // <script>/<link rel=stylesheet> tag (already relayed above), just
    // without the early-fetch performance benefit — irrelevant here.
    html = html.replace(/<link\b[^>]*\brel=["'](?:preload|modulepreload)["'][^>]*>/gi, "");

    // Stylesheets themselves load fine cross-origin (no CORS gate on <link
    // rel=stylesheet>), but cross-origin @font-face inside them IS CORS-
    // gated in every browser — a plain direct load would fetch the CSS but
    // then silently fail every custom webfont it declares, falling back to
    // system fonts. Route through the asset relay, which rewrites the CSS's
    // own url()/@import references to stay CORS-free recursively.
    html = html.replace(
      /<link\b([^>]*\brel=["']stylesheet["'][^>]*)>/gi,
      (fullTag, attrs: string) => {
        const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
        if (!hrefMatch) return fullTag;
        try {
          const abs = new URL(hrefMatch[1], origin).toString();
          const relayed = `${proxyOrigin}/api/preview-proxy-asset?url=${encodeURIComponent(abs)}`;
          return `<link${attrs.replace(hrefMatch[0], `href="${relayed}"`)}>`;
        } catch {
          return fullTag;
        }
      }
    );

    // Contrast Lab / Explore: give proxied pages the same __ableInspect
    // bridge the bundled demo fixture exposes, so click-to-inspect works
    // against the real audited page, not just public/explore-demo.html.
    const bridgeTag = `<script>${ABLE_INSPECT_BRIDGE_SCRIPT}</script>`;
    html = /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, `${bridgeTag}</body>`)
      : html + bridgeTag;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        // Allow our own workbench to frame this proxied page.
        "x-frame-options": "SAMEORIGIN",
        "content-security-policy": "frame-ancestors 'self' http://localhost:3000 https://scana11y-nine.vercel.app",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Preview proxy failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
