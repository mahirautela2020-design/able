"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/** useLayoutEffect warns during SSR; the landing page is server-rendered, so
 * pick the effect that matches the environment. Layout timing matters here:
 * the initial hidden state is set from JS (never from CSS) so a visitor
 * without JavaScript sees the whole page, and setting it before paint is what
 * keeps that from flashing. */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Exponential ease out, per the house motion rule. No bounce, no elastic. */
const EASE = "expo.out";

/**
 * Motion for the landing page. Renders nothing; it animates elements the page
 * marks with `data-anim` attributes, so the markup stays a server component
 * and the page reads as content rather than as a pile of animation wrappers.
 */
export function LandingMotion() {
  const started = useRef(false);

  useIsomorphicLayoutEffect(() => {
    if (started.current) return;
    started.current = true;

    const mm = gsap.matchMedia();

    // Reduced motion is not a degraded experience here, it is the correct one.
    // An accessibility product that ignores the preference fails its own
    // premise. Everything lands in its final state, immediately.
    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(
        "[data-anim], [data-rule], [data-stagger] > *",
        { clearProps: "all", opacity: 1, y: 0, scaleX: 1, scaleY: 1 }
      );
    });

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        // Start from a genuinely clean slate. React runs effects twice in dev,
        // and HMR re-runs them again; each pass would otherwise find the
        // inline transform left by the previous pass and adopt it as the
        // element's baseline, so a `yPercent: 0` tween resolved to "back where
        // the last run hid it" and the headline never appeared. Killing
        // in-flight tweens and clearing inline props first makes every run
        // idempotent.
        const animated = gsap.utils.toArray<HTMLElement>(
          '[data-anim], [data-rule], [data-stagger] > *'
        );
        gsap.killTweensOf(animated);
        gsap.set(animated, { clearProps: "all" });

        // ── Hero ──────────────────────────────────────────────────────────
        const heroLines = gsap.utils.toArray<HTMLElement>('[data-anim="hero-line"]');
        gsap.set(heroLines, { yPercent: 110 });
        gsap.set('[data-anim="hero-sub"], [data-anim="hero-cta"]', { opacity: 0, y: 18 });
        gsap.set('[data-anim="hero-panel"]', { opacity: 0, y: 28 });

        const intro = gsap.timeline({ defaults: { ease: EASE } });
        intro
          .to(heroLines, { yPercent: 0, duration: 1.1, stagger: 0.07 })
          .to('[data-anim="hero-sub"]', { opacity: 1, y: 0, duration: 0.8 }, "-=0.7")
          .to('[data-anim="hero-cta"]', { opacity: 1, y: 0, duration: 0.8 }, "-=0.6")
          .to('[data-anim="hero-panel"]', { opacity: 1, y: 0, duration: 1 }, "-=0.75");

        // ── The specimen panel tells the product's story in three beats:
        //    sweep the page, lock onto the failing element, name the criterion.
        const scan = document.querySelector('[data-anim="scan"]');
        if (scan) {
          gsap.set(scan, { opacity: 0, top: 0 });
          intro
            .to(scan, { opacity: 1, duration: 0.2 }, "-=0.4")
            .to(scan, { top: "100%", duration: 1.1, ease: "power2.inOut" })
            .to(scan, { opacity: 0, duration: 0.25 }, "-=0.15");
        }

        gsap.set('[data-anim="target"]', { opacity: 0, scale: 1.12 });
        gsap.set('[data-anim="verdict"] > *', { opacity: 0, y: 10 });
        intro
          .to('[data-anim="target"]', {
            opacity: 1,
            scale: 1,
            duration: 0.7,
            ease: EASE,
            transformOrigin: "center",
          })
          .to(
            '[data-anim="verdict"] > *',
            { opacity: 1, y: 0, duration: 0.6, stagger: 0.08 },
            "-=0.4"
          );

        // The hero's initial state is set from JS, so nothing may leave it
        // hidden. A tab opened in the background throttles requestAnimationFrame
        // to a crawl, which would strand the headline and the audit form
        // mid-reveal until the visitor focused the tab; a slow device or a
        // stalled ticker does the same. Skip straight to the end in that case,
        // and keep a failsafe for everything else. Content never waits on a
        // flourish.
        if (document.visibilityState !== "visible") {
          intro.progress(1);
        }
        const failsafe = window.setTimeout(() => {
          if (intro.progress() < 1) intro.progress(1);
        }, 6000);
        intro.eventCallback("onComplete", () => window.clearTimeout(failsafe));

        // ── Section rules draw themselves in ──────────────────────────────
        gsap.utils.toArray<HTMLElement>("[data-rule]").forEach((rule) => {
          gsap.fromTo(
            rule,
            { scaleX: 0 },
            {
              scaleX: 1,
              duration: 1.1,
              ease: EASE,
              scrollTrigger: { trigger: rule, start: "top 88%" },
            }
          );
        });

        // ── Section headings ──────────────────────────────────────────────
        gsap.utils.toArray<HTMLElement>('[data-anim="head"]').forEach((head) => {
          gsap.fromTo(
            head,
            { opacity: 0, y: 20 },
            {
              opacity: 1,
              y: 0,
              duration: 0.9,
              ease: EASE,
              scrollTrigger: { trigger: head, start: "top 88%" },
            }
          );
        });

        // ── Any group marked data-stagger reveals its children in sequence ─
        gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((group) => {
          gsap.fromTo(
            Array.from(group.children),
            { opacity: 0, y: 22 },
            {
              opacity: 1,
              y: 0,
              duration: 0.8,
              ease: EASE,
              stagger: 0.06,
              scrollTrigger: { trigger: group, start: "top 85%" },
            }
          );
        });

        // ── Compliance matrix: 87 cells fill in as the section scrolls past,
        //    scrubbed so the reader controls the sweep.
        const matrix = document.querySelector('[data-anim="matrix"]');
        if (matrix) {
          gsap.fromTo(
            Array.from(matrix.children),
            { opacity: 0.08, scale: 0.6 },
            {
              opacity: 1,
              scale: 1,
              duration: 0.4,
              ease: "power1.out",
              stagger: { amount: 0.9, from: "start" },
              scrollTrigger: {
                trigger: matrix,
                start: "top 82%",
                end: "bottom 55%",
                scrub: 0.6,
              },
            }
          );
        }

        // ── A progress line runs down the inputs list as you read it ───────
        const track = document.querySelector<HTMLElement>('[data-anim="track"]');
        const trackHost = track?.parentElement;
        if (track && trackHost) {
          gsap.fromTo(
            track,
            { scaleY: 0 },
            {
              scaleY: 1,
              ease: "none",
              scrollTrigger: {
                trigger: trackHost,
                start: "top 65%",
                end: "bottom 75%",
                scrub: 0.4,
              },
            }
          );
        }
      });

      return () => ctx.revert();
    });

    return () => {
      mm.revert();
      // revert() restores GSAP's recorded values, but anything it cannot
      // account for must not survive as a hidden element.
      gsap.set('[data-anim], [data-rule], [data-stagger] > *', {
        clearProps: "all",
      });
      started.current = false;
    };
  }, []);

  return null;
}
