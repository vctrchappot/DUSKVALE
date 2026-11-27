import { World } from './world.ts';

const workerWorld = new World();

self.onmessage = (ev: MessageEvent<{ cx: number; cy: number }>) => {
  const { cx, cy } = ev.data;
  const chunk = workerWorld.chunk(cx, cy);
  self.postMessage(
    {
      cx: chunk.cx,
      cy: chunk.cy,
      type: chunk.type,
      shade: chunk.shade,
      elev: chunk.elev,
      solid: chunk.solid,
      objs: chunk.objs,
      feats: chunk.feats,
    },
    // Transferable buffers for zero-copy handoff
    [chunk.type.buffer, chunk.shade.buffer, chunk.elev.buffer, chunk.solid.buffer] as unknown as WindowPostMessageOptions,
  );
};
