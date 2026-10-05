import { useEffect, useRef, useState, type RefObject } from "react";
import { createFirstScene, type FirstScene } from "./scene";
import type { SceneTarget } from "./sceneState";
import { Still } from "./Still";

type Renderer = "pending" | "webgl" | "still";

export interface SceneControl {
  /** Ends a scene change in progress at once. */
  finish(): void;
}

/**
 * The scene layer: the WebGL canvas, or the still picture when WebGL is unavailable.
 * Decoration only. It ignores the pointer and is hidden from assistive technology; every
 * word the journey says is in the text panel.
 */
export function Scene({
  target,
  animate,
  control,
}: {
  target: SceneTarget;
  animate: boolean;
  control: RefObject<SceneControl | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<FirstScene | null>(null);
  const targetRef = useRef(target);
  targetRef.current = target;
  const [renderer, setRenderer] = useState<Renderer>("pending");
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = createFirstScene(canvas, {
      animate,
      onUnavailable: () => setRenderer("still"),
      onAvailable: () => setRenderer("webgl"),
    });
    if (!scene) {
      setRenderer("still");
      return;
    }
    sceneRef.current = scene;
    control.current = { finish: () => scene.finish() };
    setRenderer("webgl");
    scene.setTarget(targetRef.current);
    return () => {
      scene.destroy();
      sceneRef.current = null;
      control.current = null;
    };
  }, [animate, control]);

  useEffect(() => {
    sceneRef.current?.setTarget(target);
  }, [target]);

  return (
    <div ref={wrapRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 h-full w-full ${renderer === "webgl" ? "" : "invisible"}`}
      />
      {renderer === "still" && <Still target={target} width={size.w} height={size.h} />}
    </div>
  );
}
